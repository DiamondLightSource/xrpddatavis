"""Sqlite-backed store of plots that expire after a configured TTL."""

# ``PlotStore.list`` shadows the builtin inside the class body, so defer
# annotation evaluation rather than rename a method already in use.
from __future__ import annotations

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from uuid import UUID

from xrpddatavis.logger import logger
from xrpddatavis.models import PlotData, PlotSummary, PlotUpdate

# number of slots in the frontend's fixed categorical palette
PALETTE_SLOTS = 8

SCHEMA = """
CREATE TABLE IF NOT EXISTS plots (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at REAL NOT NULL,
    pinned INTEGER NOT NULL,
    colour_index INTEGER NOT NULL,
    data TEXT NOT NULL
)
"""


class PlotStore:
    """Keep generated results around for ``ttl_seconds`` then drop them.

    At most ``max_plots`` are held at once; adding beyond that evicts the
    oldest. Entries are pruned lazily on every read and, when the server runs
    a periodic cleanup task, eagerly on that schedule too.

    Each plot is stored in sqlite as its JSON dump, with the columns needed
    for querying (title, age, pinned and colour) pulled out alongside it, so
    plots survive a restart when ``db_path`` points at a file.
    """

    def __init__(
        self, ttl_seconds: int, max_plots: int, db_path: str | Path = ":memory:"
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_plots = max_plots

        if str(db_path) != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.db_path = str(db_path)
        # the API and the cleanup task can be on different threads (e.g.
        # under TestClient), so share one connection and serialise access
        self._conn = sqlite3.connect(
            self.db_path, isolation_level=None, check_same_thread=False
        )
        self._lock = Lock()
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute(SCHEMA)
        # incremented on every mutation so clients can tell when to re-fetch.
        # Not persisted: clients only compare it for inequality, and a reset
        # after a restart is exactly when they should re-fetch anyway.
        self._revision = 0

    @property
    def revision(self) -> int:
        with self._lock:
            return self._revision

    @contextmanager
    def _transaction(self) -> Generator[sqlite3.Connection]:
        """Hold the lock and run everything inside one sqlite transaction."""
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            self._conn.execute("COMMIT")

    def add(self, response: PlotData) -> tuple[PlotData, list[PlotData]]:
        """Store ``response``, evicting the oldest plots if the store is full.

        Returns the stored plot and whatever had to be evicted to fit it.
        """
        with self._transaction() as conn:
            response.colour_index = self._free_colour_slot(conn)
            self._save(conn, response)
            evicted = self._evict_oldest(conn)
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
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT data FROM plots WHERE title = ? LIMIT 1",
                (response.data.title,),
            ).fetchone()
            if row is None:
                response.colour_index = self._free_colour_slot(conn)
                stored = response
            else:
                stored = PlotData.model_validate_json(row[0])
                stored.data = response.data
                stored.created_at = response.created_at
                stored.updated_at = response.updated_at
                stored.version += 1
            self._save(conn, stored)
            evicted = self._evict_oldest(conn)
            self._revision += 1
        return stored, evicted

    def get(self, result_id: str | UUID) -> PlotData | None:
        self.purge_expired()
        with self._lock:
            return self._load(self._conn, result_id)

    def list(self) -> list[PlotData]:
        """All live results, newest first."""
        self.purge_expired()
        with self._lock:
            rows = self._conn.execute(
                "SELECT data FROM plots ORDER BY created_at DESC"
            ).fetchall()
        return [PlotData.model_validate_json(data) for (data,) in rows]

    def summaries(self, now: datetime | None = None) -> list[PlotSummary]:
        now = now or datetime.now(UTC)
        return [plot.summary(self.ttl_seconds, now) for plot in self.list()]

    def update(self, result_id: str | UUID, changes: PlotUpdate) -> PlotData | None:
        with self._transaction() as conn:
            plot = self._load(conn, result_id)
            if plot is None:
                return None
            if changes.name is not None:
                plot.data.title = changes.name
            if changes.plot_type is not None:
                plot.data.plot_type = changes.plot_type
            if changes.colour_index is not None:
                plot.colour_index = changes.colour_index % PALETTE_SLOTS
            if changes.data_type is not None:
                plot.data.data_type = changes.data_type
            if changes.pinned is not None:
                plot.pinned = changes.pinned
            plot.updated_at = datetime.now(UTC)
            self._save(conn, plot)
            self._revision += 1
            return plot

    def remove(self, result_id: str | UUID) -> PlotData | None:
        with self._transaction() as conn:
            plot = self._load(conn, result_id)
            if plot is not None:
                conn.execute("DELETE FROM plots WHERE id = ?", (str(plot.id),))
                self._revision += 1
            return plot

    def clear(self) -> int:
        with self._transaction() as conn:
            count = conn.execute("DELETE FROM plots").rowcount
            if count:
                self._revision += 1
            return count

    def purge_expired(self, now: datetime | None = None) -> int:
        now = now or datetime.now(UTC)
        cutoff = now.timestamp() - self.ttl_seconds
        with self._transaction() as conn:
            count = conn.execute(
                "DELETE FROM plots WHERE NOT pinned AND created_at < ?", (cutoff,)
            ).rowcount
            if count:
                self._revision += 1
        if count:
            logger.info("pruned %d expired plot(s)", count)
        return count

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    @staticmethod
    def _save(conn: sqlite3.Connection, plot: PlotData) -> None:
        conn.execute(
            "INSERT OR REPLACE INTO plots VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(plot.id),
                plot.data.title,
                plot.created_at.timestamp(),
                plot.pinned,
                plot.colour_index,
                plot.model_dump_json(),
            ),
        )

    @staticmethod
    def _load(conn: sqlite3.Connection, result_id: str | UUID) -> PlotData | None:
        row = conn.execute(
            "SELECT data FROM plots WHERE id = ?", (str(result_id),)
        ).fetchone()
        return None if row is None else PlotData.model_validate_json(row[0])

    def _evict_oldest(self, conn: sqlite3.Connection) -> list[PlotData]:
        """Drop oldest plots until within ``max_plots``. Call in a transaction.

        A pinned plot is shielded from eviction as long as an unpinned one is
        available to drop instead. ``max_plots`` is still a hard cap though -
        if every remaining plot is pinned, the oldest of those goes too.
        """
        (count,) = conn.execute("SELECT COUNT(*) FROM plots").fetchone()
        excess = count - self.max_plots
        if excess <= 0:
            return []
        rows = conn.execute(
            "SELECT id, data FROM plots ORDER BY pinned, created_at LIMIT ?",
            (excess,),
        ).fetchall()
        conn.executemany("DELETE FROM plots WHERE id = ?", [(id_,) for id_, _ in rows])
        return [PlotData.model_validate_json(data) for _, data in rows]

    @staticmethod
    def _free_colour_slot(conn: sqlite3.Connection) -> int:
        """Lowest palette slot not currently in use. Call in a transaction."""
        counts = dict.fromkeys(range(PALETTE_SLOTS), 0)
        for (colour_index,) in conn.execute("SELECT colour_index FROM plots"):
            counts[colour_index % PALETTE_SLOTS] += 1
        # the first free slot if there is one; once every slot is in use,
        # fall back to the least used, so colours only ever repeat once the
        # palette is exhausted
        return min(counts, key=lambda slot: counts[slot])
