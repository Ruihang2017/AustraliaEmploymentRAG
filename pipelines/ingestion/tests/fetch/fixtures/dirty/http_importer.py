"""A deliberately dirty module: the POSITIVE CONTROL for the architecture scan (deliverable 8).

It imports an HTTP library directly, which PRD §37.4 forbids outside the shared fetcher. It is
never imported and never executed — `test_architecture.py` reads it with an AST scanner and asserts
that the `direct-http` rule reports it. A scan that reports nothing is indistinguishable from a scan
that is not running, which is what this file exists to rule out.

It carries NO `packages.*` and no tenant/customer import: INGF-01's
`test_no_ingestion_module_imports_a_tenant_or_packages_module` scans the whole member excluding only
`tests/adapter/fixtures`, so a tenant-shaped import here would break a test this ticket must not
touch.
"""

import httpx


def fetch_without_the_shared_fetcher(url: str):
    return httpx.get(url)
