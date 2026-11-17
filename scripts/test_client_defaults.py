import os
import unittest
from unittest.mock import patch

from company_os_sdk import CompanyOSClient


class ClientDefaultsTest(unittest.TestCase):
    def test_environment_default_and_explicit_endpoint(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(CompanyOSClient.from_env().base_url, "http://localhost:3847")
            os.environ["HSM_COMPANY_API_URL"] = "https://api.example.test/custom"
            self.assertEqual(CompanyOSClient.from_env().base_url, "https://api.example.test/custom")


if __name__ == "__main__":
    unittest.main()
