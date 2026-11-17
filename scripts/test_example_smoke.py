from __future__ import annotations

from contextlib import contextmanager
import errno
import json
import socket
import subprocess
import unittest
from urllib.parse import urlparse
from urllib.request import urlopen

from run_example_smoke import run_smoke


@contextmanager
def occupied_legacy_port():
    listener = socket.socket()
    try:
        try:
            listener.bind(("127.0.0.1", 18765))
            listener.listen()
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
            # Another session already supplies the regression condition. Never
            # inspect, kill or otherwise reuse its unrelated server.
        yield
    finally:
        listener.close()


class ExampleSmokeTest(unittest.TestCase):
    def assert_fixture_closed(self, url):
        endpoint = urlparse(url)
        with self.assertRaises(OSError):
            socket.create_connection((endpoint.hostname, endpoint.port), timeout=1)

    def test_owned_fixture_works_with_legacy_port_occupied_and_all_checks_reachable(self):
        commands = []
        urls = []

        def external_command(args, *, cwd, env, check):
            commands.append(list(args))
            if args[-1] in ("examples/python_quickstart.py", "examples/typescript-quickstart.mjs"):
                url = env["HSM_COMPANY_API_URL"]
                urls.append(url)
                with urlopen(f"{url}/api/company/health", timeout=1) as response:
                    self.assertEqual(json.load(response)["service"], "company-os")
            return subprocess.CompletedProcess(args, 0)

        # Only external child processes/installers are replaced. The fixture,
        # HTTP requests, lifetime and public orchestration function are real.
        with occupied_legacy_port():
            run_smoke(external_command)

        self.assertEqual(len(commands), 7)
        self.assertEqual(commands[0][1:], ["scripts/check_contract.py"])
        self.assertEqual(commands[1][1:], ["-m", "unittest", "discover", "-s", "scripts", "-p", "test_*.py"])
        self.assertEqual(commands[3], ["npm", "--prefix", "typescript", "install", "--package-lock=false"])
        self.assertEqual(commands[4], ["npm", "--prefix", "typescript", "run", "build"])
        self.assertEqual(commands[5][:2], ["node", "--test"])
        self.assertEqual(set(commands[5][2:]), {
            "scripts/client-defaults.test.mjs", "scripts/resolve-context.test.mjs", "scripts/transport-retry.test.mjs",
        })
        self.assertEqual(len(urls), 2)
        self.assertEqual(urls[0], urls[1])
        self.assertNotEqual(urlparse(urls[0]).port, 18765)
        self.assert_fixture_closed(urls[0])

    def test_external_failure_propagates_and_fixture_is_closed(self):
        urls = []

        def failed_install(args, *, cwd, env, check):
            if args[0] == "npm":
                urls.append(env["HSM_COMPANY_API_URL"])
                raise subprocess.CalledProcessError(23, args)
            return subprocess.CompletedProcess(args, 0)

        with self.assertRaises(subprocess.CalledProcessError) as caught:
            run_smoke(failed_install)
        self.assertEqual(caught.exception.returncode, 23)
        self.assertEqual(len(urls), 1)
        self.assert_fixture_closed(urls[0])


if __name__ == "__main__":
    unittest.main()
