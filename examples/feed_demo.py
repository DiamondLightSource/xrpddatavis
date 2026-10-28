#!/usr/bin/env python
"""Post made-up total-scattering data to a running xrpddatavis server.

Each "scan" mimics one PDFgetX3 job: a raw intensity curve I(Q), a powder
pattern, and the S(Q) / F(Q) / G(r) curves derived from it, all sharing one
file number. That fills the frontend's data-type tabs and file-number chips.

Run it with the server up: ``python examples/feed_demo.py``
"""

import time
from typing import Any

import numpy as np
import numpy.typing as npt
import requests

from xrpddatavis.models import DataPlot, FittedDataPlot, XYEData

Array = npt.NDArray[np.float64]

# in the order a PDFgetX3 job produces them
DATA_TYPES = ["pxrd", "iq", "sq", "fq", "gr"]

# per data type: x label, y label, file extension
LABELS = {
    "pxrd": ("2θ / °", "Intensity / counts", "xye"),
    "iq": ("Q / Å⁻¹", "I(Q) / counts", "iq"),
    "sq": ("Q / Å⁻¹", "S(Q)", "sq"),
    "fq": ("Q / Å⁻¹", "F(Q)", "fq"),
    "gr": ("r / Å", "G(r)", "gr"),
}

# Bragg peaks for the powder pattern: (2θ centre, relative height, width)
PXRD_PEAKS = [
    (18.2, 0.45, 0.10),
    (22.6, 1.00, 0.09),
    (28.4, 0.62, 0.11),
    (31.8, 0.28, 0.12),
    (36.1, 0.51, 0.10),
    (41.9, 0.34, 0.13),
    (47.3, 0.22, 0.14),
    (54.7, 0.30, 0.15),
]

# neighbour shells for G(r): (distance, relative height)
GR_SHELLS = [(2.3, 1.0), (3.4, 0.65), (4.6, 0.45), (5.9, 0.30), (7.0, 0.22)]


def make_pxrd(
    title: str, rng: np.random.Generator, points: int, scale: float, shift: float
) -> FittedDataPlot:
    """A falling background plus Bragg peaks, with counting noise - and the fit
    a Rietveld refinement would give alongside it."""
    x = np.linspace(10.0, 60.0, points)
    background = 120.0 + 900.0 * np.exp(-(x - 10.0) / 12.0)

    peaks = np.zeros_like(x)
    for centre, height, width in PXRD_PEAKS:
        offset = (x - centre - shift) / width
        gaussian = np.exp(-0.5 * offset**2)
        lorentzian = 1.0 / (1.0 + offset**2)
        peaks += height * 9000.0 * scale * (0.7 * gaussian + 0.3 * lorentzian)

    calc = background + peaks
    y = rng.poisson(calc).astype(float)
    return FittedDataPlot(
        title=title,
        x=x.tolist(),
        y=y.tolist(),
        e=np.sqrt(np.maximum(y, 1.0)).tolist(),
        calc=calc.tolist(),
        diff=(y - calc).tolist(),
        background=background.tolist(),
        markers=[centre + shift for centre, _, _ in PXRD_PEAKS],
    )


def make_iq(
    title: str, rng: np.random.Generator, points: int, scale: float, shift: float
) -> XYEData:
    """Raw intensity against Q: a falling background plus a ripple."""
    q = np.linspace(0.5, 25.0, points)
    clean = 9000.0 * np.exp(-q / 4.0) + 150.0
    clean += 400.0 * scale * np.exp(-q / 9.0) * (1 + np.sin(2.6 * q - shift))
    y = rng.poisson(np.maximum(clean, 1.0)).astype(float)
    return XYEData(
        title=title,
        x=q.tolist(),
        y=y.tolist(),
        e=np.sqrt(np.maximum(y, 1.0)).tolist(),
    )


def clean_sq(q: Array, scale: float, shift: float) -> Array:
    """S(Q) without noise: oscillates about 1, dying away at high Q."""
    return 1.0 + scale * 0.85 * np.exp(-q / 11.0) * np.sin(2.7 * q - shift)


def make_sq(
    title: str, rng: np.random.Generator, points: int, scale: float, shift: float
) -> XYEData:
    """The structure factor S(Q)."""
    q = np.linspace(0.5, 25.0, points)
    y = clean_sq(q, scale, shift) + rng.normal(0.0, 0.01, size=q.shape)
    return XYEData(title=title, x=q.tolist(), y=y.tolist(), e=[0.01] * points)


