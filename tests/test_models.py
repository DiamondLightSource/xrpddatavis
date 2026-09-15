import pytest

from xrddatavis.models import XYEData, get_instrument_session


@pytest.mark.parametrize(
    ("filepath", "expected"),
    [
        ("/dls/i11/data/2026/cm12345-1/scan.xye", "cm12345-1"),
        ("/dls/i15-1/data/2026/mg12345-1/sample.dat", "mg12345-1"),
        ("/dls/i13-2/data/2019/nt123333-4/foo/bar.iq", "nt123333-4"),
    ],
)
def test_get_instrument_session_extracts_the_session(filepath, expected):
    assert get_instrument_session(filepath) == expected


@pytest.mark.parametrize(
    "filepath",
    [
        "/no/dls/here/at/all.xye",
        "/dls/i11/notdata/2026/cm12345-1/scan.xye",  # wrong segment, not "data"
        "/dls/i11/data/notayear/cm12345-1/scan.xye",  # year isn't 4 digits
        "/dls/i11/data/2026/notasession/scan.xye",  # session doesn't match the pattern
        "/dls/i11/data/2026",  # too short - nothing after the year
    ],
)
def test_get_instrument_session_rejects_paths_that_do_not_match(filepath):
    with pytest.raises(ValueError):
        get_instrument_session(filepath)


def test_xyedata_get_instrument_session_prefers_explicit_value():
    data = XYEData(
        name="n",
        x=[1.0],
        y=[1.0],
        filepath="/dls/i11/data/2026/cm12345-1/scan.xye",
        instrument_session="mg99999-9",
    )
    assert data.get_instrument_session() == "mg99999-9"


def test_xyedata_get_instrument_session_falls_back_to_filepath():
    data = XYEData(
        name="n", x=[1.0], y=[1.0], filepath="/dls/i11/data/2026/cm12345-1/scan.xye"
    )
    assert data.get_instrument_session() == "cm12345-1"


def test_xyedata_get_instrument_session_is_none_without_a_usable_filepath():
    assert XYEData(name="n", x=[1.0], y=[1.0]).get_instrument_session() is None
    assert (
        XYEData(
            name="n", x=[1.0], y=[1.0], filepath="/not/a/dls/path.xye"
        ).get_instrument_session()
        is None
    )
