import os
from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    suppress_polling_logs: bool = False


class ResultsConfig(BaseModel):
    # time to live seconds - how long the results
    # from a process can live before being being valid for removal
    ttl_seconds: int = 3600  # 3600s = 1hr


class CleanupConfig(BaseModel):
    # how frequently the cleanup job actually runs
    interval_seconds: int = 300


class AlertConfig(BaseModel):
    slack_webhook_url: str | None = None


class Config(BaseSettings):
    server: ServerConfig = Field(default_factory=ServerConfig)
    results: ResultsConfig = Field(default_factory=ResultsConfig)
    cleanup: CleanupConfig = Field(default_factory=CleanupConfig)
    alerts: AlertConfig = Field(default_factory=AlertConfig)

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
