[![CI](https://github.com/DiamondLightSource/xrddatavis/actions/workflows/ci.yml/badge.svg)](https://github.com/DiamondLightSource/xrddatavis/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/DiamondLightSource/xrddatavis/branch/main/graph/badge.svg)](https://codecov.io/gh/DiamondLightSource/xrddatavis)
[![PyPI](https://img.shields.io/pypi/v/xrddatavis.svg)](https://pypi.org/project/xrddatavis)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

# xrddatavis

A deployable API that can be sent XYEData json messages via POST and then plotted via a web front end.

POST a trace to `/plot` and it appears immediately in the browser at `/`: a table
of every live plot on the left, an interactive Plotly canvas on the right, in the
spirit of DAWN's data visualisation perspective. Plots can be selected and
deselected, overlaid on one pair of axes, offset into a waterfall, or split into a
grid of panels. The server holds at most `plots.max_plots` at a time and clears
each plot `plots.ttl_seconds` after it arrives.

What            | Where
:---:           | :---:
Source          | <https://github.com/DiamondLightSource/xrddatavis>
PyPI            | `pip install xrddatavis`
Docker          | `docker run ghcr.io/diamondlightsource/xrddatavis:latest`
Releases        | <https://github.com/DiamondLightSource/xrddatavis/releases>

## Run it

```
python -m xrddatavis --config config.yaml serve      # or: xrddatavis serve
```

Then open <http://localhost:8000/>. The interactive API docs are at `/docs`.

## Try it with curl

Post a bare `XYEData` document - `name`, `x` and `y` are the only required fields:

```bash
curl -X POST http://localhost:8000/plot \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "quick-test",
    "x": [10.0, 10.1, 10.2, 10.3, 10.4],
    "y": [120, 340, 980, 310, 118]
  }'
```

Post the full form - errors, a fit to overlay, provenance and axis labels:

```bash
curl -X POST http://localhost:8000/plot \
  -H 'Content-Type: application/json' \
  -d '{
    "data": {
      "name": "si-standard",
      "x": [28.0, 28.2, 28.4, 28.6, 28.8],
      "y": [100, 850, 9000, 870, 120],
      "e": [10, 29, 95, 30, 11],
      "filepath": "/dls/i11/data/2026/cm12345-1/si-standard.xye",
      "filenumber": 42,
      "x_label": "2θ / °",
      "y_label": "Intensity / counts"
    },
    "fit": {
      "name": "si-standard · fit",
      "x": [28.0, 28.2, 28.4, 28.6, 28.8],
      "y": [105, 840, 8950, 880, 118]
    },
    "plot_type": "line"
  }'
```

Generate something that looks like a real pattern, straight from the shell:

```bash
python -c '
import json, math, random
x = [10 + i * 0.025 for i in range(2000)]
peaks = [(18.2, 4000), (22.6, 9000), (28.4, 5600), (36.1, 4600), (47.3, 2000)]
y = [120 + 900 * math.exp(-(xi - 10) / 12)
     + sum(h * math.exp(-0.5 * ((xi - c) / 0.1) ** 2) for c, h in peaks)
     for xi in x]
y = [random.gauss(v, v ** 0.5) for v in y]
print(json.dumps({"name": "shell-pattern", "x": x, "y": y,
                  "e": [v ** 0.5 for v in y], "x_label": "2θ / °"}))' \
| curl -X POST http://localhost:8000/plot -H 'Content-Type: application/json' -d @-
```

List what is live (metadata only - this is what the table is built from):

```bash
curl http://localhost:8000/liveplots | python -m json.tool
```

Fetch one plot's arrays, rename it, recolour it, delete it, clear everything:

```bash
ID=$(curl -s http://localhost:8000/liveplots | python -c 'import json,sys; print(json.load(sys.stdin)["plots"][0]["id"])')

curl http://localhost:8000/plot/$ID | python -m json.tool | head -20
curl -X PATCH http://localhost:8000/edit/$ID -H 'Content-Type: application/json' \
     -d '{"name": "renamed", "plot_type": "line+markers", "colour_index": 3}'
curl -X DELETE http://localhost:8000/remove/$ID
curl -X DELETE http://localhost:8000/plots
```

Watch the change stream the frontend uses (one message per store change):

```bash
curl -N http://localhost:8000/events
```

Update one trace in place as a scan progresses, instead of piling up new plots -
the plot keeps its id, its colour and its place in the table:

```bash
curl -X POST http://localhost:8000/plot -H 'Content-Type: application/json' \
  -d '{"upsert": true, "data": {"name": "live-scan", "x": [1,2,3], "y": [4,9,2]}}'
```

### Watch it work end to end

```bash
xrddatavis serve &                              # terminal 1
python examples/feed_demo.py --count 6          # terminal 2: six synthetic patterns
python examples/feed_demo.py --live --count 30 --interval 2   # one trace, updating live
```

Open <http://localhost:8000/>, tick a few rows, and switch between Overlay, Offset
and Grid.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/plot` | Accept an `XYEData` document (bare, or wrapped with `fit`/`plot_type`/`upsert`) |
| `GET` | `/liveplots` | Metadata for every live plot, plus `max_plots`, `ttl_seconds` and a `revision` |
| `GET` | `/plot/{id}` | The full arrays for one plot |
| `PATCH` | `/edit/{id}` | Change `name`, `plot_type` or `colour_index` |
| `DELETE` | `/remove/{id}` | Delete one plot |
| `DELETE` | `/plots` | Delete every plot |
| `GET` | `/events` | Server-sent events - one message whenever the set of plots changes |
| `GET` | `/limits` | `max_plots` and `ttl_seconds` |
| `GET` | `/healthz` | Liveness/readiness |
| `GET` | `/` | The web frontend |

## Configuration

`config.yaml` (mounted at `/etc/config/config.yaml` in the Helm chart, or pointed
at with `CONFIG_PATH`). Any value can be overridden by an environment variable
using `__` as the nesting separator, e.g. `PLOTS__MAX_PLOTS=50`.

```yaml
server:
  host: "0.0.0.0"
  port: 8000
  suppress_polling_logs: true   # drop access logs for /liveplots, /events, /healthz

plots:
  max_plots: 20        # most plots held - and displayable - at once; oldest is evicted
  ttl_seconds: 3600    # a plot is cleared this long after it arrives
  max_points: 1000000  # largest single trace accepted by POST /plot

cleanup:
  interval_seconds: 300  # how often expired plots are swept up
```

The same keys live under `config:` in `helm/xrddatavis/values.yaml`, so
`--set config.plots.max_plots=50` changes the limit on a deployment.

## Frontend notes

* Selection, layout mode, options and theme are remembered per browser; the plots
  themselves are server state shared by everyone looking at the page.
* Colour follows the plot, not its position in the list - the server hands each
  plot a slot in a fixed eight-colour palette validated for colour-vision
  deficiency, and holds it for the plot's lifetime. Click a swatch to change it.
* Double-click a name in the table to rename it.
* Plotly is loaded from cdnjs; the page says so plainly if the browser cannot
  reach it.
