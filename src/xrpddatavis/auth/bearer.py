from fastapi import HTTPException, Request, status
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from fastapi.security import OAuth2
from fastapi.security.utils import get_authorization_scheme_param

from .config import Config

"""This scheme extracts the authorisation token from a cookie. If that
is not present, then it falls back into checking for one inside an authorisation
header."""


class OAuth2PasswordBearerCookie(OAuth2):
    def __init__(
        self,
        token_url: str,
        scheme_name: str | None = None,
        scopes: dict | None = None,
    ):
        if not scopes:
            scopes = {}
        flows = OAuthFlowsModel(password={"tokenUrl": token_url, "scopes": scopes})
        super().__init__(flows=flows, scheme_name=scheme_name, auto_error=True)

    async def __call__(self, request: Request) -> str | None:
        token = request.cookies.get(Config.auth.cookie_key)

        if token is not None:
            return token

        authorization = request.headers.get("Authorization")
        scheme, param = get_authorization_scheme_param(authorization)

        if scheme != "Bearer" or not param:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
            )

        return param
