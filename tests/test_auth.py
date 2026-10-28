"""The server's access-token check, against the stand-in Keycloak in
conftest.py."""

import time
from urllib.parse import unquote

import jwt
import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

from conftest import AUDIENCE, DISCOVERY, ISSUER, OTHER_KEY, token, xye
from xrpddatavis.auth import oidc
from xrpddatavis.auth.oidc import OIDCProvider, access_token, current_user
from xrpddatavis.config import AuthConfig, Config
from xrpddatavis.endpoints import HEALTH_ROUTE, INFO, LIVEPLOTS, PLOT, UI, USER
from xrpddatavis.server import start_api


def bearer(value: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


@pytest.fixture
def auth_client(config: Config, fake_keycloak):
    config.auth.enabled = True
    config.auth.issuer = ISSUER
    config.auth.client_audience = AUDIENCE
    with TestClient(start_api(config)) as test_client:
        yield test_client


def test_valid_token_is_accepted(auth_client):
    response = auth_client.get(LIVEPLOTS, headers=bearer(token()))
    assert response.status_code == 200


def test_user_comes_from_the_token(auth_client):
    response = auth_client.get(USER, headers=bearer(token()))
    assert response.json() == {
        "fedid": "abc12345",
        "name": "Ada Lovelace",
        "email": "ada@example.ac.uk",
    }


def test_missing_token_is_rejected(auth_client):
    response = auth_client.get(LIVEPLOTS)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_anyone_can_post_a_plot(auth_client):
    response = auth_client.post(PLOT, json=xye("a"))
    assert response.status_code == 201
    # but reading it back still needs a login
    assert auth_client.get(f"{PLOT}/{response.json()['id']}").status_code == 401


@pytest.mark.parametrize(
    "bad_token",
    [
        pytest.param(token(key=OTHER_KEY), id="wrong-signature"),
        pytest.param(token(aud="some-other-app"), id="wrong-audience"),
        pytest.param(token(iss="https://evil.example.com"), id="wrong-issuer"),
        pytest.param(token(exp=int(time.time()) - 60), id="expired"),
        pytest.param("not-a-jwt", id="garbage"),
    ],
)
def test_invalid_tokens_are_rejected(auth_client, bad_token):
    response = auth_client.get(LIVEPLOTS, headers=bearer(bad_token))
    assert response.status_code == 401
    assert response.json()["detail"].startswith("Invalid access token")


def test_token_without_fedid_is_forbidden_from_user(auth_client):
    """e.g. a service account: fine for the data routes, but not a person."""
    headers = bearer(token(fedid=None))
    assert auth_client.get(LIVEPLOTS, headers=headers).status_code == 200
    assert auth_client.get(USER, headers=headers).status_code == 403


@pytest.mark.parametrize("route", [HEALTH_ROUTE, UI])
def test_open_routes_need_no_token(auth_client, route):
    assert auth_client.get(route).status_code == 200


def test_info_gives_a_logout_url_through_oauth2_proxy(auth_client):
    logout_url = auth_client.get(INFO, headers=bearer(token())).json()["logout_url"]
    path, rd = logout_url.split("?rd=")
    assert path == "/oauth2/sign_out"
    assert unquote(rd) == DISCOVERY["end_session_endpoint"]


def test_user_is_no_content_when_auth_is_off(client):
    assert client.get(USER).status_code == 204


def test_well_known_url_is_derived_from_the_issuer():
    config = Config.model_validate({"auth": {"issuer": ISSUER + "/"}})
    assert config.auth.well_known_url == (f"{ISSUER}/.well-known/openid-configuration")


def test_unreachable_identity_provider_keys_give_503(
    config: Config, fake_keycloak, monkeypatch
):
    def unreachable(self):
        raise jwt.PyJWKClientConnectionError("connection refused")

    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", unreachable)
    config.auth.enabled = True
    config.auth.issuer = ISSUER
    config.auth.client_audience = AUDIENCE
    with TestClient(start_api(config)) as client:
        response = client.get(LIVEPLOTS, headers=bearer(token()))
    assert response.status_code == 503


@pytest.mark.parametrize("dependency", [current_user, access_token])
def test_user_and_token_need_the_token_check(dependency):
    """e.g. used on a route that isn't behind the token check"""
    with pytest.raises(HTTPException) as error:
        dependency(Request({"type": "http", "headers": []}))
    assert error.value.status_code == 401


def test_discovery_document_is_fetched_from_the_issuer(monkeypatch):
    fetched = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return DISCOVERY

    def fake_get(url, timeout):
        fetched.append(url)
        return Response()

    monkeypatch.setattr(oidc.requests, "get", fake_get)
    provider = OIDCProvider(AuthConfig(issuer=ISSUER))
    assert provider.jwks_uri == DISCOVERY["jwks_uri"]
    assert provider.issuer == ISSUER
    assert fetched == [f"{ISSUER}/.well-known/openid-configuration"]
