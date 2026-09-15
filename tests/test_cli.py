import subprocess
import sys

from xrpddatavis import __version__


def test_cli_version():
    cmd = [sys.executable, "-m", "xrpddatavis", "--version"]
    assert subprocess.check_output(cmd).decode().strip() == __version__
