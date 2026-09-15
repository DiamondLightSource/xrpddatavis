from datetime import UTC, datetime, timedelta

from conftest import xye
from xrddatavis.endpoints import (
    CLEAR_PLOTS,
    HEALTH_ROUTE,
    LIMITS,
    LIVEPLOTS,
    PLOT,
    UI,
)


def test_health(client):
    assert client.get(HEALTH_ROUTE).json() == {"status": "ok"}


def test_limits_come_from_config(client):
    assert client.get(LIMITS).json() == {"max_plots": 3, "ttl_seconds": 60}


def test_frontend_is_served(client):
    response = client.get(UI)
    assert response.status_code == 200
    assert "xrddatavis" in response.text
    assert client.get("/static/app.js").status_code == 200


def test_post_bare_xye_data(client):
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


def test_post_wrapped_request_with_fit(client):
    response = client.post(
        PLOT,
        json={
            "data": xye("sample-002", e=[1.0] * 5, filenumber=7, x_label="2theta"),
            "fit": xye("sample-002 fit"),
            "plot_type": "scatter",
        },
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
    assert full["fit"]["name"] == "sample-002 fit"


def test_data_type_flows_through_summary_and_full_data(client):
    response = client.post(
        PLOT,
        json={"data": xye("gr-001", filenumber=3, data_type="gr")},
    )
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

    store = client.app.state.store
    stored = store.get(plot_id)
    stored.created_at = datetime.now(UTC) - timedelta(seconds=120)

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
    response = client.post(PLOT, json={"name": "bad", "x": [1, 2, 3], "y": [1, 2]})
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
    second = client.post(
        PLOT, json={"data": xye("live-scan", points=9), "upsert": True}
    ).json()

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

    store = client.app.state.store
    stale = store.get(plot_id)
    stale.created_at = datetime.now(UTC) - timedelta(seconds=120)

    assert client.get(LIVEPLOTS).json()["plots"] == []


def test_revision_changes_when_the_store_changes(client):
    start = client.get(LIVEPLOTS).json()["revision"]
    client.post(PLOT, json=xye("p"))
    assert client.get(LIVEPLOTS).json()["revision"] > start
