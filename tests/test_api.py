import asyncio
import logging
import re

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from conftest import backdate, xye
from xrpddatavis import server
from xrpddatavis.config import Config
from xrpddatavis.endpoints import (
    CLEAR_PLOTS,
    HEALTH_ROUTE,
    INFO,
    LIMITS,
    LIVEPLOTS,
    PLOT,
    UI,
)
from xrpddatavis.server import start_api
from xrpddatavis.store import PlotStore


def test_health(client):
    assert client.get(HEALTH_ROUTE).json() == {"status": "ok"}


def test_limits_come_from_config(client):
    assert client.get(LIMITS).json() == {"max_plots": 3, "ttl_seconds": 60}


def test_info_reports_the_beamline(client):
    assert client.get(INFO).json() == {"beamline": "i11", "logout_url": ""}


def test_info_beamline_defaults_to_empty_string():
    with TestClient(start_api(Config())) as blank_client:
        assert blank_client.get(INFO).json() == {"beamline": "", "logout_url": ""}


def test_frontend_is_served(client):
    """The Vite-built React app (see frontend/) loads, and its bundle is servable."""
    response = client.get(UI)
    assert response.status_code == 200
    assert "xrpddatavis" in response.text

    match = re.search(r'src="(/static/assets/[^"]+\.js)"', response.text)
    assert match, (
        "index.html has no bundled script tag - was `npm run build` run in frontend/?"
    )
    assert client.get(match.group(1)).status_code == 200


def test_post_plain_dataplot(client):
    response = client.post(PLOT, json=xye("sample-001"))
    assert response.status_code == 201
    body = response.json()
    assert body["plotted"] is True
    assert body["name"] == "sample-001"
    assert body["evicted"] == []

    listed = client.get(LIVEPLOTS).json()
    assert [plot["name"] for plot in listed["plots"]] == ["sample-001"]
    assert listed["max_plots"] == 3
    summary = listed["plots"][0]
    assert summary["points"] == 5
    assert summary["has_errors"] is False
    assert summary["has_fit"] is False
    assert 0 < summary["ttl_remaining_seconds"] <= 60


def test_post_fitted_dataplot(client):
    response = client.post(
        PLOT,
        json=xye(
            "sample-002",
            e=[1.0] * 5,
            filenumber=7,
            x_label="2theta",
            plot_type="scatter",
            calc=[0.0, 0.9, 4.1, 8.8, 16.2],
        ),
    )
    assert response.status_code == 201
    plot_id = response.json()["id"]

    summary = client.get(LIVEPLOTS).json()["plots"][0]
    assert summary["has_errors"] is True
    assert summary["has_fit"] is True
    assert summary["filenumber"] == 7
    assert summary["plot_type"] == "scatter"

    full = client.get(f"/plot/{plot_id}").json()
    assert full["data"]["e"] == [1.0] * 5
    assert full["data"]["x_label"] == "2theta"
    assert full["data"]["calc"] == [0.0, 0.9, 4.1, 8.8, 16.2]


def test_fitted_dataplot_carries_diff_background_and_markers(client):
    response = client.post(
        PLOT,
        json=xye(
            "sample-003",
            calc=[0.1, 0.9, 4.2, 8.7, 16.1],
            diff=[-0.1, 0.1, -0.2, 0.3, -0.1],
            background=5.0,
            markers=[1.5, 2.5, 3.5],
        ),
    )
    assert response.status_code == 201
    plot_id = response.json()["id"]

    full = client.get(f"/plot/{plot_id}").json()["data"]
    assert full["diff"] == [-0.1, 0.1, -0.2, 0.3, -0.1]
    assert full["background"] == 5.0
    assert full["markers"] == [1.5, 2.5, 3.5]


def test_data_type_flows_through_summary_and_full_data(client):
    response = client.post(PLOT, json=xye("gr-001", filenumber=3, data_type="gr"))
    assert response.status_code == 201
    plot_id = response.json()["id"]

    summary = client.get(LIVEPLOTS).json()["plots"][0]
    assert summary["data_type"] == "gr"

    full = client.get(f"/plot/{plot_id}").json()
    assert full["data"]["data_type"] == "gr"


