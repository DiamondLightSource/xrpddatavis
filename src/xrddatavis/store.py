"""In-memory store of plots that expire after a configured TTL."""

# ``ResultStore.list`` shadows the builtin inside the class body, so defer
# annotation evaluation rather than rename a method already in use.
from __future__ import annotations

from datetime import UTC, datetime
from threading import Lock
from uuid import UUID

from xrddatavis.logger import logger
from xrddatavis.models import PlotData, PlotSummary, PlotUpdate

# number of slots in the frontend's fixed categorical palette
PALETTE_SLOTS = 8


class ResultStore:
    """Keep generated results around for ``ttl_seconds`` then drop them.

    At most ``max_plots`` are held at once; adding beyond that evicts the
    oldest. Entries are pruned lazily on every read and, when the server runs
    a periodic cleanup task, eagerly on that schedule too.
    """

    def __init__(self, ttl_seconds: int, max_plots: int) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_plots = max_plots
        self._items: dict[str, PlotData] = {}
        self._lock = Lock()
        # incremented on every mutation so clients can tell when to re-fetch
        self._revision = 0

    @property
    def revision(self) -> int:
        with self._lock:
            return self._revision

    def add(self, response: PlotData) -> tuple[PlotData, list[PlotData]]:
        """Store ``response``, evicting the oldest plots if the store is full.

        Returns the stored plot and whatever had to be evicted to fit it.
        """
        with self._lock:
            response.colour_index = self._free_colour_slot()
            self._items[str(response.id)] = response
            evicted = self._evict_oldest()
            self._revision += 1
        if evicted:
            logger.info(
                "evicted %d plot(s) to stay within max_plots=%d",
                len(evicted),
                self.max_plots,
            )
        return response, evicted

    def upsert(self, response: PlotData) -> tuple[PlotData, list[PlotData]]:
        """Replace the data of the plot with the same name, or add a new one.

        The existing id and colour are kept so a live trace stays put in the
        table - and keeps its colour - as it is updated.
        """
        with self._lock:
            existing = next(
                (
                    item
                    for item in self._items.values()
                    if item.data.name == response.data.name
                ),
                None,
            )
            if existing is None:
                response.colour_index = self._free_colour_slot()
                self._items[str(response.id)] = response
                stored = response
            else:
                existing.data = response.data
                existing.fit = response.fit
                existing.plot_type = response.plot_type
                existing.created_at = response.created_at
                existing.updated_at = response.updated_at
                existing.version += 1
                stored = existing
            evicted = self._evict_oldest()
            self._revision += 1
        return stored, evicted

    def get(self, result_id: str | UUID) -> PlotData | None:
        self.purge_expired()
        with self._lock:
            return self._items.get(str(result_id))

    def list(self) -> list[PlotData]:
        """All live results, newest first."""
        self.purge_expired()
        with self._lock:
            return sorted(
                self._items.values(), key=lambda r: r.created_at, reverse=True
            )

    def summaries(self, now: datetime | None = None) -> list[PlotSummary]:
        now = now or datetime.now(UTC)
        return [plot.summary(self.ttl_seconds, now) for plot in self.list()]

    def update(self, result_id: str | UUID, changes: PlotUpdate) -> PlotData | None:
        with self._lock:
            plot = self._items.get(str(result_id))
            if plot is None:
                return None
            if changes.name is not None:
                plot.data.name = changes.name
            if changes.plot_type is not None:
                plot.plot_type = changes.plot_type
            if changes.colour_index is not None:
                plot.colour_index = changes.colour_index % PALETTE_SLOTS
            if changes.data_type is not None:
                plot.data.data_type = changes.data_type
            if changes.pinned is not None:
                plot.pinned = changes.pinned
            plot.updated_at = datetime.now(UTC)
            self._revision += 1
            return plot

    def remove(self, result_id: str | UUID) -> PlotData | None:
        with self._lock:
            plot = self._items.pop(str(result_id), None)
            if plot is not None:
                self._revision += 1
            return plot

    def clear(self) -> int:
        with self._lock:
            count = len(self._items)
            self._items.clear()
            if count:
                self._revision += 1
            return count

    def purge_expired(self, now: datetime | None = None) -> int:
        now = now or datetime.now(UTC)
        with self._lock:
            expired = [
                key
                for key, response in self._items.items()
                if not response.pinned and response.is_expired(self.ttl_seconds, now)
            ]
            for key in expired:
                del self._items[key]
            if expired:
                self._revision += 1
        if expired:
            logger.info("pruned %d expired plot(s)", len(expired))
        return len(expired)

    def _evict_oldest(self) -> list[PlotData]:
        """Drop oldest plots until within ``max_plots``. Call under the lock.

        A pinned plot is shielded from eviction as long as an unpinned one is
        available to drop instead. ``max_plots`` is still a hard cap though -
        if every remaining plot is pinned, the oldest of those goes too.
        """
        evicted: list[PlotData] = []
        while len(self._items) > self.max_plots:
            unpinned = [item for item in self._items.values() if not item.pinned]
            pool = unpinned or list(self._items.values())
            oldest = min(pool, key=lambda r: r.created_at)
            evicted.append(self._items.pop(str(oldest.id)))
        return evicted

    def _free_colour_slot(self) -> int:
        """Lowest palette slot not currently in use. Call under the lock."""
        taken = {plot.colour_index for plot in self._items.values()}
        for slot in range(PALETTE_SLOTS):
            if slot not in taken:
                return slot
        # every slot is in use: fall back to the least used one, so colours
        # only ever repeat once the palette is exhausted
        counts = dict.fromkeys(range(PALETTE_SLOTS), 0)
        for plot in self._items.values():
            counts[plot.colour_index % PALETTE_SLOTS] += 1
        return min(counts, key=lambda slot: counts[slot])
