from pathlib import Path

import pytest
from pydantic import ValidationError

from xrpddatavis.config import Config, load_config

YAML = """
beamline:
  name: i15-1
plots:
  max_plots: 7
  db_path: /data/plots.db
cleanup:
  interval_seconds: 10
"""


@pytest.fixture(autouse=True)
def _no_config_env(monkeypatch):
    """Keep a CONFIG_PATH or override set on the machine out of these tests."""
    for name in ("CONFIG_PATH", "PLOTS__MAX_PLOTS", "PLOTS__TTL_SECONDS"):
        monkeypatch.delenv(name, raising=False)


def write_config(path: Path, text: str = YAML) -> Path:
    path.write_text(text)
    return path


def assert_loaded_from_yaml(config: Config) -> None:
    assert config.beamline.name == "i15-1"
    assert config.plots.max_plots == 7
    assert config.plots.db_path == "/data/plots.db"
    assert config.cleanup.interval_seconds == 10
    # fields the file leaves out keep their defaults
    assert config.plots.ttl_seconds == 3600
    assert config.server.port == 8000


def test_defaults():
    config = Config()
    assert config.beamline.name == ""
    assert config.server.host == "0.0.0.0"
    assert config.plots.max_plots == 20
    assert config.plots.db_path == "plots.db"
    assert config.cleanup.interval_seconds == 300


@pytest.mark.parametrize("as_str", [True, False])
def test_load_from_an_explicit_path(tmp_path, as_str):
    path = write_config(tmp_path / "custom.yaml")
    assert_loaded_from_yaml(Config.load_config(str(path) if as_str else path))


def test_load_from_config_path_env(tmp_path, monkeypatch):
    path = write_config(tmp_path / "from-env.yaml")
    monkeypatch.setenv("CONFIG_PATH", str(path))
    assert_loaded_from_yaml(Config.load_config())


@pytest.mark.skipif(
    Path("/etc/config/config.yaml").exists(),
    reason="the /etc/config mount takes precedence over ./config.yaml",
)
def test_falls_back_to_config_yaml_in_the_cwd(tmp_path):
    # conftest runs each test from tmp_path
    write_config(tmp_path / "config.yaml")
    assert_loaded_from_yaml(Config.load_config())


def test_missing_file_gives_defaults(tmp_path):
    assert Config.load_config(tmp_path / "absent.yaml") == Config()


def test_empty_file_gives_defaults(tmp_path):
    assert Config.load_config(write_config(tmp_path / "empty.yaml", "")) == Config()


def test_unknown_keys_are_ignored(tmp_path):
    path = write_config(tmp_path / "extra.yaml", "nonsense: 1\nplots:\n  max_plots: 2")
    assert Config.load_config(path).plots.max_plots == 2


@pytest.mark.parametrize(
    "text",
    [
        "plots:\n  max_plots: 0",
        "plots:\n  ttl_seconds: 0",
        "plots:\n  max_points: 0",
        "cleanup:\n  interval_seconds: 0",
        "plots:\n  max_plots: lots",
    ],
)
def test_invalid_values_are_rejected(tmp_path, text):
    with pytest.raises(ValidationError):
        Config.load_config(write_config(tmp_path / "bad.yaml", text))


def test_env_vars_fill_fields_the_file_leaves_out(tmp_path, monkeypatch):
    monkeypatch.setenv("PLOTS__TTL_SECONDS", "42")
    config = Config.load_config(write_config(tmp_path / "config.yaml"))
    assert config.plots.ttl_seconds == 42
    assert config.plots.max_plots == 7


def test_module_level_load_config(tmp_path):
    assert_loaded_from_yaml(load_config(write_config(tmp_path / "config.yaml")))
