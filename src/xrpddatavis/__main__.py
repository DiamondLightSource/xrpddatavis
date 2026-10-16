"""Interface for ``python -m xrpddatavis``."""

from pathlib import Path

import click

from xrpddatavis._version import __version__
from xrpddatavis.config import Config

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

    from xrpddatavis.server import start_api

    config = ctx.obj["config"]

    uvicorn.run(
        start_api(config),
        factory=False,
        host=config.server.host,
        port=int(config.server.port),
        reload=False,
    )


# frontend/ only exists in a source checkout (it isn't shipped in the wheel)
DEFAULT_FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


@main.command(name="build")
@click.option(
    "--frontend-dir",
    type=click.Path(path_type=Path, file_okay=False),
    default=DEFAULT_FRONTEND_DIR,
    show_default=True,
    help="Path to the frontend source directory",
)
@click.option(
    "--install/--no-install",
    default=True,
    show_default=True,
    help="Run 'npm ci' before building",
)
def build(frontend_dir: Path, install: bool):
    """Rebuild the web frontend into the package's static/ directory."""

    import shutil
    import subprocess

    if not (frontend_dir / "package.json").is_file():
        raise click.ClickException(
            f"No package.json in {frontend_dir} - build needs a source checkout, "
            "or pass --frontend-dir"
        )

    npm = shutil.which("npm")
    if npm is None:
        raise click.ClickException("npm not found on PATH")

    steps = [["ci"]] if install else []
    steps.append(["run", "build"])

    for args in steps:
        label = " ".join(["npm", *args])
        click.echo(f"Running '{label}' in {frontend_dir}")
        result = subprocess.run([npm, *args], cwd=frontend_dir)
        if result.returncode != 0:
            raise click.ClickException(
                f"'{label}' failed with exit code {result.returncode}"
            )

    click.echo("Frontend built")


if __name__ == "__main__":
    main()
