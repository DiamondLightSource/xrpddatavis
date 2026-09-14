import logging
from collections.abc import Iterable

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(asctime)s %(name)s: %(message)s",
    datefmt="%H:%M:%S %d-%m-%Y",
)
logger = logging.getLogger(__name__)


class PollingLogFilter(logging.Filter):
    """Drop uvicorn access log lines for endpoints the frontend polls.

    Every open browser tab hits ``/liveplots`` and ``/events``; without this
    the access log is nothing else.
    """

    def __init__(self, paths: Iterable[str]) -> None:
        super().__init__()
        self.paths = set(paths)

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        # uvicorn.access logs (client, method, path, http_version, status)
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            if args[2].split("?")[0] in self.paths:
                return False
        return True


def suppress_polling_logs(paths: Iterable[str]) -> None:
    logging.getLogger("uvicorn.access").addFilter(PollingLogFilter(paths))