def test_data_type_is_optional_and_defaults_to_null(client):
    client.post(PLOT, json=xye("untyped"))
    summary = client.get(LIVEPLOTS).json()["plots"][0]
    assert summary["data_type"] is None


def test_instrument_session_is_derived_from_filepath(client):
    client.post(
        PLOT,
        json=xye("scan", filepath="/dls/i11/data/2026/cm12345-1/scan.xye"),
    )
    summary = client.get(LIVEPLOTS).json()["plots"][0]
    assert summary["instrument_session"] == "cm12345-1"


def test_instrument_session_explicit_value_wins_over_filepath(client):
    client.post(
        PLOT,
        json=xye(
            "scan",
            filepath="/dls/i11/data/2026/cm12345-1/scan.xye",
            instrument_session="mg99999-9",
        ),
    )
    summary = client.get(LIVEPLOTS).json()["plots"][0]
    assert summary["instrument_session"] == "mg99999-9"


def test_instrument_session_is_null_when_unresolvable(client):
    client.post(PLOT, json=xye("no-path"))
    client.post(PLOT, json=xye("odd-path", filepath="/not/a/dls/path.xye"))
    sessions = [p["instrument_session"] for p in client.get(LIVEPLOTS).json()["plots"]]
    assert sessions == [None, None]


def test_data_type_can_be_edited(client):
    plot_id = client.post(PLOT, json=xye("retype-me")).json()["id"]
    edited = client.patch(f"/edit/{plot_id}", json={"data_type": "sq"})
    assert edited.status_code == 200
    assert edited.json()["data_type"] == "sq"


def test_pin_via_edit_protects_from_expiry(client):
    plot_id = client.post(PLOT, json=xye("pin-me")).json()["id"]
    summary = client.get(LIVEPLOTS).json()["plots"][0]
    assert summary["pinned"] is False

    edited = client.patch(f"/edit/{plot_id}", json={"pinned": True})
    assert edited.status_code == 200
    assert edited.json()["pinned"] is True

    backdate(client.app.state.store, plot_id, 120)

    # config fixture sets ttl_seconds=60 - this would normally be long expired
    listed = client.get(LIVEPLOTS).json()["plots"]
    assert len(listed) == 1
    assert listed[0]["pinned"] is True

    client.patch(f"/edit/{plot_id}", json={"pinned": False})
    assert client.get(LIVEPLOTS).json()["plots"] == []


def test_pinned_plot_is_evicted_only_once_everything_else_is_pinned(client):
    # config fixture sets max_plots=3
    ids = [client.post(PLOT, json=xye(f"p{i}")).json()["id"] for i in range(3)]
    client.patch(f"/edit/{ids[0]}", json={"pinned": True})

    # p1 is next-oldest and unpinned, so it is evicted instead of pinned p0
    response = client.post(PLOT, json=xye("p3"))
    assert response.json()["evicted"] == [ids[1]]
    names = {plot["name"] for plot in client.get(LIVEPLOTS).json()["plots"]}
    assert names == {"p0", "p2", "p3"}


def test_mismatched_array_lengths_are_rejected(client):
    response = client.post(PLOT, json={"title": "bad", "x": [1, 2, 3], "y": [1, 2]})
    assert response.status_code == 422
    assert "same length" in response.text


def test_too_many_points_is_rejected(client):
    response = client.post(PLOT, json=xye("huge", points=101))
    assert response.status_code == 413
    assert "max_points" in response.json()["detail"]


def test_max_plots_evicts_the_oldest(client):
    ids = [client.post(PLOT, json=xye(f"p{i}")).json()["id"] for i in range(3)]
    response = client.post(PLOT, json=xye("p3"))
    assert response.json()["evicted"] == [ids[0]]

    names = [plot["name"] for plot in client.get(LIVEPLOTS).json()["plots"]]
    assert names == ["p3", "p2", "p1"]  # newest first, oldest dropped


def test_colours_are_unique_while_slots_are_free(client):
    for i in range(3):
        client.post(PLOT, json=xye(f"p{i}"))
    colours = [plot["colour_index"] for plot in client.get(LIVEPLOTS).json()["plots"]]
    assert sorted(colours) == [0, 1, 2]


