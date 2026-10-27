import base64
from urllib.parse import quote

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2

from xrpddatavis.auth.bearer import OAuth2PasswordBearerCookie
from xrpddatavis.config import Config


def b64encode(input: str):
    return base64.b64encode(input.encode()).decode()


def _discovery():
    return requests.get(Config.auth.endpoint).json()


"""It is good practice to get your endpoints from a discovery endpoint, rather than
hardcoding them in. That makes it easier to move to different endpoints in the future"""

oidc_endpoints = _discovery()
client_creds = b64encode(":".join([Config.auth.client_id, Config.auth.client_secret]))

"""This scheme extracts the token from the relevant header/cookie. You can add it as a
dependency in order to use it whenever relevant. Note in your documentation (if using
FastAPI) that all endpoints that ultimately require authentication (this scheme) will
be marked as'protected' with a padlock."""
oauth2_scheme: OAuth2 = OAuth2PasswordBearerCookie(
    token_url=oidc_endpoints["token_endpoint"]
)


class Auth:
    """A sample authentication class, containing basic actions"""

    fedid = None

    def __init__(self, token=Depends(oauth2_scheme)):
        """If the application you are developing is not a FastAPI application, and does
        not support dependency injections in a similar way, you can pass tokens
        explicitly, use decorators and other alternatives.

        For example, in Flask, you could use decorators on protected endpoints that
        looks for a token in authorisation headers."""
        self.fedid = self.auth(token)

    @classmethod
    def auth(cls, token: str):
        response = requests.get(
            oidc_endpoints["userinfo_endpoint"],
            headers={"Authorization": f"Bearer {token}"},
        )

        """401, as a HTTP error code, means unauthorised, whilst 403 means forbidden.
        In this context, unauthorised means that the service could not validate your
        identity, forbidden means that while you were authenticated, the service decided
        you should not have access to this resource"""
        if response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user token",
            )

        return response.json().get("id")

    @classmethod
    def get_token(cls, redirect_uri: str, code: str):
        """To get a token in code flow, the user must get a code first.
        That can be done by hitting the authentication endpoint while passing
        'code' as your responseType"""

        endpoint = (
            f"{oidc_endpoints['token_endpoint']}?grant_type=authorization_code"
            f"&code={code}"
            f"&redirect_uri={redirect_uri}"
        )

        response = requests.get(
            endpoint, headers={"Authorization": f"Basic {client_creds}"}
        )
        if response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user code",
            )

        return response.json()

    @classmethod
    def get_auth_redirect(cls, redirect: str, response_type: str):
        """Redirects user to the CAS authentication page. It is up to the redirected
        page to store and manage the token.

        If your application is strictly a CLI interface, you could ask the user to
        enter it later on (or, even better, use device authentication flow)"""
        # TODO: document device authentication flow

        return (
            oidc_endpoints["authorization_endpoint"]
            + f"?response_type={response_type}&client_id={Config.auth.client_id}&redirect_uri="  # noqa: E501
            + quote(redirect)
        )

    @classmethod
    def get_logout_redirect(cls):
        return oidc_endpoints["end_session_endpoint"]
