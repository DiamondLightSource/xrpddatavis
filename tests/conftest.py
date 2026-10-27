from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

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
