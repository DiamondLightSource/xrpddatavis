import logging

from xrddatavis.logger import PollingLogFilter


def record(path: str) -> logging.LogRecord:
    return logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("127.0.0.1:1", "GET", path, "1.1", 200),
        exc_info=None,
    )


def test_polling_paths_are_dropped():
    log_filter = PollingLogFilter(["/liveplots", "/events"])
    assert log_filter.filter(record("/liveplots")) is False
    assert log_filter.filter(record("/events?since=3")) is False
    assert log_filter.filter(record("/plot")) is True


def test_non_access_records_pass_through():
    log_filter = PollingLogFilter(["/liveplots"])
    plain = logging.LogRecord(
        name="uvicorn.error",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="started",
        args=None,
        exc_info=None,
    )
    assert log_filter.filter(plain) is True
