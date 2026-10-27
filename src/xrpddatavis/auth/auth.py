from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from xrpddatavis.auth.oidc import Auth
from xrpddatavis.config import Config


class Unauthorised(BaseModel):
    detail: str


class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    scope: str


router = APIRouter(tags=["Authentication"], responses={401: {"model": Unauthorised}})


@router.get("/authorise", status_code=302, response_class=RedirectResponse)
def authorise_user(redirect_uri: str, response_type: str = "token"):
    """Redirect user to authorisation page"""
    return Auth.get_auth_redirect(redirect_uri, response_type)


@router.get("/token", response_model=Token)
def get_token(redirect_uri: str, code: str, response: Response):
    """Get an access token from a authentication code"""
    user_info = Auth.get_token(redirect_uri, code)

    # Cookie is set automatically in the frontend, nothing needs to be done client-side
    response.set_cookie(
        # The __Host- prefix prevents the cookie from being overwritten by other
        # subdomains
        key=Config.auth.cookie_key,
        value=user_info.get("access_token"),
        # Disallows client-side scripts from accessing the token
        httponly=True,
        # Token is not sent to other domains
        samesite="strict",
        # Does not allow cookie to be sent through connections without TLS
        secure=True,
        # Limits where the cookie is included in the frontend (in this case,
        # matches everything under the root folder
        path="/",
        expires=user_info.get("expires", 28800),
    )

    if "error" in user_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=user_info["error"],
        )

    return user_info


@router.get("/logout", status_code=302, response_class=RedirectResponse)
def logout():
    """Redirect user to logout page"""
    return Auth.get_logout_redirect()


@router.get("/protected")
def protected_endpoint(user=Depends(Auth)):
    """A sample protected endpoint, that requires the user to pass a valid token
    through the authorisation header. Note the 'Auth' dependency"""
    return f"You are {user.fedid}"
