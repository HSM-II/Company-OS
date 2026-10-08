import json
import unittest
from unittest.mock import patch

from company_os_sdk import CompanyOSClient


class Response:
    headers = {"content-type": "application/json"}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps({}).encode()


class PrincipalHeadersTest(unittest.TestCase):
    def test_sensitive_company_reads_send_distinct_authority_credentials(self):
        client = CompanyOSClient("http://localhost", token="transport", principal_token="principal")
        with patch("urllib.request.urlopen", return_value=Response()) as send:
            for resource in ["goals", "memory"]:
                client.request("GET", f"/api/company/companies/company/{resource}")
        self.assertEqual(send.call_count, 2)
        for call in send.call_args_list:
            self.assertEqual(call.args[0].get_header("Authorization"), "Bearer transport")
            self.assertEqual(call.args[0].get_header("X-hsm-principal-token"), "principal")


if __name__ == "__main__":
    unittest.main()