def make_fq(
    title: str, rng: np.random.Generator, points: int, scale: float, shift: float
) -> XYEData:
    """The reduced structure function F(Q) = Q * (S(Q) - 1)."""
    q = np.linspace(0.5, 25.0, points)
    y = q * (clean_sq(q, scale, shift) - 1.0) + rng.normal(0.0, 0.02, size=q.shape)
    return XYEData(title=title, x=q.tolist(), y=y.tolist(), e=[0.02] * points)


def make_gr(
    title: str, rng: np.random.Generator, points: int, scale: float, shift: float
) -> XYEData:
    """The pair distribution function G(r): a sharp peak at each neighbour
    distance, with a small dip just after it."""
    r = np.linspace(0.0, 20.0, points)
    clean = np.zeros_like(r)
    for distance, height in GR_SHELLS:
        peak = np.exp(-0.5 * ((r - distance - shift) / 0.08) ** 2)
        dip = np.exp(-0.5 * ((r - distance - 0.35) / 0.15) ** 2)
        clean += height * scale * (peak - 0.12 * dip)
    y = clean + rng.normal(0.0, 0.015, size=r.shape)
    return XYEData(title=title, x=r.tolist(), y=y.tolist(), e=[0.015] * points)


def make_data(
    data_type: str,
    title: str,
    rng: np.random.Generator,
    points: int,
    scale: float,
    shift: float,
) -> XYEData:
    """The curve for `data_type` - for pxrd, a FittedDataPlot carrying its fit."""
    if data_type == "pxrd":
        return make_pxrd(title, rng, points, scale, shift)
    if data_type == "iq":
        return make_iq(title, rng, points, scale, shift)
    if data_type == "sq":
        return make_sq(title, rng, points, scale, shift)
    if data_type == "fq":
        return make_fq(title, rng, points, scale, shift)
    if data_type == "gr":
        return make_gr(title, rng, points, scale, shift)
    raise ValueError(f"unknown data type {data_type!r}")


def plot_fields(
    title: str, data_type: str, filenumber: int, instrument_session: str
) -> dict[str, Any]:
    """The DataPlot fields that say what a curve is and where it came from."""
    x_label, y_label, extension = LABELS[data_type]
    return {
        # a Diamond-style path - the server reads the instrument session from it
        "filepath": f"/dls/i11/data/2026/{instrument_session}/{title}.{extension}",
        "filenumber": filenumber,
        "x_label": x_label,
        "y_label": y_label,
        "data_type": data_type,
    }


def post_plot(url: str, plot: DataPlot) -> None:
    body = plot.model_dump(mode="json", exclude_none=True)
    response = requests.post(f"{url}/plot", json=body, timeout=30)
    response.raise_for_status()
    result = response.json()

    message = f"posted {plot.title} [{plot.data_type}] -> {result['id']}"
    if result["evicted"]:
        message += f" (evicted {len(result['evicted'])})"
    print(message)


def post_scans(
    url: str,
    count: int,
    data_types: list[str],
    points: int,
    start_filenumber: int,
    instrument_session: str,
    interval: float,
) -> None:
    """Post `count` scans, each with one plot per data type."""
    rng = np.random.default_rng(1234)

    for scan in range(count):
        filenumber = start_filenumber + scan
        scale = 1.0 - 0.05 * scan
        shift = 0.02 * scan

        for data_type in data_types:
            title = f"{data_type}-{filenumber:03d}"
            data = make_data(data_type, title, rng, points, scale, shift)
            fields = plot_fields(title, data_type, filenumber, instrument_session)

            # only the first pxrd scan is sent with its fit, to show a
            # FittedDataPlot - the rest are plain DataPlots
            if isinstance(data, FittedDataPlot) and scan == 0:
                plot = data.model_copy(update=fields)
            else:
                plot = DataPlot(title=title, x=data.x, y=data.y, e=data.e, **fields)
            post_plot(url, plot)

        if interval and scan < count - 1:
            time.sleep(interval)


if __name__ == "__main__":
    post_scans(
        url="http://localhost:8000",
        count=3,
        data_types=DATA_TYPES,
        points=1500,
        start_filenumber=1,
        instrument_session="cm12345-1",
        interval=0.0,
    )
