"""
jira_client.py — Jira Cloud REST v3 connector (input layer for Agents 1 and 4).

Auth: Basic auth with account email + API token.

Search uses the enhanced JQL endpoint POST /rest/api/3/search/jql
(token-paged via nextPageToken). Atlassian retired the old /rest/api/3/search
endpoint, but some sites still serve it, so we fall back to it on 404/410.

Every issue is normalised into the shared test-case dict shape (see
connectors/__init__.py), plus a few extra fields (issue_type, updated, url,
acceptance_criteria …) that Agents 3 and 4 use.
"""

from datetime import datetime, timezone
from typing import Iterable, Optional

import requests

from config import (
    JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN,
    JIRA_ACCEPTANCE_FIELD, HTTP_VERIFY_SSL,
)
from connectors.adf import adf_to_text

STORY_TYPES = ["Story", "Task", "Improvement", "New Feature", "Epic"]
DEFECT_TYPES = ["Bug", "Defect", "Production Defect", "UAT Defect"]
TEST_TYPES = ["Test", "Test Case"]

_BASE_FIELDS = [
    "summary", "description", "issuetype", "priority", "status", "labels",
    "components", "created", "updated", "assignee", "reporter", "duedate",
    "resolutiondate", "issuelinks", "fixVersions",
]


class JiraError(Exception):
    pass


class JiraClient:
    def __init__(self, base_url: str = JIRA_BASE_URL, email: str = JIRA_EMAIL,
                 token: str = JIRA_API_TOKEN, timeout: int = 30):
        if not (base_url and email and token):
            raise JiraError(
                "Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL and the API token in backend/.env."
            )
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.auth = (email, token)
        self.session.verify = HTTP_VERIFY_SSL
        self.session.headers.update({"Accept": "application/json", "Content-Type": "application/json"})

    # ── Low level ────────────────────────────────────────────────────────────

    def _request(self, method: str, path: str, **kw) -> dict:
        url = f"{self.base_url}{path}"
        try:
            r = self.session.request(method, url, timeout=self.timeout, **kw)
        except requests.RequestException as e:
            raise JiraError(f"Cannot reach Jira at {self.base_url}: {e}") from e
        if r.status_code == 401:
            raise JiraError("Jira rejected the credentials (401). Check JIRA_EMAIL and the API token.")
        if r.status_code == 403:
            raise JiraError("Jira returned 403 — the account lacks permission for this project.")
        if r.status_code >= 400:
            raise JiraError(f"Jira {method} {path} failed ({r.status_code}): {r.text[:300]}", r.status_code)
        return r.json() if r.content else {}

    # ── Public API ───────────────────────────────────────────────────────────

    def myself(self) -> dict:
        return self._request("GET", "/rest/api/3/myself")

    def project(self, project_key: str) -> dict:
        return self._request("GET", f"/rest/api/3/project/{project_key}")

    def search(self, jql: str, fields: Optional[list] = None, max_results: int = 2000) -> list:
        fields = fields or self._fields()
        issues: list = []
        token = None
        while len(issues) < max_results:
            body = {"jql": jql, "fields": fields, "maxResults": min(100, max_results - len(issues))}
            if token:
                body["nextPageToken"] = token
            try:
                page = self._request("POST", "/rest/api/3/search/jql", json=body)
            except JiraError as e:
                if len(e.args) > 1 and e.args[1] in (404, 410):
                    return self._search_legacy(jql, fields, max_results)
                raise
            issues.extend(page.get("issues", []))
            token = page.get("nextPageToken")
            if page.get("isLast", True) or not token:
                break
        return issues

    def _search_legacy(self, jql: str, fields: list, max_results: int) -> list:
        issues, start = [], 0
        while len(issues) < max_results:
            page = self._request("POST", "/rest/api/3/search", json={
                "jql": jql, "fields": fields, "startAt": start, "maxResults": 100,
            })
            batch = page.get("issues", [])
            issues.extend(batch)
            start += len(batch)
            if not batch or start >= page.get("total", 0):
                break
        return issues

    def fetch_issues(self, project_key: str, issue_types: Iterable[str],
                     since: Optional[str] = None, extra_jql: str = "",
                     max_results: int = 2000) -> list:
        """
        Pull issues of the given types. `since` is an ISO timestamp — only
        issues updated at/after it are returned (incremental sync).
        """
        jql = build_jql(project_key, issue_types, since, extra_jql)
        return [self.normalize(i) for i in self.search(jql, max_results=max_results)]

    # ── Normalisation ────────────────────────────────────────────────────────

    def _fields(self) -> list:
        return _BASE_FIELDS + ([JIRA_ACCEPTANCE_FIELD] if JIRA_ACCEPTANCE_FIELD else [])

    def normalize(self, issue: dict) -> dict:
        f = issue.get("fields", {}) or {}
        itype = _name(f.get("issuetype"))
        links = []
        for link in f.get("issuelinks", []) or []:
            other = link.get("outwardIssue") or link.get("inwardIssue")
            if other and other.get("key"):
                links.append(other["key"])
        return {
            # Shared contract fields
            "key": issue.get("key", ""),
            "summary": (f.get("summary") or "").strip(),
            "description": adf_to_text(f.get("description"))[:3000],
            "component": ", ".join(_name(c) for c in f.get("components", []) or []),
            "priority": _name(f.get("priority")),
            "label": ", ".join(f.get("labels", []) or []) or itype,
            "status": _name(f.get("status")),
            "source": f"jira:{itype or 'issue'}",
            # Extras for Agents 3/4
            "issue_type": itype,
            "acceptance_criteria": adf_to_text(f.get(JIRA_ACCEPTANCE_FIELD))[:2000] if JIRA_ACCEPTANCE_FIELD else "",
            "created": f.get("created", ""),
            "updated": f.get("updated", ""),
            "resolved": f.get("resolutiondate") or "",
            "due": f.get("duedate") or "",
            "assignee": _display(f.get("assignee")),
            "reporter": _display(f.get("reporter")),
            "fix_versions": [_name(v) for v in f.get("fixVersions", []) or []],
            "links": links,
            "url": f"{self.base_url}/browse/{issue.get('key', '')}",
        }


def build_jql(project_key: str, issue_types: Iterable[str], since: Optional[str] = None,
              extra_jql: str = "") -> str:
    types = ", ".join(f'"{t}"' for t in issue_types)
    clauses = [f'project = "{project_key}"']
    if types:
        clauses.append(f"issuetype in ({types})")
    if since:
        clauses.append(f'updated >= "{to_jql_time(since)}"')
    if extra_jql.strip():
        clauses.append(f"({extra_jql.strip()})")
    return " AND ".join(clauses) + " ORDER BY updated DESC"


def to_jql_time(iso: str) -> str:
    """ISO timestamp -> 'yyyy-MM-dd HH:mm' (JQL resolves it in the user's timezone,
    so the caller already subtracts a safety margin)."""
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return dt.strftime("%Y-%m-%d %H:%M")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _name(obj) -> str:
    if isinstance(obj, dict):
        return str(obj.get("name") or obj.get("value") or "")
    return str(obj or "")


def _display(obj) -> str:
    return obj.get("displayName", "") if isinstance(obj, dict) else ""
