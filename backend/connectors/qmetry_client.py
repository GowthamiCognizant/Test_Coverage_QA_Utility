"""
qmetry_client.py — QMetry Test Management for Jira Cloud (QTM4J) Open API.

Base URL: https://qtmcloud.qmetry.com/rest/api/latest   (QMETRY_API_BASE)
Auth:     "apiKey" request header                       (QMETRY_API_KEY)

What we pull:
  * Test cases of a Jira project        -> shared test-case dict shape
  * Test cycles + their test-case runs  -> latest execution result per test
                                           case, run count and fail count
                                           (feeds Agent 3 scoring and the
                                           live Passed / Failed / Blocked view)

QTM4J needs the numeric Jira project id, not the key — project_id(key)
resolves it through QMetry's own project search, so QMetry works even when
Jira credentials are not configured.

Observed on QTM4J Cloud (Sep 2026): pages are capped at 100 rows, search
returns only ids unless `fields=` is passed, test-case folders are named after
the linked Jira story (e.g. "AMCC-11702"), and cycles come back newest first.
"""

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import requests

from config import QMETRY_API_BASE, QMETRY_API_KEY, HTTP_VERIFY_SSL

PAGE = 100
TC_FIELDS = "key,summary,description,priority,status,labels,components,updated,folders"
STORY_KEY = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")


class QMetryError(Exception):
    pass


