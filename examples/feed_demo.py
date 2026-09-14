#!/usr/bin/env python
"""Post synthetic powder-diffraction patterns at a running xrddatavis server.

Examples
--------
Fill the server with five patterns and a fit::

    python examples/feed_demo.py --count 5

Watch a single trace update live for a minute, as a scan would::

    python examples/feed_demo.py --live --interval 2 --count 30
"""

import argparse
import time

import numpy as np
import requests

PEAKS = [
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


def pattern(
    rng: np.random.Generator,
    points: int = 2000,
    scale: float = 1.0,
    shift: float = 0.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """A background plus pseudo-Voigt peaks with Poisson counting noise."""
    x = np.linspace(10.0, 60.0, points)
    background = 120.0 + 900.0 * np.exp(-(x - 10.0) / 12.0)
    signal = np.zeros_like(x)
    for centre, height, width in PEAKS:
        gauss = np.exp(-0.5 * ((x - centre - shift) / width) ** 2)
        lorentz = 1.0 / (1.0 + ((x - centre - shift) / width) ** 2)
        signal += height * 9000.0 * scale * (0.7 * gauss + 0.3 * lorentz)
    clean = background + signal
    noisy = rng.poisson(clean).astype(float)
    return x, noisy, np.sqrt(np.maximum(noisy, 1.0))


def payload(name: str, x, y, e, filenumber: int, fit=None) -> dict:
    body = {
        "data": {
            "name": name,
            "x": x.tolist(),
            "y": y.tolist(),
            "e": e.tolist(),
            "filepath": f"/dls/i11/data/2026/cm12345-1/{name}.xye",
            "filenumber": filenumber,
            "x_label": "2θ / °",
            "y_label": "Intensity / counts",
        },
        "plot_type": "line",
    }
    if fit is not None:
        body["fit"] = {
            "name": f"{name} · fit",
            "x": x.tolist(),
            "y": fit.tolist(),
        }
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url", default="http://localhost:8000", help="server base URL"
    )
    parser.add_argument("--count", type=int, default=5, help="how many posts to make")
    parser.add_argument("--points", type=int, default=2000, help="points per pattern")
    parser.add_argument(
        "--live",
        action="store_true",
        help="post repeated updates of one trace (upsert) instead of new plots",
    )
    parser.add_argument(
        "--interval", type=float, default=0.0, help="seconds to wait between posts"
    )
    args = parser.parse_args()

    rng = np.random.default_rng(1234)
    endpoint = f"{args.url.rstrip('/')}/plot"

    for index in range(args.count):
        x, y, e = pattern(
            rng,
            points=args.points,
            scale=1.0 - 0.06 * index,
            shift=0.01 * index,
        )
        if args.live:
            body = payload("live-scan", x, y, e, filenumber=1)
            body["upsert"] = True
            label = f"live-scan update {index + 1}"
        else:
            # give the first pattern a smooth fit to overlay on top of it
            fit = None
            if index == 0:
                kernel = np.ones(9) / 9
                fit = np.convolve(y, kernel, mode="same")
            body = payload(
                f"sample-{index + 1:03d}", x, y, e, filenumber=index + 1, fit=fit
            )
            label = body["data"]["name"]

        response = requests.post(endpoint, json=body, timeout=30)
        response.raise_for_status()
        result = response.json()
        evicted = f" (evicted {len(result['evicted'])})" if result["evicted"] else ""
        print(f"posted {label} -> {result['id']}{evicted}")

        if args.interval and index < args.count - 1:
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
