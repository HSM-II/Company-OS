"""Read bounded task context and the story of an existing governed run.

The caller's external harness may consume ``context.text``. It must dispatch
work through its existing Company OS governed run boundary; this example does
not create a run or perform an effect. Pass that run's ID to inspect its story.
"""

from __future__ import annotations

import argparse
import json
from uuid import UUID

from company_os_sdk import CompanyOSClient


def uuid_arg(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a UUID") from error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company-id", required=True, type=uuid_arg)
    parser.add_argument("--task-id", required=True, type=uuid_arg)
    parser.add_argument("--run-id", type=uuid_arg, help="existing Company OS governed run")
    parser.add_argument("--phase", default="*", help="context policy phase")
    args = parser.parse_args()

    client = CompanyOSClient.from_env()
    if not client.token:
        parser.error("HSM_COMPANY_API_TOKEN is required")
    result = {
        "context": client.resolve_context(
            args.company_id, task_id=args.task_id, phase=args.phase
        )
    }
    if args.run_id:
        result["run_story"] = client.request(
            "GET",
            f"/api/company/companies/{args.company_id}/agent-runs/{args.run_id}/story",
        )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
