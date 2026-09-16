import pytest
from fastapi.testclient import TestClient

from xrpddatavis.config import Config
from xrpddatavis.server import start_api


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
