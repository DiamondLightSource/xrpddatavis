[![CI](https://github.com/DiamondLightSource/xrpddatavis/actions/workflows/ci.yml/badge.svg)](https://github.com/DiamondLightSource/xrpddatavis/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/DiamondLightSource/xrpddatavis/branch/main/graph/badge.svg)](https://codecov.io/gh/DiamondLightSource/xrpddatavis)
[![PyPI](https://img.shields.io/pypi/v/xrpddatavis.svg)](https://pypi.org/project/xrpddatavis)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

# xrpddatavis

Send 1D data (x, y and optional errors) to `/plot`, and it shows up straight
away in a web page at `/`: a list of plots on the left and an interactive
chart on the right. Plots can be overlaid, offset or shown in a grid, and
filtered by data type, file number or instrument session.

The server keeps at most `max_plots` plots, and removes each one
`ttl_seconds` after it arrives (see [Configuration](#configuration)).

| What | Where |
| --- | --- |
| Source | <https://github.com/DiamondLightSource/xrpddatavis> |
| PyPI | `pip install xrpddatavis` |
| Docker | `docker run ghcr.io/diamondlightsource/xrpddatavis:latest` |
| Releases | <https://github.com/DiamondLightSource/xrpddatavis/releases> |

## Run it

```bash
xrpddatavis serve
```

Open <http://localhost:8000/>. The API docs are at <http://localhost:8000/docs>.

From a git checkout, build the frontend once first (PyPI and Docker already
include it):

```bash
xrpddatavis build
```

## Sending a plot

POST JSON to `/plot`. Only `title`, `x` and `y` are required:

```bash
curl -X POST http://localhost:8000/plot \
  -H 'Content-Type: application/json' \
  -d '{"title": "sample-001", "x": [10.0, 10.1, 10.2], "y": [120, 340, 118]}'
```

Optional fields:

| Field | What it does |
| --- | --- |
| `e` | Error on each `y` point |
| `x_label`, `y_label` | Axis labels |
| `data_type` | Groups plots into tabs, e.g. `pxrd`, `gr`, `sq` |
| `filepath` | Source file. A Diamond path (`/dls/i11/data/2026/cm12345-1/...`) also sets the instrument session |
| `filenumber` | Groups plots by file number |
| `plot_type` | `line` (default), `scatter` or `line+markers` |
| `upsert` | `true` replaces the plot with the same `title`, instead of adding another: for live scans |
| `calc` | A fitted curve on the same `x`; makes it a fitted plot. Can add `diff`, `background` and `markers` |

The full schema, with examples you can try, is at `/docs`.

### Demo data

With the server running, [`examples/feed_demo.py`](examples/feed_demo.py) posts
3 scans of made-up `pxrd`, `iq`, `sq`, `fq` and `gr` data:

```bash
python examples/feed_demo.py
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/plot` | Add a plot (or replace one, with `upsert`) |
| `GET` | `/liveplots` | Every live plot, without its data |
| `GET` | `/plot/{id}` | One plot, with its data |
| `PATCH` | `/edit/{id}` | Change `name`, `plot_type`, `colour_index`, `data_type` or `pinned` |
| `DELETE` | `/remove/{id}` | Delete one plot |
| `DELETE` | `/plots` | Delete every plot |
| `GET` | `/events` | A message each time the plots change (server-sent events) |
| `GET` | `/limits` | `max_plots` and `ttl_seconds` |
| `GET` | `/info` | The beamline name and logout link, for the page header |
| `GET` | `/user` | The logged-in user; `204` when auth is off |
| `GET` | `/healthz` | Health check |

## Configuration

Settings are in `config.yaml` (or the file given by `CONFIG_PATH`):

```yaml
server:
  host: "0.0.0.0"
  port: 8000
  suppress_polling_logs: true   # hide access logs for /liveplots, /events, /healthz

beamline:
  name: "i11"                   # shown in the page header

plots:
  max_plots: 20                 # oldest plot is removed when this is exceeded
  ttl_seconds: 3600             # each plot is removed this long after it arrives
  max_points: 1000000           # largest trace POST /plot accepts

cleanup:
  interval_seconds: 300         # how often expired plots are removed

auth:
  enabled: false                # see Authentication
```

When deployed, the same settings go under `config:` in
[`helm/xrpddatavis/values.yaml`](helm/xrpddatavis/values.yaml).

## Authentication

Deployed, users log in with their Diamond account, the same way Atlas and
BlueAPI do it:

- **oauth2-proxy** (part of the Helm chart) sits in front of the app and
  sends anyone not logged in to Keycloak (`identity.diamond.ac.uk`). It then
  forwards each request with the user's access token.
- **The app** checks that token (signature, issuer, audience, expiry) and
  reads the user's `fedid` from it (`src/xrpddatavis/auth/oidc.py`).
- Without a token, every route returns `401` except `POST /plot`, `/healthz`
  and the page itself. Anyone can send plots.

Use the user in an endpoint:

```python
from xrpddatavis.auth.oidc import AccessToken, CurrentUser

@ROUTER.get("/my-plots")
async def my_plots(user: CurrentUser, token: AccessToken):
    user.fedid  # also user.name, user.email; token is the raw access token
```

Settings are `auth:` in `config.yaml`. Locally, `enabled: false` (no
login). The Helm chart turns it on and sets the issuer and audience from
`auth:` in `values.yaml`. Deploying, including the Keycloak client and the
sealed secret, is covered in [helm/README.md](helm/README.md).

### Testing against the real Keycloak locally

Nothing runs locally except the app. You get a real token with `curl` and
send it to the app. This checks the client ID and secret, the `fedid` claim
and the audience before you seal anything. Only the kubeseal step and the
browser login can't be checked locally.

One-off:

- Ask for **OAuth 2.0 Device Authorization Grant** to be enabled on the
  Keycloak client, and the **`fedid`** client scope as a default scope.
- Put the decrypted values in `.env` at the repo root. It's git-ignored;
  never commit it.

  ```bash
  CLIENT_ID=<client id>
  CLIENT_SECRET=<decrypted client secret>
  ```

Each time:

1. Set `auth.enabled: true` in `config.yaml`, then run `xrpddatavis serve`.
2. Ask Keycloak for a login code, then open the `verification_uri_complete`
   link it prints and log in:

   ```bash
   set -a; . ./.env; set +a
   KC=https://identity.diamond.ac.uk/realms/dls/protocol/openid-connect
   curl -s $KC/auth/device -d client_id=$CLIENT_ID -d client_secret=$CLIENT_SECRET \
     -d scope=openid | tee /tmp/device.json
   ```

3. Swap the code for a token, then call the app:

   ```bash
   TOKEN=$(curl -s $KC/token -d client_id=$CLIENT_ID -d client_secret=$CLIENT_SECRET \
     -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
     -d device_code=$(python -c 'import json; print(json.load(open("/tmp/device.json"))["device_code"])') \
     | python -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

   curl -H "Authorization: Bearer $TOKEN" localhost:8000/user   # 200, your fedid
   curl -i localhost:8000/liveplots                             # 401, no token
   ```

4. Set `auth.enabled` back to `false` for UI work. Browser login only works
   when deployed, behind oauth2-proxy.

| Symptom | Cause |
| --- | --- |
| step 2: `unauthorized_client` | device grant not enabled on the client |
| step 2: `invalid_client` | wrong client ID or secret, so it would fail deployed too |
| step 3: `authorization_pending` | finish logging in at the step 2 link first |
| `Invalid access token: Audience doesn't match` | `auth.client_audience` doesn't match the token's `aud` |
| `/user` gives `403 ... no fedid claim` | the `fedid` scope isn't a default scope on the client |

## Using the page

- Tick plots to show them. Choose Overlay, Offset or Grid on the right.
- The tabs, file-number chips, session picker and search box filter the list.
- Double-click a name to rename it; click its colour swatch to change colour.
- Click 📌 to stop a plot expiring.
- **Upload file…** plots a local column file, including PDFgetX files with
  their header.
- Your selection, layout and theme are saved in your browser; the plots are
  shared by everyone.

Frontend source and development: [`frontend/readme.md`](frontend/readme.md).
