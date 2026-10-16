import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from click.testing import CliRunner

from xrpddatavis import __version__
from xrpddatavis.__main__ import DEFAULT_FRONTEND_DIR, main


def test_cli_version():
    cmd = [sys.executable, "-m", "xrpddatavis", "--version"]
    assert subprocess.check_output(cmd).decode().strip() == __version__


@pytest.fixture
def frontend_dir(tmp_path: Path) -> Path:
    (tmp_path / "package.json").write_text("{}")
    return tmp_path


@pytest.fixture
def npm_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple[list[str], Path]]:
    """Stand in for npm: record each call instead of running it."""
    calls: list[tuple[list[str], Path]] = []

    def fake_run(cmd, cwd):
        calls.append((cmd, cwd))
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(subprocess, "run", fake_run)
    return calls


def test_build_default_frontend_dir_is_source_checkout():
    assert (DEFAULT_FRONTEND_DIR / "package.json").is_file()


def test_build_installs_then_builds(frontend_dir, npm_calls):
    result = CliRunner().invoke(main, ["build", "--frontend-dir", str(frontend_dir)])

    assert result.exit_code == 0, result.output
    assert npm_calls == [
        (["/usr/bin/npm", "ci"], frontend_dir),
        (["/usr/bin/npm", "run", "build"], frontend_dir),
    ]
    assert "Frontend built" in result.output


def test_build_no_install_skips_npm_ci(frontend_dir, npm_calls):
    result = CliRunner().invoke(
        main, ["build", "--frontend-dir", str(frontend_dir), "--no-install"]
    )

    assert result.exit_code == 0, result.output
    assert npm_calls == [(["/usr/bin/npm", "run", "build"], frontend_dir)]


def test_build_missing_package_json(tmp_path, npm_calls):
    result = CliRunner().invoke(main, ["build", "--frontend-dir", str(tmp_path)])

    assert result.exit_code == 1
    assert "No package.json" in result.output
    assert npm_calls == []


def test_build_npm_not_on_path(frontend_dir, monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda name: None)

    result = CliRunner().invoke(main, ["build", "--frontend-dir", str(frontend_dir)])

    assert result.exit_code == 1
    assert "npm not found" in result.output


def test_build_stops_on_failed_step(frontend_dir, monkeypatch):
    calls = []

    def failing_run(cmd, cwd):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 2)

    monkeypatch.setattr(shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(subprocess, "run", failing_run)

    result = CliRunner().invoke(main, ["build", "--frontend-dir", str(frontend_dir)])

    assert result.exit_code == 1
    assert "'npm ci' failed with exit code 2" in result.output
    assert calls == [["/usr/bin/npm", "ci"]]
