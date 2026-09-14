"""Interface for ``python -m xrddatavis``."""

from pathlib import Path

import click

from xrddatavis._version import __version__
from xrddatavis.config import Config

__all__ = ["main"]


@click.group(invoke_without_command=True)
@click.version_option(version=__version__, message="%(version)s")
@click.option(
    "--config",
    type=click.Path(path_type=Path),
    default=None,
    help="Path to config file",
)
@click.option(
    "--host",
    type=str,
    default=None,
    help="Host override",
)
@click.option(
    "--port",
    type=int,
    default=None,
    help="port override",
)
@click.pass_context
def main(
    ctx: click.Context,
    host: str | None,
    port: int | None,
    config: Path | None,
) -> None:

    try:
        loaded_config = Config.load_config(config)
    except FileNotFoundError as fnfe:
        raise FileNotFoundError(f"Config file not found: {fnfe.filename}") from fnfe

    if host:
        loaded_config.server.host = host

    if port:
        loaded_config.server.port = port

    ctx.ensure_object(dict)
    ctx.obj["config"] = loaded_config

    if ctx.invoked_subcommand is None:
        print("Please invoke subcommand!")


@main.command(name="serve")
@click.pass_context
def serve(ctx: click.Context):

    import uvicorn

    from xrddatavis.server import start_api

    config = ctx.obj["config"]

    uvicorn.run(
        start_api(config),
        factory=False,
        host=config.server.host,
        port=int(config.server.port),
        reload=False,
    )


if __name__ == "__main__":
    main()
