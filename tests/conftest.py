import time
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm

from xrpddatavis.auth.oidc import OIDCProvider
from xrpddatavis.config import Config
from xrpddatavis.server import start_api
from xrpddatavis.store import PlotStore


@pytest.fixture(autouse=True)
def _isolate_db(tmp_path, monkeypatch):
    """Run each test in a temp dir, so a default ``db_path`` lands there."""
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def config() -> Config:
    return Config.model_validate(
        {
            "beamline": {"name": "i11"},
            "plots": {"max_plots": 3, "ttl_seconds": 60, "max_points": 100},
            "cleanup": {"interval_seconds": 3600},
        }
    )


@pytest.fixture
def client(config: Config):
    with TestClient(start_api(config)) as test_client:
        yield test_client


def xye(title: str, points: int = 5, **extra) -> dict:
    return {
        "title": title,
        "x": [float(i) for i in range(points)],
        "y": [float(i * i) for i in range(points)],
        **extra,
    }


def backdate(store: PlotStore, plot_id: str, seconds: float) -> None:
    """Make a stored plot look ``seconds`` old, e.g. to push it past its ttl."""
    plot = store.get(plot_id)
    assert plot is not None
    plot.created_at = datetime.now(UTC) - timedelta(seconds=seconds)
    with store._transaction() as conn:
        store._save(conn, plot)


# --- a stand-in Keycloak, for the auth tests ---------------------------------

ISSUER = "https://identity.example.ac.uk/realms/dls"
AUDIENCE = "xrpddatavis"
KID = "test-key"

DISCOVERY = {
    "issuer": ISSUER,
    "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
    "end_session_endpoint": f"{ISSUER}/protocol/openid-connect/logout",
}

SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwks() -> dict:
    public = RSAAlgorithm.to_jwk(SIGNING_KEY.public_key(), as_dict=True)
    return {"keys": [{**public, "kid": KID, "alg": "RS256", "use": "sig"}]}


def token(key=SIGNING_KEY, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": now,
        "exp": now + 300,
        "fedid": "abc12345",
        "name": "Ada Lovelace",
        "email": "ada@example.ac.uk",
        **overrides,
    }
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": KID})


@pytest.fixture
def fake_keycloak(monkeypatch):
    """Point the server at a stand-in Keycloak: a key generated here, served
    through a patched discovery document and JWKS."""
    monkeypatch.setattr(OIDCProvider, "_discovery", property(lambda self: DISCOVERY))
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", lambda self: jwks())
