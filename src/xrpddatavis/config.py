import os
from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from xrpddatavis.logger import logger


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

    # sqlite file the plots are kept in, so they survive a restart. Use
    # ":memory:" to keep them in memory only.
    db_path: str = "plots.db"


class AuthConfig(BaseModel):
    """How the server checks who is calling it.

    Login itself (the Keycloak redirect, the client secret and the session
    cookie) is handled by oauth2-proxy in front of the app - see the Helm
    chart. oauth2-proxy forwards each request with an
    ``Authorization: Bearer <access token>`` header, and the server only has
    to verify that token against the issuer's public keys.
    """

    # off by default so a local `xrpddatavis serve` works without Keycloak;
    # the Helm chart turns it on
    enabled: bool = False

    # the Keycloak realm that issues the tokens - its discovery document lives
    # at <issuer>/.well-known/openid-configuration
    issuer: str = "https://identity.diamond.ac.uk/realms/dls"

    # the "aud" claim a token must carry to be accepted
    client_audience: str = "account"

    # Diamond's policy service rule that says whether a user may see an
    # instrument session - plots in sessions they can't see are hidden
    opa_url: str = "https://opa.diamond.ac.uk/v1/data/diamond/policy/session/access"

    # where the frontend sends the user to log out - oauth2-proxy's sign-out
    # route, which clears its cookie then ends the Keycloak session too
    logout_redirect_endpoint: str = "/oauth2/sign_out"

    @property
    def well_known_url(self) -> str:
        return self.issuer.rstrip("/") + "/.well-known/openid-configuration"


class CleanupConfig(BaseModel):
    # how frequently the cleanup job actually runs
    interval_seconds: int = Field(default=300, ge=1)


class Config(BaseSettings):
    server: ServerConfig = Field(default_factory=ServerConfig)
    beamline: BeamlineConfig = Field(default_factory=BeamlineConfig)
    plots: PlotsConfig = Field(default_factory=PlotsConfig)
    cleanup: CleanupConfig = Field(default_factory=CleanupConfig)
    auth: AuthConfig = Field(default_factory=AuthConfig)

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
            logger.info("loading config from %s", path.resolve())
            with open(path) as f:
                data = yaml.safe_load(f) or {}
        else:
            logger.info(
                "no config file found at %s (cwd=%s) - using defaults",
                path.resolve(),
                Path.cwd(),
            )

        # 1. load YAML into model
        # 2. allow env vars to override it
        return cls.model_validate(data)


def load_config(path: str | Path | None = None) -> Config:
    return Config.load_config(path)
