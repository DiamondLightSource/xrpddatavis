import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import xrddatavis
from xrddatavis._version import __version__
from xrddatavis.config import Config
from xrddatavis.endpoints import (
    CLEAR_PLOTS,
    EDIT_PLOT,
    EVENTS,
    HEALTH_ROUTE,
    LIMITS,
    LIVEPLOTS,
    PLOT,
    PLOT_DATA,
    REMOVE_PLOT,
    STATIC,
    UI,
)
from xrddatavis.logger import logger, suppress_polling_logs
from xrddatavis.models import (
    LivePlots,
    PlotData,
    PlotRequest,
    PlotResponse,
    PlotSummary,
    PlotUpdate,
    XYEData,
)
from xrddatavis.store import ResultStore

ROUTER = APIRouter()

STATIC_DIR = Path(__file__).parent / "static"

# how often the SSE stream checks the store for changes, and how often it
# sends a keep-alive comment so proxies don't close an idle connection
EVENT_POLL_SECONDS = 0.5
EVENT_KEEPALIVE_SECONDS = 15.0


def get_store(request: Request) -> ResultStore:
    return request.app.state.store


def get_config(request: Request) -> Config:
    return request.app.state.config


@ROUTER.get(HEALTH_ROUTE, tags=["health"])
async def health():
    return {"status": "ok"}


@ROUTER.get(LIMITS, tags=["plots"])
async def limits(request: Request) -> dict[str, int]:
    """The display limits the frontend has to honour."""
    store = get_store(request)
    return {"max_plots": store.max_plots, "ttl_seconds": store.ttl_seconds}


@ROUTER.post(PLOT, tags=["plots"], status_code=201)
async def plot(
    request: Request,
    body: PlotRequest | XYEData = Body(
        ...,
        openapi_examples={
            "bare": {
                "summary": "A bare XYEData document",
                "value": {
                    "name": "sample-001",
                    "x": [10.0, 10.1, 10.2],
                    "y": [120.0, 340.0, 118.0],
                },
            },
            "with_fit": {
                "summary": "Data plus a fit and an explicit plot type",
                "value": {
                    "data": {
                        "name": "sample-001",
                        "x": [10.0, 10.1, 10.2],
                        "y": [120.0, 340.0, 118.0],
                        "e": [11.0, 18.4, 10.9],
                        "filepath": "/dls/i11/data/sample-001.xye",
                        "filenumber": 1,
                        "data_type": "pxrd",
                    },
                    "fit": {
                        "name": "sample-001 fit",
                        "x": [10.0, 10.1, 10.2],
                        "y": [119.0, 341.0, 119.0],
                    },
                    "plot_type": "line",
                    "upsert": False,
                },
            },
        },
    ),
) -> PlotResponse:
    """Accept a trace and make it available to the frontend."""
    store = get_store(request)
    config = get_config(request)

    payload = body if isinstance(body, PlotRequest) else PlotRequest(data=body)

    for trace in (payload.data, payload.fit):
        if trace is not None and len(trace.x) > config.plots.max_points:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"'{trace.name}' has {len(trace.x)} points, "
                    f"which exceeds plots.max_points={config.plots.max_points}"
                ),
            )

    stored = PlotData(
        data=payload.data,
        fit=payload.fit,
        plot_type=payload.plot_type,
    )
    if payload.upsert:
        stored, evicted = store.upsert(stored)
    else:
        stored, evicted = store.add(stored)

    logger.info(
        "plotted '%s' (%d points) as %s",
        stored.data.name,
        len(stored.data.x),
        stored.id,
    )

    return PlotResponse(
        name=stored.data.name,
        plotted=True,
        id=stored.id,
        expires_at=stored.expires_at(store.ttl_seconds),
        evicted=[item.id for item in evicted],
    )


@ROUTER.get(LIVEPLOTS, tags=["plots"])
async def liveplots(request: Request) -> LivePlots:
    """Metadata for every live plot - what the table on the left is built from."""
    store = get_store(request)
    return LivePlots(
        plots=store.summaries(),
        max_plots=store.max_plots,
        ttl_seconds=store.ttl_seconds,
        revision=store.revision,
    )


