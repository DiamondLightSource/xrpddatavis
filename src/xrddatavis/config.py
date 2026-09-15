import os
from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BeamlineConfig(BaseModel):
    # which beamline this instance is deployed on, e.g. "i11" - shown in the
    # frontend's title bar. Left blank outside a beamline deployment.
    name: str = ""


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    suppress_polling_logs: bool = False


class PlotsConfig(BaseModel):
    # maximum number of plots held by the server - and therefore the maximum
    # number that can be displayed - at any one time. Once full, the oldest
    # plot is evicted to make room for a new one.
    max_plots: int = Field(default=20, ge=1)

    # time to live seconds - how long a plot can live
    # before being valid for removal
    ttl_seconds: int = Field(default=3600, ge=1)  # 3600s = 1hr

    # maximum number of points accepted in a single trace, to stop one
    # oversized POST exhausting the server's memory
    max_points: int = Field(default=1_000_000, ge=1)


class CleanupConfig(BaseModel):
    # how frequently the cleanup job actually runs
    interval_seconds: int = Field(default=300, ge=1)


class Config(BaseSettings):
    server: ServerConfig = Field(default_factory=ServerConfig)
    beamline: BeamlineConfig = Field(default_factory=BeamlineConfig)
    plots: PlotsConfig = Field(default_factory=PlotsConfig)
    cleanup: CleanupConfig = Field(default_factory=CleanupConfig)

    model_config = SettingsConfigDict(
        env_nested_delimiter="__",
        extra="ignore",
    )

    @classmethod
    def load_config(cls, path: str | Path | None = None) -> Self:
        if path is None:
            env_path = os.getenv("CONFIG_PATH")
            if env_path:
                path = Path(env_path)
            else:
                candidate = Path("/etc/config/config.yaml")
                path = candidate if candidate.exists() else Path("config.yaml")

        path = Path(path)

        data = {}
        if path.exists():
            with open(path) as f:
                data = yaml.safe_load(f) or {}

        # 1. load YAML into model
        # 2. allow env vars to override it
        return cls.model_validate(data)


def load_config(path: str | Path | None = None) -> Config:
    return Config.load_config(path)