def test_upsert_replaces_in_place_and_keeps_identity(client):
    first = client.post(PLOT, json=xye("live-scan")).json()
    second = client.post(PLOT, json=xye("live-scan", points=9, upsert=True)).json()

    assert second["id"] == first["id"]
    plots = client.get(LIVEPLOTS).json()["plots"]
    assert len(plots) == 1
    assert plots[0]["points"] == 9
    assert plots[0]["version"] == 2


def test_edit_and_remove(client):
    plot_id = client.post(PLOT, json=xye("before")).json()["id"]

    edited = client.patch(
        f"/edit/{plot_id}", json={"name": "after", "plot_type": "line+markers"}
    )
    assert edited.status_code == 200
    assert edited.json()["name"] == "after"
    assert edited.json()["plot_type"] == "line+markers"

    assert client.delete(f"/remove/{plot_id}").status_code == 200
    assert client.get(LIVEPLOTS).json()["plots"] == []
    assert client.delete(f"/remove/{plot_id}").status_code == 404
    assert client.get(f"/plot/{plot_id}").status_code == 404


def test_clear_all(client):
    for i in range(3):
        client.post(PLOT, json=xye(f"p{i}"))
    assert client.delete(CLEAR_PLOTS).json() == {"removed": 3}
    assert client.get(LIVEPLOTS).json()["plots"] == []


def test_expired_plots_disappear(client):
    plot_id = client.post(PLOT, json=xye("stale")).json()["id"]

    backdate(client.app.state.store, plot_id, 120)

    assert client.get(LIVEPLOTS).json()["plots"] == []


def test_revision_changes_when_the_store_changes(client):
    start = client.get(LIVEPLOTS).json()["revision"]
    client.post(PLOT, json=xye("p"))
    assert client.get(LIVEPLOTS).json()["revision"] > start


def test_events_stream_revisions_then_keepalives(config: Config, monkeypatch):
    """Called directly: the test client can't end a never-ending stream."""
    monkeypatch.setattr(server, "EVENT_POLL_SECONDS", 0.0)
    monkeypatch.setattr(server, "EVENT_KEEPALIVE_SECONDS", 0.0)
    app = start_api(config)
    checks = 0

    async def receive():
        # the browser stays connected for two checks, then leaves
        nonlocal checks
        checks += 1
        if checks < 3:
            await asyncio.sleep(1)  # still connected
        return {"type": "http.disconnect"}

    async def read_stream() -> list[str]:
        request = Request({"type": "http", "app": app, "headers": []}, receive)
        response = await server.events(request)
        return [str(chunk) async for chunk in response.body_iterator]

    assert asyncio.run(read_stream()) == [
        'data: {"revision": 0}\n\n',
        ": keep-alive\n\n",
    ]
    app.state.store.close()


def test_suppress_polling_logs(config: Config):
    access_log = logging.getLogger("uvicorn.access")
    before = list(access_log.filters)
    config.server.suppress_polling_logs = True
    try:
        app = start_api(config)
        app.state.store.close()
        assert len(access_log.filters) == len(before) + 1
    finally:
        access_log.filters = before


def test_missing_frontend_build_is_reported(config: Config, tmp_path, monkeypatch):
    monkeypatch.setattr(server, "STATIC_DIR", tmp_path)
    # keep hold of the store start_api opens before it fails, to close it
    stores: list[PlotStore] = []
    monkeypatch.setattr(
        server,
        "PlotStore",
        lambda **kwargs: stores.append(PlotStore(**kwargs)) or stores[-1],
    )
    with pytest.raises(RuntimeError, match="Frontend build not found"):
        start_api(config)
    stores[0].close()


def test_cleanup_loop_purges_on_schedule(monkeypatch):
    store = PlotStore(ttl_seconds=60, max_plots=3, db_path=":memory:")
    purges = []
    monkeypatch.setattr(store, "purge_expired", lambda: purges.append(1))

    async def run_briefly():
        task = asyncio.create_task(server._cleanup_loop(store, 0))
        await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run_briefly())
    store.close()
    assert purges
