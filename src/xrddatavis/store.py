"""In-memory store of PDF results that expire after a configured TTL."""

from datetime import UTC, datetime
from threading import Lock

from xrddatavis.logger import logger
from xrddatavis.models import PlotData


class ResultStore:
    """Keep generated results around for ``ttl_seconds`` then drop them.

    Entries are pruned lazily on every read and, when the server runs a
    periodic cleanup task, eagerly on that schedule too.
    """

    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = ttl_seconds
        self._items: dict[str, PlotData] = {}
        self._lock = Lock()

    def add(self, response: PlotData) -> PlotData:
        with self._lock:
            self._items[str(response.id)] = response
        return response

    def get(self, result_id: str) -> PlotData | None:
        self.purge_expired()
        with self._lock:
            return self._items.get(result_id)

    def list(self) -> list[PlotData]:
        """All live results, newest first."""
        self.purge_expired()
        with self._lock:
            return sorted(
                self._items.values(), key=lambda r: r.created_at, reverse=True
            )

    def purge_expired(self, now: datetime | None = None) -> int:
        now = now or datetime.now(UTC)
        with self._lock:
            expired = [
                key
                for key, response in self._items.items()
                if response.is_expired(self.ttl_seconds, now)
            ]
            for key in expired:
                del self._items[key]
        if expired:
            logger.info("pruned %d expired result(s)", len(expired))
        return len(expired)
