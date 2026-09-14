import subprocess
import sys

from xrddatavis import __version__


def test_cli_version():
    cmd = [sys.executable, "-m", "xrddatavis", "--version"]
    assert subprocess.check_output(cmd).decode().strip() == __version__
