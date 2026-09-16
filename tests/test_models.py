import pytest

from xrpddatavis.models import (
    DataPlot,
    FittedDataPlot,
    XYEData,
    get_filenumber_from_filepath,
    get_instrument_session_from_filepath,
)


@pytest.mark.parametrize(
    ("filepath", "expected"),
    [
        ("/dls/i11/data/2026/cm12345-1/scan.xye", "cm12345-1"),
        ("/dls/i15-1/data/2026/mg12345-1/sample.dat", "mg12345-1"),
        ("/dls/i13-2/data/2019/nt123333-4/foo/bar.iq", "nt123333-4"),
    ],
)
def test_get_instrument_session_extracts_the_session(filepath, expected):
    assert get_instrument_session_from_filepath(filepath) == expected


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
        get_instrument_session_from_filepath(filepath)


def test_dataplot_get_instrument_session_prefers_explicit_value():
    data = DataPlot(
        title="n",
        x=[1.0],
        y=[1.0],
        filepath="/dls/i11/data/2026/cm12345-1/scan.xye",
        instrument_session="mg99999-9",
    )
    assert data.get_instrument_session() == "mg99999-9"


def test_dataplot_get_instrument_session_falls_back_to_filepath():
    data = DataPlot(
        title="n", x=[1.0], y=[1.0], filepath="/dls/i11/data/2026/cm12345-1/scan.xye"
    )
    assert data.get_instrument_session() == "cm12345-1"


def test_dataplot_get_instrument_session_is_none_without_a_usable_filepath():
    assert DataPlot(title="n", x=[1.0], y=[1.0]).get_instrument_session() is None
    assert (
        DataPlot(
            title="n", x=[1.0], y=[1.0], filepath="/not/a/dls/path.xye"
        ).get_instrument_session()
        is None
    )


def test_xyedata_has_no_plotting_or_provenance_fields():
    data = XYEData(title="n", x=[1.0], y=[1.0])
    assert not hasattr(data, "filepath")
    assert not hasattr(data, "plot_type")


def test_dataplot_defaults_plot_type_and_upsert():
    data = DataPlot(title="n", x=[1.0], y=[1.0])
    assert data.plot_type == "line"
    assert data.upsert is False


def test_fitteddataplot_difference_uses_explicit_diff_when_present():
    fit = FittedDataPlot(
        title="n", x=[1.0, 2.0], y=[10.0, 20.0], calc=[9.0, 19.0], diff=[0.5, 0.5]
    )
    assert fit.obs == [10.0, 20.0]
    assert fit.difference == [0.5, 0.5]


def test_fitteddataplot_difference_falls_back_to_obs_minus_calc():
    fit = FittedDataPlot(title="n", x=[1.0, 2.0], y=[10.0, 20.0], calc=[9.0, 21.0])
    assert fit.difference == [1.0, -1.0]


def test_get_filenumber():

    filepath = "/dls/i15-1/data/2026/cm12345-1/i15-1-12345.nxs"

    assert get_filenumber_from_filepath(filepath) == 12345

    filepath = "/dls/i11/data/2026/cm12345-1/i11-80081.nxs"

    assert get_filenumber_from_filepath(filepath) == 80081
