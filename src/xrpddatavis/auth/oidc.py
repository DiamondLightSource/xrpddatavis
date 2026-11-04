"""Checks the access tokens oauth2-proxy forwards to the server.

oauth2-proxy (deployed alongside the app by the Helm chart) runs the Keycloak
login and adds ``Authorization: Bearer <access token>`` to every request it
passes on. The token is a JWT signed by Keycloak, so the server can verify it
locally against Keycloak's published public keys (the JWKS) - no call to
Keycloak per request, and the server never needs the client secret. This is
the same approach BlueAPI takes.
"""

from functools import cached_property
from typing import Annotated, Any
from urllib.parse import quote

import jwt
import requests
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from xrpddatavis.config import AuthConfig


class User(BaseModel):
    """Who made a request, read from their verified access token."""

    fedid: str
    name: str | None = None
    email: str | None = None


class OIDCProvider:
    """The parts of the issuer's discovery document the server needs.

    Fetched once, the first time anything here is used.
    """

    def __init__(self, config: AuthConfig):
        self.config = config

    @cached_property
    def _discovery(self) -> dict[str, Any]:
        response = requests.get(self.config.well_known_url, timeout=10)
        response.raise_for_status()
        return response.json()

    @property
    def issuer(self) -> str:
        return self._discovery["issuer"]

    @property
    def jwks_uri(self) -> str:
        return self._discovery["jwks_uri"]

    @property
    def end_session_endpoint(self) -> str:
        return self._discovery["end_session_endpoint"]

    @property
    def logout_url(self) -> str:
        """oauth2-proxy's sign-out, then on to Keycloak's to end that session
        too - otherwise the next visit would log straight back in."""
        end_session = quote(self.end_session_endpoint, safe="")
        return f"{self.config.logout_redirect_endpoint}?rd={end_session}"


# also marks the routes that use it with a padlock in the /docs page
bearer = HTTPBearer(
    auto_error=False,
    description="Keycloak access token - added by oauth2-proxy when deployed",
)


def _unauthorised(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def build_access_token_check(provider: OIDCProvider):
    """A dependency that rejects any request without a valid access token,
    and keeps the verified claims on ``request.state`` for ``current_user``."""

    # caches the signing keys, refetching only when a token names a new one
    jwks = jwt.PyJWKClient(provider.jwks_uri)

    def check_access_token(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> None:
        if credentials is None:
            raise _unauthorised("Not authenticated")
        token = credentials.credentials

        try:
            signing_key = jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                # only the algorithm of the key Keycloak signed with, so a
                # token can't pick a weaker one for itself
                algorithms=[signing_key.algorithm_name],
                audience=provider.config.client_audience,
                issuer=provider.issuer,
            )
        except jwt.PyJWKClientConnectionError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Could not fetch the identity provider's keys: {error}",
            ) from error
        except jwt.PyJWTError as error:
            raise _unauthorised(f"Invalid access token: {error}") from error

        request.state.access_token = token
        request.state.claims = claims

    return check_access_token


def current_user(request: Request) -> User:
    """The user behind the request. Only usable on routes behind the token
    check, i.e. when ``auth.enabled`` is true."""
    claims: dict[str, Any] | None = getattr(request.state, "claims", None)
    if claims is None:
        raise _unauthorised("Not authenticated")

    fedid = claims.get("fedid")
    if not fedid:
        # a valid token, but not one for a person - e.g. a service account
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access token does not identify a user (no fedid claim)",
        )
    return User(fedid=fedid, name=claims.get("name"), email=claims.get("email"))


def access_token(request: Request) -> str:
    """The raw access token, e.g. to call another service as the user."""
    token: str | None = getattr(request.state, "access_token", None)
    if token is None:
        raise _unauthorised("Not authenticated")
    return token


# use these as endpoint parameters, e.g. `async def f(user: CurrentUser)`
CurrentUser = Annotated[User, Depends(current_user)]
AccessToken = Annotated[str, Depends(access_token)]
