#!/usr/bin/env python
"""Post synthetic total-scattering data at a running xrddatavis server.

Each "scan" mimics one PDFgetX3 job: a raw intensity curve I(Q), a powder
pattern, and the derived S(Q) / F(Q) / G(r) curves it produces, all sharing
one file number. That gives the frontend several ``data_type`` tabs and
several file-number chips to filter by straight away.

Examples
--------
Fill the server with three scans (15 plots: 5 types x 3 file numbers)::

    python examples/feed_demo.py --count 3

Post only the PDF and structure-factor products, five scans of them::

    python examples/feed_demo.py --count 5 --types gr sq fq

Watch a single pxrd trace update live for a minute, as a scan would::

    python examples/feed_demo.py --live --interval 2 --count 30
"""

import argparse
import time

import numpy as np
import requests

# order mirrors a PDFgetX3 job: a raw curve, the classic powder pattern, then
# the three total-scattering products derived from it
DEMO_TYPES = ["pxrd", "iq", "sq", "fq", "gr"]

# axis labels and on-disk extensions PDFgetX3 conventionally uses per product
AXES = {
    "pxrd": ("2θ / °", "Intensity / counts", "xye"),
    "iq": ("Q / Å⁻¹", "I(Q) / counts", "iq"),
    "sq": ("Q / Å⁻¹", "S(Q)", "sq"),
    "fq": ("Q / Å⁻¹", "F(Q)", "fq"),
    "gr": ("r / Å", "G(r)", "gr"),
}

PXRD_PEAKS = [
    # (2-theta centre, relative intensity, width)
    (18.2, 0.45, 0.10),
    (22.6, 1.00, 0.09),
    (28.4, 0.62, 0.11),
    (31.8, 0.28, 0.12),
    (36.1, 0.51, 0.10),
    (41.9, 0.34, 0.13),
    (47.3, 0.22, 0.14),
    (54.7, 0.30, 0.15),
]

# characteristic pair distances and relative weights for the toy G(r) - e.g.
# nearest-, second- and third-neighbour shells of a simple ionic structure
GR_SHELLS = [(2.3, 1.0), (3.4, 0.65), (4.6, 0.45), (5.9, 0.30), (7.0, 0.22)]


def pxrd_pattern(rng, points=1500, scale=1.0, shift=0.0):
    """A background plus pseudo-Voigt Bragg peaks with Poisson counting noise."""
    x = np.linspace(10.0, 60.0, points)
    background = 120.0 + 900.0 * np.exp(-(x - 10.0) / 12.0)
    signal = np.zeros_like(x)
    for centre, height, width in PXRD_PEAKS:
        gauss = np.exp(-0.5 * ((x - centre - shift) / width) ** 2)
        lorentz = 1.0 / (1.0 + ((x - centre - shift) / width) ** 2)
        signal += height * 9000.0 * scale * (0.7 * gauss + 0.3 * lorentz)
    clean = background + signal
    noisy = rng.poisson(clean).astype(float)
    return x, noisy, np.sqrt(np.maximum(noisy, 1.0))


def iq_pattern(rng, points=1500, scale=1.0, shift=0.0):
    """Raw measured intensity vs Q: a falling background plus form-factor ripple."""
    q = np.linspace(0.5, 25.0, points)
    clean = 9000.0 * np.exp(-q / 4.0) + 150.0
    clean += 400.0 * scale * np.exp(-q / 9.0) * (1 + np.sin(2.6 * q - shift))
    noisy = rng.poisson(np.maximum(clean, 1.0)).astype(float)
    return q, noisy, np.sqrt(np.maximum(noisy, 1.0))


def sq_pattern(rng, points=1500, scale=1.0, shift=0.0):
    """The total-scattering structure factor: oscillates about 1, damped at high Q."""
    q = np.linspace(0.5, 25.0, points)
    clean = 1.0 + scale * 0.85 * np.exp(-q / 11.0) * np.sin(2.7 * q - shift)
    noisy = clean + rng.normal(0.0, 0.01, size=q.shape)
    return q, noisy, np.full_like(q, 0.01)


def fq_pattern(rng, points=1500, scale=1.0, shift=0.0):
    """The reduced structure function F(Q) = Q * (S(Q) - 1)."""
    q, s, _ = sq_pattern(rng, points=points, scale=scale, shift=shift)
    clean = q * (s - 1.0)
    noisy = clean + rng.normal(0.0, 0.02, size=q.shape)
    return q, noisy, np.full_like(q, 0.02)


