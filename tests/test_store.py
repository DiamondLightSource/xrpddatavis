from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from xrpddatavis.models import (
    DataPlot,
    FittedDataPlot,
    PlotData,
    PlotUpdate,
    XYEData,
)
from xrpddatavis.store import PALETTE_SLOTS, PlotStore


@pytest.fixture
def make_store() -> Iterator[Callable[..., PlotStore]]:
    """Build PlotStores that are closed when the test ends.

    Python 3.13+ raises a ResourceWarning for a sqlite connection that is
    garbage collected while still open, which our filterwarnings turns into
    an error.
    """
    stores: list[PlotStore] = []

    def make(**kwargs) -> PlotStore:
        store = PlotStore(**kwargs)
        stores.append(store)
        return store

    yield make
    for store in stores:
        store.close()


def plot(title: str, age_seconds: float = 0.0, pinned: bool = False) -> PlotData:
    created = datetime.now(UTC) - timedelta(seconds=age_seconds)
    return PlotData(
        data=DataPlot(title=title, x=[1.0, 2.0], y=[3.0, 4.0]),
        created_at=created,
        pinned=pinned,
    )


def test_add_evicts_oldest_beyond_max_plots(make_store):
    store = make_store(ttl_seconds=600, max_plots=2)
    oldest = store.add(plot("a", age_seconds=10))[0]
    store.add(plot("b", age_seconds=5))
    _, evicted = store.add(plot("c"))

    assert [item.id for item in evicted] == [oldest.id]
    assert {item.data.title for item in store.list()} == {"b", "c"}


def test_colour_slots_are_reused_once_freed(make_store):
    store = make_store(ttl_seconds=600, max_plots=10)
    first = store.add(plot("a"))[0]
    second = store.add(plot("b"))[0]
    assert (first.colour_index, second.colour_index) == (0, 1)

    store.remove(first.id)
    third = store.add(plot("c"))[0]
    assert third.colour_index == 0


def test_colour_slots_wrap_when_the_palette_is_full(make_store):
    store = make_store(ttl_seconds=600, max_plots=PALETTE_SLOTS + 2)
    slots = [store.add(plot(f"p{i}"))[0].colour_index for i in range(PALETTE_SLOTS + 1)]
    assert sorted(slots[:PALETTE_SLOTS]) == list(range(PALETTE_SLOTS))
    assert 0 <= slots[-1] < PALETTE_SLOTS