class QMetryClient:
    def __init__(self, base_url: str = QMETRY_API_BASE, api_key: str = QMETRY_API_KEY, timeout: int = 30):
        if not (base_url and api_key):
            raise QMetryError("QMetry is not configured. Set the QMetry API key in backend/.env.")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = HTTP_VERIFY_SSL
        self.session.headers.update({
            "apiKey": api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    def _request(self, method: str, path: str, **kw) -> dict:
        try:
            r = self.session.request(method, f"{self.base_url}{path}", timeout=self.timeout, **kw)
        except requests.RequestException as e:
            raise QMetryError(f"Cannot reach QMetry at {self.base_url}: {e}") from e
        if r.status_code in (401, 403):
            raise QMetryError(f"QMetry rejected the API key ({r.status_code}). Regenerate it under QMetry > Configuration > Open API.")
        if r.status_code >= 400:
            raise QMetryError(f"QMetry {method} {path} failed ({r.status_code}): {r.text[:300]}")
        return r.json() if r.content else {}

    def _search_all(self, path: str, body: dict, limit: int, fields: str = "", workers: int = 6) -> list:
        """First page tells us the total; remaining pages are fetched in parallel."""
        extra = f"&fields={fields}" if fields else ""
        first = self._request("POST", f"{path}?startAt=0&maxResults={PAGE}{extra}", json=body)
        out = _items(first)
        total = min(limit, first.get("total", len(out)) if isinstance(first, dict) else len(out))
        starts = list(range(len(out), total, PAGE)) if out else []
        if starts:
            def page(start):
                return _items(self._request("POST", f"{path}?startAt={start}&maxResults={PAGE}{extra}", json=body))
            with ThreadPoolExecutor(max_workers=workers) as pool:
                for batch in pool.map(page, starts):
                    out.extend(batch)
        return out[:limit]

    # ── Projects ─────────────────────────────────────────────────────────────

    def project_id(self, project_key: str) -> str:
        for p in self._search_all("/projects", {}, 2000):
            if str(p.get("key", "")).upper() == project_key.upper():
                if p.get("qmetryEnabled") is False:
                    raise QMetryError(f"QMetry is not enabled for Jira project {project_key}.")
                return str(p["id"])
        raise QMetryError(f"Jira project {project_key} was not found in QMetry.")

    # ── Test cases ───────────────────────────────────────────────────────────

    def fetch_test_cases(self, project_id: str, limit: int = 50000) -> list:
        raw = self._search_all("/testcases/search/", {"filter": {"projectId": project_id}}, limit, TC_FIELDS)
        return [self.normalize_test_case(tc) for tc in raw if not tc.get("archived")]

    @staticmethod
    def normalize_test_case(tc: dict) -> dict:
        return {
            "key": str(tc.get("key") or tc.get("id") or ""),
            "summary": re.sub(r"\s+", " ", str(tc.get("summary") or tc.get("name") or "")).strip(),
            "description": str(tc.get("description") or "")[:2000],
            "component": ", ".join(_name(c) for c in _as_list(tc.get("components"))),
            "priority": _name(tc.get("priority")),
            "label": ", ".join(_name(l) for l in _as_list(tc.get("labels"))) or "Test Case",
            "status": _name(tc.get("status")),
            "source": "qmetry:testcase",
            "issue_type": "Test Case",
            "qmetry_id": str(tc.get("id", "")),
            "updated": _updated(tc.get("updated") or tc.get("updatedOn")),
            # Folders are named after the Jira story the test case belongs to
            "links": [f["name"] for f in _as_list(tc.get("folders"))
                      if isinstance(f, dict) and STORY_KEY.match(str(f.get("name", "")))],
        }

    # ── Executions ───────────────────────────────────────────────────────────

    def fetch_execution_summary(self, project_id: str, max_cycles: int = 50) -> dict:
        """
        Walk the most recent test cycles (QTM4J returns them newest first) and
        fold their runs into
        {test_case_key: {"last_status", "runs", "fails", "cycle"}}.
        The newest executed result becomes last_status.
        """
        cycles = self._search_all("/testcycles/search/", {"filter": {"projectId": project_id}},
                                  max_cycles, "key,summary")

        def runs_of(cycle):
            try:
                return cycle, self._search_all(f"/testcycles/{cycle['id']}/testcases/search/",
                                               {"filter": {}}, 5000, "executionResult", workers=2)
            except QMetryError:
                return cycle, []

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(runs_of, [c for c in cycles if c.get("id")]))

        summary: dict = {}
        for cycle, runs in results:  # newest cycle first
            ckey = str(cycle.get("key") or cycle.get("id"))
            for run in runs:
                key = str(run.get("key") or "")
                if not key:
                    continue
                status = normalize_status(run.get("executionResult"))
                s = summary.setdefault(key, {"last_status": "Not Run", "runs": 0, "fails": 0, "cycle": ""})
                if status == "Not Run":
                    continue
                s["runs"] += 1
                s["fails"] += status == "Failed"
                if s["last_status"] == "Not Run":
                    s.update(last_status=status, cycle=ckey)
        return summary

    def probe(self, project_id: str = "") -> dict:
        """Cheap connectivity check used by /api/integrations/status."""
        page = self._request("POST", "/projects?startAt=0&maxResults=1", json={})
        out = {"ok": True, "projects": page.get("total")}
        if project_id:
            tcs = self._request("POST", "/testcases/search/?startAt=0&maxResults=1",
                                json={"filter": {"projectId": project_id}})
            out["total_test_cases"] = tcs.get("total")
        return out


def normalize_status(raw) -> str:
    s = _name(raw).lower()
    if not s or s.startswith("not") or "unexecuted" in s:
        return "Not Run"
    if s.startswith("pass"):
        return "Passed"
    if s.startswith("fail"):
        return "Failed"
    if "block" in s:
        return "Blocked"
    if "progress" in s or "wip" in s:
        return "In Progress"
    return s.title()


def _updated(v) -> str:
    """QTM4J gives {"updatedOn": "25/Sep/2026 11:54"}; return ISO text."""
    if isinstance(v, dict):
        v = v.get("updatedOn", "")
    v = str(v or "")
    try:
        return datetime.strptime(v, "%d/%b/%Y %H:%M").isoformat()
    except ValueError:
        return v


def _items(page) -> list:
    if isinstance(page, list):
        return page
    for k in ("data", "values", "results", "items"):
        if isinstance(page.get(k), list):
            return page[k]
    return []


def _as_list(v) -> list:
    return v if isinstance(v, list) else ([v] if v else [])


def _name(obj) -> str:
    if isinstance(obj, dict):
        return str(obj.get("name") or obj.get("value") or obj.get("label") or "")
    return str(obj or "")