def gr_pattern(rng, points=1500, scale=1.0, shift=0.0):
    """The pair distribution function: sharp peaks at bond distances plus
    small Fourier-termination ripples either side."""
    r = np.linspace(0.0, 20.0, points)
    clean = np.zeros_like(r)
    for centre, height in GR_SHELLS:
        clean += height * scale * np.exp(-0.5 * ((r - centre - shift) / 0.08) ** 2)
        clean -= (
            0.12 * height * scale * np.exp(-0.5 * ((r - centre - 0.35) / 0.15) ** 2)
        )
    noisy = clean + rng.normal(0.0, 0.015, size=r.shape)
    return r, noisy, np.full_like(r, 0.015)


GENERATORS = {
    "pxrd": pxrd_pattern,
    "iq": iq_pattern,
    "sq": sq_pattern,
    "fq": fq_pattern,
    "gr": gr_pattern,
}


def payload(name, x, y, e, filenumber, x_label, y_label, data_type, fit=None) -> dict:
    ext = AXES[data_type][2]
    body = {
        "data": {
            "name": name,
            "x": x.tolist(),
            "y": y.tolist(),
            "e": e.tolist(),
            "filepath": f"/dls/i11/data/2026/cm12345-1/{name}.{ext}",
            "filenumber": filenumber,
            "x_label": x_label,
            "y_label": y_label,
            "data_type": data_type,
        },
        "plot_type": "line",
    }
    if fit is not None:
        body["fit"] = {"name": f"{name} · fit", "x": x.tolist(), "y": fit.tolist()}
    return body


def post(endpoint: str, body: dict, label: str) -> None:
    response = requests.post(endpoint, json=body, timeout=30)
    response.raise_for_status()
    result = response.json()
    evicted = f" (evicted {len(result['evicted'])})" if result["evicted"] else ""
    print(f"posted {label} -> {result['id']}{evicted}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--url", default="http://localhost:8000", help="server base URL"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=3,
        help="scans to post (--live: number of live updates instead)",
    )
    parser.add_argument("--points", type=int, default=1500, help="points per curve")
    parser.add_argument(
        "--types",
        nargs="+",
        choices=DEMO_TYPES,
        default=None,
        help=f"data types to post per scan (default: all of {', '.join(DEMO_TYPES)})",
    )
    parser.add_argument(
        "--start-filenumber", type=int, default=1, help="file number of the first scan"
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="repeatedly upsert one trace (of --types' first type) instead of "
        "posting a batch of new scans",
    )
    parser.add_argument(
        "--interval", type=float, default=0.0, help="seconds to wait between posts"
    )
    args = parser.parse_args()

    rng = np.random.default_rng(1234)
    endpoint = f"{args.url.rstrip('/')}/plot"
    types = args.types or DEMO_TYPES

    if args.live:
        data_type = types[0]
        x_label, y_label, _ = AXES[data_type]
        for index in range(args.count):
            x, y, e = GENERATORS[data_type](
                rng, points=args.points, scale=1.0 - 0.02 * index, shift=0.0
            )
            body = payload(
                "live-scan",
                x,
                y,
                e,
                filenumber=args.start_filenumber,
                x_label=x_label,
                y_label=y_label,
                data_type=data_type,
            )
            body["upsert"] = True
            post(endpoint, body, f"live-scan update {index + 1} [{data_type}]")
            if args.interval and index < args.count - 1:
                time.sleep(args.interval)
        return

    for scan in range(args.count):
        filenumber = args.start_filenumber + scan
        for data_type in types:
            x_label, y_label, _ = AXES[data_type]
            x, y, e = GENERATORS[data_type](
                rng, points=args.points, scale=1.0 - 0.05 * scan, shift=0.02 * scan
            )
            fit = None
            if data_type == "pxrd" and scan == 0:
                kernel = np.ones(9) / 9
                fit = np.convolve(y, kernel, mode="same")
            name = f"{data_type}-{filenumber:03d}"
            body = payload(
                name, x, y, e, filenumber, x_label, y_label, data_type, fit=fit
            )
            post(endpoint, body, f"{name} [{data_type}] file #{filenumber}")
        if args.interval and scan < args.count - 1:
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
