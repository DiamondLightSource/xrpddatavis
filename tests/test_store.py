from datetime import UTC, datetime, timedelta

import pytest

from xrpddatavis.models import PlotData, PlotUpdate, XYEData
from xrpddatavis.store import PALETTE_SLOTS, ResultStore


def plot(name: str, age_seconds: float = 0.0, pinned: bool = False) -> PlotData:
    created = datetime.now(UTC) - timedelta(seconds=age_seconds)
    return PlotData(
        data=XYEData(name=name, x=[1.0, 2.0], y=[3.0, 4.0]),
        created_at=created,
        pinned=pinned,
    )


def test_add_evicts_oldest_beyond_max_plots():
    store = ResultStore(ttl_seconds=600, max_plots=2)
    oldest = store.add(plot("a", age_seconds=10))[0]
    store.add(plot("b", age_seconds=5))
    _, evicted = store.add(plot("c"))

    assert [item.id for item in evicted] == [oldest.id]
    assert {item.data.name for item in store.list()} == {"b", "c"}


def test_colour_slots_are_reused_once_freed():
    store = ResultStore(ttl_seconds=600, max_plots=10)
    first = store.add(plot("a"))[0]
    second = store.add(plot("b"))[0]
    assert (first.colour_index, second.colour_index) == (0, 1)

    store.remove(first.id)
    third = store.add(plot("c"))[0]
    assert third.colour_index == 0


def test_colour_slots_wrap_when_the_palette_is_full():
    store = ResultStore(ttl_seconds=600, max_plots=PALETTE_SLOTS + 2)
    slots = [store.add(plot(f"p{i}"))[0].colour_index for i in range(PALETTE_SLOTS + 1)]
    assert sorted(slots[:PALETTE_SLOTS]) == list(range(PALETTE_SLOTS))
    assert 0 <= slots[-1] < PALETTE_SLOTS


def test_upsert_keeps_id_and_colour_and_bumps_version():
    store = ResultStore(ttl_seconds=600, max_plots=5)
    store.add(plot("filler"))
    original = store.upsert(plot("scan"))[0]

    replacement = PlotData(
        data=XYEData(name="scan", x=[1.0, 2.0, 3.0], y=[9.0, 9.0, 9.0])
    )
    updated = store.upsert(replacement)[0]

    assert updated.id == original.id
    assert updated.colour_index == original.colour_index
    assert updated.version == 2
    assert len(updated.data.x) == 3
    assert len(store.list()) == 2


def test_purge_expired():
    store = ResultStore(ttl_seconds=30, max_plots=5)
    store.add(plot("fresh"))
    store.add(plot("stale", age_seconds=60))

    assert store.purge_expired() == 1
    assert [item.data.name for item in store.list()] == ["fresh"]


def test_pinned_plots_do_not_expire():
    store = ResultStore(ttl_seconds=30, max_plots=5)
    stale = store.add(plot("stale", age_seconds=60))[0]
    store.update(stale.id, PlotUpdate(pinned=True))

    assert store.purge_expired() == 0
    assert [item.data.name for item in store.list()] == ["stale"]

    store.update(stale.id, PlotUpdate(pinned=False))
    assert store.purge_expired() == 1
    assert store.list() == []


def test_eviction_prefers_unpinned_plots():
    store = ResultStore(ttl_seconds=600, max_plots=2)
    oldest = store.add(plot("a", age_seconds=10))[0]
    store.update(oldest.id, PlotUpdate(pinned=True))
    store.add(plot("b", age_seconds=5))
    _, evicted = store.add(plot("c"))

    # "a" is oldest but pinned, so "b" is evicted in its place
    assert [item.data.name for item in evicted] == ["b"]
    assert {item.data.name for item in store.list()} == {"a", "c"}


def test_eviction_falls_back_to_pinned_plots_once_all_are_pinned():
    store = ResultStore(ttl_seconds=600, max_plots=2)
    store.add(plot("a", age_seconds=10, pinned=True))
    store.add(plot("b", age_seconds=5, pinned=True))
    _, evicted = store.add(plot("c", pinned=True))

    # max_plots is a hard cap: with every plot pinned, the oldest still goes
    assert [item.data.name for item in evicted] == ["a"]
    assert {item.data.name for item in store.list()} == {"b", "c"}


def test_update_and_revision():
    store = ResultStore(ttl_seconds=600, max_plots=5)
    stored = store.add(plot("a"))[0]
    before = store.revision

    updated = store.update(stored.id, PlotUpdate(name="renamed", colour_index=11))
    assert updated is not None
    assert updated.data.name == "renamed"
    assert updated.colour_index == 11 % PALETTE_SLOTS
    assert store.revision > before
    assert store.update("not-a-plot", PlotUpdate(name="x")) is None


def test_update_can_set_data_type():
    store = ResultStore(ttl_seconds=600, max_plots=5)
    stored = store.add(plot("a"))[0]
    assert stored.data.data_type is None

    updated = store.update(stored.id, PlotUpdate(data_type="fq"))
    assert updated is not None
    assert updated.data.data_type == "fq"


def test_clear():
    store = ResultStore(ttl_seconds=600, max_plots=5)
    store.add(plot("a"))
    store.add(plot("b"))
    assert store.clear() == 2
    assert store.list() == []


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "n", "x": [1.0], "y": [1.0, 2.0]},
        {"name": "n", "x": [], "y": []},
        {"name": "n", "x": [1.0], "y": [1.0], "e": [1.0, 2.0]},
    ],
)
def test_xyedata_validation(payload):
    with pytest.raises(ValueError):
        XYEData.model_validate(payload)