@ROUTER.get(PLOT_DATA, tags=["plots"])
async def plot_data(request: Request, id: str) -> PlotData:
    """The full arrays for one plot."""
    stored = get_store(request).get(id)
    if stored is None:
        raise HTTPException(status_code=404, detail=f"No plot with id {id}")
    return stored


@ROUTER.patch(EDIT_PLOT, tags=["plots"])
async def edit_plot(request: Request, id: str, changes: PlotUpdate) -> PlotSummary:
    """Rename a plot, change how it is drawn, or move it to another colour."""
    store = get_store(request)
    updated = store.update(id, changes)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"No plot with id {id}")
    return updated.summary(store.ttl_seconds)


@ROUTER.delete(REMOVE_PLOT, tags=["plots"])
async def remove_plot(request: Request, id: str) -> dict[str, str]:
    removed = get_store(request).remove(id)
    if removed is None:
        raise HTTPException(status_code=404, detail=f"No plot with id {id}")
    return {"removed": str(removed.id), "name": removed.data.name}


@ROUTER.delete(CLEAR_PLOTS, tags=["plots"])
async def clear_plots(request: Request) -> dict[str, int]:
    return {"removed": get_store(request).clear()}


@ROUTER.get(EVENTS, tags=["plots"])
async def events(request: Request) -> StreamingResponse:
    """Server-sent events: one message whenever the set of plots changes.

    The payload is only a revision number - the frontend re-fetches
    ``/liveplots`` when it sees one it hasn't handled.
    """
    store = get_store(request)

    async def stream() -> AsyncIterator[str]:
        last_sent = -1
        since_keepalive = 0.0
        while True:
            if await request.is_disconnected():
                break
            store.purge_expired()
            revision = store.revision
            if revision != last_sent:
                last_sent = revision
                since_keepalive = 0.0
                yield f"data: {json.dumps({'revision': revision})}\n\n"
            elif since_keepalive >= EVENT_KEEPALIVE_SECONDS:
                since_keepalive = 0.0
                yield ": keep-alive\n\n"
            await asyncio.sleep(EVENT_POLL_SECONDS)
            since_keepalive += EVENT_POLL_SECONDS

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # don't let nginx buffer the stream
        },
    )


@ROUTER.get(UI, include_in_schema=False)
async def ui() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


async def _cleanup_loop(store: ResultStore, interval_seconds: int) -> None:
    """Drop expired plots on a schedule, as well as lazily on every read."""
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            store.purge_expired()
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - defensive, keep the loop alive
            logger.exception("cleanup pass failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    config: Config = app.state.config
    logger.info(
        "xrddatavis started: %s (max_plots=%d, ttl=%ds)",
        __version__,
        config.plots.max_plots,
        config.plots.ttl_seconds,
    )

    cleanup = asyncio.create_task(
        _cleanup_loop(app.state.store, config.cleanup.interval_seconds)
    )

    yield

    cleanup.cancel()
    try:
        await cleanup
    except asyncio.CancelledError:
        pass

    logger.info("Shutting down")


def start_api(config: Config | None = None) -> FastAPI:
    config = config or Config.load_config()

    app = FastAPI(
        title=xrddatavis.__name__.capitalize(),
        version=__version__,
        description=(
            "Post XYEData documents to /plot and watch them appear on the "
            "web frontend served at /."
        ),
        lifespan=lifespan,
    )

    if config.server.suppress_polling_logs:
        suppress_polling_logs([HEALTH_ROUTE, LIVEPLOTS, EVENTS])

    app.state.config = config
    app.state.store = ResultStore(
        ttl_seconds=config.plots.ttl_seconds,
        max_plots=config.plots.max_plots,
    )

    app.include_router(ROUTER)
    app.mount(STATIC, StaticFiles(directory=STATIC_DIR), name="static")
    return app
