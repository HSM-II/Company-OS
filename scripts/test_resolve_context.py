import io
import json
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch

from company_os_sdk import CompanyOSAPIError, CompanyOSClient


class Response:
    headers = {"content-type": "application/json"}

    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.body).encode()


class ResolveContextTest(unittest.TestCase):
    def test_authenticated_task_context_uses_supported_query_and_returns_server_budget(self):
        client = CompanyOSClient("https://api.example.test", token="test-token")
        expected = {
            "company_id": "company-id",
            "actor_role": "worker",
            "phase": "review",
            "task_id": "task-id",
            "query": "ignored by server",
            "policy": None,
            "text": "approved context",
            "memory_ids": [],
            "max_tokens": 512,
        }
        with patch("urllib.request.urlopen", return_value=Response(expected)) as send:
            actual = client.resolve_context(
                "company-id", task_id="task-id", query="ignored by server", phase="review"
            )
        self.assertEqual(actual, expected)
        request = send.call_args.args[0]
        parsed = urllib.parse.urlparse(request.full_url)
        self.assertEqual(parsed.path, "/api/company/companies/company-id/context/resolve")
        self.assertEqual(
            urllib.parse.parse_qs(parsed.query),
            {"task_id": ["task-id"], "query": ["ignored by server"], "phase": ["review"]},
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        self.assertEqual(request.get_method(), "GET")

    def test_context_refusal_remains_an_api_error(self):
        client = CompanyOSClient("https://api.example.test", token="test-token")
        refusal = urllib.error.HTTPError(
            "https://api.example.test/context",
            403,
            "Forbidden",
            {"content-type": "application/json"},
            io.BytesIO(b'{"error":"company access denied"}'),
        )
        with patch("urllib.request.urlopen", side_effect=refusal):
            with self.assertRaises(CompanyOSAPIError) as caught:
                client.resolve_context("company-id", query="sensitive")
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.body, {"error": "company access denied"})


if __name__ == "__main__":
    unittest.main()