def test_upsert_keeps_id_and_colour_and_bumps_version(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    store.add(plot("filler"))
    original = store.upsert(plot("scan"))[0]

    replacement = PlotData(
        data=DataPlot(title="scan", x=[1.0, 2.0, 3.0], y=[9.0, 9.0, 9.0])
    )
    updated = store.upsert(replacement)[0]

    assert updated.id == original.id
    assert updated.colour_index == original.colour_index
    assert updated.version == 2
    assert len(updated.data.x) == 3
    assert len(store.list()) == 2


def test_purge_expired(make_store):
    store = make_store(ttl_seconds=30, max_plots=5)
    store.add(plot("fresh"))
    store.add(plot("stale", age_seconds=60))

    assert store.purge_expired() == 1
    assert [item.data.title for item in store.list()] == ["fresh"]


def test_pinned_plots_do_not_expire(make_store):
    store = make_store(ttl_seconds=30, max_plots=5)
    stale = store.add(plot("stale", age_seconds=60))[0]
    store.update(stale.id, PlotUpdate(pinned=True))

    assert store.purge_expired() == 0
    assert [item.data.title for item in store.list()] == ["stale"]

    store.update(stale.id, PlotUpdate(pinned=False))
    assert store.purge_expired() == 1
    assert store.list() == []


def test_eviction_prefers_unpinned_plots(make_store):
    store = make_store(ttl_seconds=600, max_plots=2)
    oldest = store.add(plot("a", age_seconds=10))[0]
    store.update(oldest.id, PlotUpdate(pinned=True))
    store.add(plot("b", age_seconds=5))
    _, evicted = store.add(plot("c"))

    # "a" is oldest but pinned, so "b" is evicted in its place
    assert [item.data.title for item in evicted] == ["b"]
    assert {item.data.title for item in store.list()} == {"a", "c"}


def test_eviction_falls_back_to_pinned_plots_once_all_are_pinned(make_store):
    store = make_store(ttl_seconds=600, max_plots=2)
    store.add(plot("a", age_seconds=10, pinned=True))
    store.add(plot("b", age_seconds=5, pinned=True))
    _, evicted = store.add(plot("c", pinned=True))

    # max_plots is a hard cap: with every plot pinned, the oldest still goes
    assert [item.data.title for item in evicted] == ["a"]
    assert {item.data.title for item in store.list()} == {"b", "c"}


def test_update_and_revision(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    stored = store.add(plot("a"))[0]
    before = store.revision

    updated = store.update(stored.id, PlotUpdate(name="renamed", colour_index=11))
    assert updated is not None
    assert updated.data.title == "renamed"
    assert updated.colour_index == 11 % PALETTE_SLOTS
    assert store.revision > before
    assert store.update("not-a-plot", PlotUpdate(name="x")) is None


def test_update_can_set_data_type(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    stored = store.add(plot("a"))[0]
    assert stored.data.data_type is None

    updated = store.update(stored.id, PlotUpdate(data_type="fq"))
    assert updated is not None
    assert updated.data.data_type == "fq"


def test_clear(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    store.add(plot("a"))
    store.add(plot("b"))
    assert store.clear() == 2
    assert store.list() == []


def test_plots_persist_across_restarts(tmp_path, make_store):
    db_path = tmp_path / "nested" / "plots.db"
    store = make_store(ttl_seconds=600, max_plots=5, db_path=db_path)
    stored = store.add(plot("a"))[0]
    store.update(stored.id, PlotUpdate(pinned=True, name="renamed"))
    store.close()

    reopened = make_store(ttl_seconds=600, max_plots=5, db_path=db_path)
    restored = reopened.get(stored.id)
    assert restored is not None
    assert restored.data.title == "renamed"
    assert restored.pinned
    assert restored.colour_index == stored.colour_index
    assert restored.data.x == [1.0, 2.0]


def test_ttl_applies_to_plots_restored_after_a_restart(tmp_path, make_store):
    db_path = tmp_path / "plots.db"
    store = make_store(ttl_seconds=30, max_plots=5, db_path=db_path)
    store.add(plot("stale", age_seconds=60))
    store.add(plot("pinned", age_seconds=60, pinned=True))
    store.add(plot("fresh"))
    store.close()

    reopened = make_store(ttl_seconds=30, max_plots=5, db_path=db_path)
    assert {item.data.title for item in reopened.list()} == {"pinned", "fresh"}


def test_fitted_plots_round_trip_through_the_db(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    fitted = PlotData(
        data=FittedDataPlot(
            title="fit",
            x=[1.0, 2.0],
            y=[3.0, 4.0],
            calc=[2.9, 4.1],
            background=0.5,
            markers=[1.5],
        )
    )
    stored = store.add(fitted)[0]

    restored = store.get(stored.id)
    assert restored is not None
    assert isinstance(restored.data, FittedDataPlot)
    assert restored.data.calc == [2.9, 4.1]
    assert restored.data.background == 0.5
    assert restored.data.markers == [1.5]


def test_failed_transaction_rolls_back_and_releases_the_lock(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    store.add(plot("kept"))

    with pytest.raises(RuntimeError), store._transaction() as conn:
        conn.execute("DELETE FROM plots")
        raise RuntimeError("boom")

    # the delete was rolled back, and the store is still usable
    assert [item.data.title for item in store.list()] == ["kept"]
    store.add(plot("after"))
    assert len(store.list()) == 2


def test_get_returns_none_for_unknown_and_expired_plots(make_store):
    store = make_store(ttl_seconds=30, max_plots=5)
    stale = store.add(plot("stale", age_seconds=60))[0]

    assert store.get(uuid4()) is None
    assert store.get(stale.id) is None


def test_list_is_newest_first(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    store.add(plot("middle", age_seconds=5))
    store.add(plot("newest"))
    store.add(plot("oldest", age_seconds=10))

    assert [item.data.title for item in store.list()] == [
        "newest",
        "middle",
        "oldest",
    ]


def test_summaries(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    stored = store.add(plot("a", age_seconds=100))[0]
    now = datetime.now(UTC)

    [summary] = store.summaries(now)
    assert summary.id == stored.id
    assert summary.name == "a"
    assert summary.points == 2
    assert summary.ttl_remaining_seconds == pytest.approx(500, abs=1)
    assert summary.expires_at == stored.created_at + timedelta(seconds=600)


def test_upsert_adds_a_new_plot_with_a_free_colour(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    store.add(plot("a"))
    new, evicted = store.upsert(plot("b"))

    assert evicted == []
    assert new.colour_index == 1
    assert new.version == 1
    assert {item.data.title for item in store.list()} == {"a", "b"}


def test_upsert_evicts_beyond_max_plots(make_store):
    store = make_store(ttl_seconds=600, max_plots=1)
    oldest = store.add(plot("a", age_seconds=10))[0]
    _, evicted = store.upsert(plot("b"))

    assert [item.id for item in evicted] == [oldest.id]
    assert [item.data.title for item in store.list()] == ["b"]


def test_add_evicts_several_plots_at_once(make_store):
    store = make_store(ttl_seconds=600, max_plots=3)
    for i in range(3):
        store.add(plot(f"p{i}", age_seconds=10 - i))
    store.max_plots = 1
    _, evicted = store.add(plot("new"))

    assert [item.data.title for item in evicted] == ["p0", "p1", "p2"]
    assert [item.data.title for item in store.list()] == ["new"]


def test_update_persists_every_editable_field(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    stored = store.add(plot("a"))[0]

    store.update(
        stored.id,
        PlotUpdate(
            name="b",
            plot_type="scatter",
            colour_index=3,
            data_type="gr",
            pinned=True,
        ),
    )

    reloaded = store.get(stored.id)
    assert reloaded is not None
    assert reloaded.data.title == "b"
    assert reloaded.data.plot_type == "scatter"
    assert reloaded.colour_index == 3
    assert reloaded.data.data_type == "gr"
    assert reloaded.pinned
    assert reloaded.updated_at > stored.updated_at


def test_remove(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    stored = store.add(plot("a"))[0]
    store.add(plot("b"))
    before = store.revision

    removed = store.remove(stored.id)
    assert removed is not None and removed.id == stored.id
    assert [item.data.title for item in store.list()] == ["b"]
    assert store.revision > before

    # removing it again is a no-op that leaves the revision alone
    before = store.revision
    assert store.remove(stored.id) is None
    assert store.revision == before


def test_no_op_mutations_leave_the_revision_alone(make_store):
    store = make_store(ttl_seconds=600, max_plots=5)
    assert store.clear() == 0
    assert store.purge_expired() == 0
    assert store.revision == 0


def test_purge_expired_respects_an_explicit_now(make_store):
    store = make_store(ttl_seconds=30, max_plots=5)
    store.add(plot("a"))

    assert store.purge_expired(now=datetime.now(UTC)) == 0
    later = datetime.now(UTC) + timedelta(seconds=60)
    assert store.purge_expired(now=later) == 1


def test_concurrent_adds_are_all_stored(make_store):
    store = make_store(ttl_seconds=600, max_plots=200)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda i: store.add(plot(f"p{i}")), range(100)))

    assert len(store.list()) == 100
    assert store.revision == 100


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "n", "x": [1.0], "y": [1.0, 2.0]},
        {"title": "n", "x": [], "y": []},
        {"title": "n", "x": [1.0], "y": [1.0], "e": [1.0, 2.0]},
    ],
)
def test_xyedata_validation(payload):
    with pytest.raises(ValueError):
        XYEData.model_validate(payload)
