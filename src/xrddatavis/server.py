from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

import xrddatavis
from xrddatavis._version import __version__
from xrddatavis.config import Config
from xrddatavis.endpoints import HEALTH_ROUTE
from xrddatavis.logger import logger

ROUTER = APIRouter()


config: Config = Config.load_config()


@ROUTER.get(HEALTH_ROUTE)
async def health():
    return {"status": "ok"}


@asynccontextmanager
async def lifespan(app: FastAPI):

    logger.info(f"xrddatavis started: {__version__}")

    yield

    logger.info("Shutting down")


def start_api() -> FastAPI:

    app = FastAPI(
        title=xrddatavis.__name__.capitalize(),
        version=__version__,
        description="An API for PDFGetX3 jobs",
        lifespan=lifespan,
    )

    # Include API routes
    app.include_router(ROUTER)
    return app
