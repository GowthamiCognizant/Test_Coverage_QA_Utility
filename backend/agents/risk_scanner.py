"""
risk_scanner.py — Agent 4: Risk Scanner (defect triage + go-live gate).

  CLASSIFY   Every defect gets entity type, affected module and an owning team:
               PO (requirement gap) · Business (UX) · QA (test gap)
               Dev (code) · DevOps (config)
             with a confidence score. A keyword classifier always runs; when
             an AI model is configured it refines the result in batches.
             The module list comes from the application codebase index.

  SCORE      Criticality 0–100 =
               Severity P0–P3 (40) × Business impact (25) × Module index (15)
               × SLA breach risk (20)       — weighted sum of the four factors
             Bands: Critical ≥ 80 · High 60–79 · Medium 40–59 · Low < 40

  DASHBOARD  Per-team counts, % share and pending approvals; per-module band
             breakdown for the donut/bar charts.

  MAIL &     Each team is emailed its own defect list (Jira links + scores).
  APPROVE    Teams mark Go-Live approval or consciously accept the risk; the
             gate opens only when every team with open defects has done so.
"""

import io
import json
import smtplib
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from pathlib import Path

import pandas as pd

from agents.common import PRIORITY_WEIGHT, best_module, to_tier, tokens
from agents.golden_suite import CRITICAL_FLOWS

TEAMS = {
    "PO": "Product Owner — requirement gap",
    "Business": "Business — UX",
    "QA": "QA — test gap",
    "Dev": "Development — code",
    "DevOps": "DevOps — configuration",
}
SLA_DAYS = {"P0": 1, "P1": 3, "P2": 7, "P3": 14}
CLOSED = ("done", "closed", "resolved", "fixed", "verified", "rejected", "won't fix", "cancelled")

_RULES = {
    "DevOps": {"config", "configuration", "environment", "env", "deploy", "deployment", "pipeline", "build",
               "server", "timeout", "certificate", "ssl", "dns", "docker", "kubernetes", "k8s", "infra",
               "memory", "cpu", "disk", "502", "503", "504", "gateway", "proxy", "cache", "cdn", "cron", "job"},
    "PO": {"requirement", "requirements", "acceptance", "criteria", "spec", "specification", "clarification",
           "scope", "business", "rule", "expected", "unclear", "ambiguous", "missing", "story"},
    "Business": {"ux", "usability", "alignment", "aligned", "misaligned", "font", "color", "colour", "layout",
                 "css", "look", "design", "typo", "spelling", "responsive", "icon", "tooltip", "label", "text",
                 "wording", "style", "spacing", "mobile", "overlap", "overlapping", "truncated"},
    "QA": {"script", "automation", "flaky", "locator", "selector", "xpath", "testdata", "false", "positive",
           "assertion", "pytest", "selenium", "feature", "scenario", "testcase"},
    "Dev": {"exception", "error", "crash", "null", "nullpointer", "500", "calculation", "incorrect", "wrong",
            "saving", "save", "api", "endpoint", "response", "database", "query", "logic", "fails", "failure",
            "broken", "undefined", "stacktrace", "duplicate", "validation"},
}
_ENTITY_RULES = [
    ("Security", {"security", "xss", "injection", "csrf", "unauthorized", "unauthorised", "vulnerability", "token", "permission"}),
    ("Performance", {"slow", "performance", "latency", "load", "timeout", "hang", "freeze"}),
    ("Config", {"config", "configuration", "environment", "env", "deploy", "certificate", "ssl", "dns"}),
    ("Requirement", {"requirement", "acceptance", "criteria", "spec", "clarification", "scope"}),
    ("Test", {"script", "automation", "flaky", "locator", "testdata"}),
    ("Data", {"data", "database", "record", "records", "sql", "duplicate", "migration", "report", "export"}),
    ("API", {"api", "endpoint", "response", "request", "500", "service", "integration"}),
    ("UI", {"button", "page", "screen", "ui", "layout", "font", "color", "display", "modal", "dropdown", "widget"}),
]


# ─────────────────────────────────────────────────────────────────────────────
# CLASSIFY
# ─────────────────────────────────────────────────────────────────────────────

def rule_classify(defect: dict, module_index: dict) -> dict:
    text = f'{defect.get("summary", "")} {defect.get("description", "")[:800]} {defect.get("label", "")}'
    toks = tokens(text) | {w for w in text.lower().split() if w.isdigit()}
    module, _, strength = best_module(toks, module_index, defect.get("component", ""))
    layer = (module_index.get("modules", {}).get(module, {}) if module_index else {}).get("layer", "")

    hits = {team: len(toks & words) for team, words in _RULES.items()}
    owner, n = max(hits.items(), key=lambda kv: kv[1])
    if n == 0:
        owner, n = ("Business", 0) if layer == "frontend" and toks & _RULES["Business"] else ("Dev", 0)
    confidence = min(0.85, 0.5 + 0.1 * n) if n else 0.45

    entity = next((e for e, words in _ENTITY_RULES if toks & words), "UI" if layer == "frontend" else "Code")
    return {
        "entity_type": entity,
        "module": module,
        "owner": owner,
        "confidence": round(confidence, 2),
        "reason": f"Keyword match: {', '.join(sorted(toks & _RULES[owner])[:4]) or 'default routing'}"
                  + (f"; module '{module}' ({layer})" if strength else ""),
        "classified_by": "rules",
    }


def ai_classify(defects: list, model, module_index: dict, batch_size: int = 20) -> dict:
    """{defect_key: classification} from the configured AI model; {} on failure."""
    modules = [f"{n} ({m.get('layer')})" for n, m in list((module_index or {}).get("modules", {}).items())[:60]]
    batches = [defects[i:i + batch_size] for i in range(0, len(defects), batch_size)]

    def run(batch):
        prompt = f"""You are a QA lead triaging defects before a release.

For each defect decide:
- entity_type: one of UI, API, Data, Config, Requirement, Test, Performance, Security, Code
- module: the affected application module — pick from this list when one fits, else a short name:
  {", ".join(modules) or "(no module list available)"}
- owner: exactly one of
    PO       — requirement gap (behaviour is correct per code but the requirement was missing/wrong)
    Business — UX / look-and-feel / wording issue
    QA       — test gap (bad script, test data or false failure)
    Dev      — code defect
    DevOps   — environment / configuration / deployment issue
- confidence: 0.0–1.0 that the owner is right
- reason: one short sentence

Defects:
{json.dumps([{"key": d["key"], "summary": d["summary"], "description": d.get("description", "")[:500],
              "component": d.get("component", ""), "labels": d.get("label", "")} for d in batch], indent=1)}

Return ONLY valid JSON: {{"results": {{"<key>": {{"entity_type": "...", "module": "...", "owner": "...", "confidence": 0.8, "reason": "..."}}}}}}
"""
        try:
            return model._parse_json(model._call(prompt)).get("results", {})
        except Exception as e:
            print(f"[Agent 4] AI classification batch failed: {e}")
            return {}

    out = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for res in pool.map(run, batches):
            if isinstance(res, dict):
                out.update(res)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# SCORE
# ─────────────────────────────────────────────────────────────────────────────

def score_defect(d: dict, module_index: dict, now: datetime) -> dict:
    tier = to_tier(d.get("priority", ""))
    severity = PRIORITY_WEIGHT[tier]

    toks = tokens(f'{d.get("summary", "")} {d.get("label", "")}')
    labels = (d.get("label", "") or "").lower()
    module = (module_index.get("modules", {}) if module_index else {}).get(d["module"], {})
    if "production" in labels or "customer" in labels or "prod" in labels.split(", "):
        impact = 1.0
    elif toks & CRITICAL_FLOWS:
        impact = 0.9
    elif module.get("layer") == "frontend":
        impact = 0.6
    else:
        impact = 0.45
    mod_w = module.get("weight", 0.5)

    is_open = not any((d.get("status", "") or "").lower().startswith(c) for c in CLOSED)
    age_days = None
    created = _parse_date(d.get("created", ""))
    if created:
        age_days = max(0.0, (now - created).total_seconds() / 86400)
    if not is_open:
        sla = 0.0
    elif age_days is None:
        sla = 0.5
    else:
        sla = min(1.0, age_days / SLA_DAYS[tier])

    score = round(40 * severity + 25 * impact + 15 * mod_w + 20 * sla, 1)
    band = "Critical" if score >= 80 else "High" if score >= 60 else "Medium" if score >= 40 else "Low"
    return {
        "severity": tier,
        "score": score,
        "band": band,
        "open": is_open,
        "age_days": round(age_days, 1) if age_days is not None else None,
        "sla_days": SLA_DAYS[tier],
        "sla_breached": bool(is_open and age_days is not None and age_days > SLA_DAYS[tier]),
        "factors": {
            "severity": round(40 * severity, 1),
            "business_impact": round(25 * impact, 1),
            "module_index": round(15 * mod_w, 1),
            "sla_breach_risk": round(20 * sla, 1),
        },
    }


def _parse_date(s: str):
    if not s or s == "nan":
        return None
    for fn in (lambda x: datetime.fromisoformat(x.replace("Z", "+00:00")),
               lambda x: datetime.strptime(x[:19], "%Y-%m-%dT%H:%M:%S.%f%z"),
               lambda x: pd.to_datetime(x).to_pydatetime()):
        try:
            dt = fn(s)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
    return None


# ─────────────────────────────────────────────────────────────────────────────
# PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def run_scan(project_dir: Path, defects: list, module_index: dict, model=None) -> dict:
    now = datetime.now(timezone.utc)
    ai = ai_classify(defects, model, module_index) if (model and defects) else {}

    rows = []
    for d in defects:
        c = rule_classify(d, module_index)
        a = ai.get(d["key"])
        if isinstance(a, dict) and a.get("owner") in TEAMS:
            c.update({
                "entity_type": a.get("entity_type") or c["entity_type"],
                "module": a.get("module") or c["module"],
                "owner": a["owner"],
                "confidence": round(float(a.get("confidence", c["confidence"])), 2),
                "reason": a.get("reason") or c["reason"],
                "classified_by": "ai",
            })
        row = {
            "key": d["key"], "summary": d["summary"], "status": d.get("status", ""),
            "priority": d.get("priority", ""), "component": d.get("component", ""),
            "assignee": d.get("assignee", ""), "created": d.get("created", ""),
            "url": d.get("url", ""), **c,
        }
        row.update(score_defect({**d, "module": c["module"]}, module_index, now))
        rows.append(row)
    rows.sort(key=lambda r: (not r["open"], -r["score"]))

    result = {
        "scanned_at": now.isoformat(timespec="seconds"),
        "total": len(rows),
        "open": sum(r["open"] for r in rows),
        "ai_used": bool(ai),
        "module_index_used": bool(module_index),
        "defects": rows,
    }
    (project_dir / "risk_result.json").write_text(json.dumps(result, indent=1))
    return result


def load_result(project_dir: Path) -> dict:
    p = project_dir / "risk_result.json"
    return json.loads(p.read_text()) if p.exists() else {}


def load_approvals(project_dir: Path) -> dict:
    p = project_dir / "risk_approvals.json"
    return json.loads(p.read_text()) if p.exists() else {}


def save_approval(project_dir: Path, team: str, status: str, by: str, note: str) -> dict:
    approvals = load_approvals(project_dir)
    approvals[team] = {"status": status, "by": by, "note": note,
                       "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    (project_dir / "risk_approvals.json").write_text(json.dumps(approvals, indent=1))
    return approvals


def dashboard(result: dict, approvals: dict) -> dict:
    rows = result.get("defects", [])
    open_rows = [r for r in rows if r["open"]]
    total_open = len(open_rows) or 1

    teams = {}
    for team, label in TEAMS.items():
        mine = [r for r in open_rows if r["owner"] == team]
        appr = approvals.get(team, {"status": "pending"})
        teams[team] = {
            "label": label,
            "count": len(mine),
            "share_pct": round(len(mine) / total_open * 100, 1) if open_rows else 0,
            "bands": dict(Counter(r["band"] for r in mine)),
            "sla_breached": sum(r["sla_breached"] for r in mine),
            "approval": appr,
            "pending": len(mine) if appr.get("status", "pending") == "pending" else 0,
        }

    modules = defaultdict(lambda: {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "total": 0})
    for r in open_rows:
        modules[r["module"]][r["band"]] += 1
        modules[r["module"]]["total"] += 1

    blocking = [t for t, v in teams.items() if v["count"] and v["approval"].get("status") not in ("approved", "risk_accepted")]
    return {
        "scanned_at": result.get("scanned_at"),
        "total": result.get("total", 0),
        "open": len(open_rows),
        "ai_used": result.get("ai_used", False),
        "bands": {b: sum(1 for r in open_rows if r["band"] == b) for b in ("Critical", "High", "Medium", "Low")},
        "sla_breached": sum(r["sla_breached"] for r in open_rows),
        "teams": teams,
        "modules": dict(sorted(modules.items(), key=lambda kv: -kv[1]["total"])),
        "go_live": {"open": not blocking and bool(rows), "blocking_teams": blocking},
        "defects": rows,
    }


# ─────────────────────────────────────────────────────────────────────────────
# MAIL
# ─────────────────────────────────────────────────────────────────────────────

def build_full_report_email(rows: list, project_name: str, app_url: str) -> tuple:
    subject = f"[{project_name}] Risk Scanner Report — {len(rows)} open defect(s)"
    band_color = {"Critical": "#b42318", "High": "#c4320a", "Medium": "#b54708", "Low": "#475467"}
    trs = "".join(
        f'<tr><td><a href="{escape(r["url"])}">{escape(r["key"])}</a></td><td>{escape(r["summary"])}</td>'
        f'<td>{escape(r.get("severity",""))}</td>'
        f'<td style="color:{band_color.get(r["band"],"#475467")};font-weight:600">{r["band"]} ({r["score"]})</td>'
        f'<td>{escape(r.get("owner",""))}</td>'
        f'<td>{escape(r.get("module",""))}</td>'
        f'<td>{"Breached" if r.get("sla_breached") else "OK"}</td></tr>'
        for r in rows
    )
    html = f"""<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1a1a1a">
<p>Hello,</p>
<p>The Risk Scanner (Agent 4) has triaged <b>{len(rows)}</b> open defect(s) for project <b>{escape(project_name)}</b>.
Review and record Go-Live decisions in the QA utility:
<a href="{escape(app_url)}">{escape(app_url)}</a></p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ddd;font-size:13px">
<tr style="background:#f2f4f7"><th>Key</th><th>Summary</th><th>Severity</th><th>Criticality</th><th>Owner Team</th><th>Module</th><th>SLA</th></tr>
{trs}</table>
<p style="color:#667085;font-size:12px">The Go-Live gate opens only when every team has approved or accepted the risk.</p></div>"""
    return subject, html


def send_emails(project_dir: Path, result: dict, recipients: dict, project_name: str, app_url: str,
                smtp: dict) -> list:
    """Send full defect report to every configured recipient. Returns per-recipient outcome list."""
    outbox = project_dir / "outbox"
    outbox.mkdir(exist_ok=True)
    outcomes = []
    open_rows = [r for r in result.get("defects", []) if r["open"]]

    # Collect unique addresses from all team fields (preserve which field they came from)
    seen: set = set()
    to_send: list = []  # [(label, addr)]
    for team in TEAMS:
        for addr in [a.strip() for a in (recipients.get(team) or "").replace(";", ",").split(",") if a.strip()]:
            if addr not in seen:
                seen.add(addr)
                to_send.append((team, addr))

    if not to_send:
        total_open = len(open_rows)
        if total_open:
            outcomes.append({"team": "all", "defects": total_open, "status": "skipped",
                             "detail": "No recipient email addresses configured"})
        return outcomes

    subject, html = build_full_report_email(open_rows, project_name, app_url)

    for label, addr in to_send:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp.get("from") or "qa-utility@localhost"
        msg["To"] = addr
        msg.attach(MIMEText(html, "html"))
        (outbox / f"{label}.eml").write_text(msg.as_string(), encoding="utf-8")

        if not smtp.get("host"):
            outcomes.append({"team": label, "defects": len(open_rows), "status": "preview",
                             "detail": f"SMTP not configured — saved outbox/{label}.eml", "to": [addr]})
            continue
        try:
            with smtplib.SMTP(smtp["host"], smtp["port"], timeout=20) as s:
                if smtp.get("tls"):
                    s.starttls()
                if smtp.get("user"):
                    s.login(smtp["user"], smtp["password"])
                s.sendmail(msg["From"], [addr], msg.as_string())
            outcomes.append({"team": label, "defects": len(open_rows), "status": "sent", "to": [addr]})
        except Exception as e:
            outcomes.append({"team": label, "defects": len(open_rows), "status": "failed",
                             "detail": str(e), "to": [addr]})
    return outcomes


# ─────────────────────────────────────────────────────────────────────────────
# EXPORT
# ─────────────────────────────────────────────────────────────────────────────

def export_xlsx(dash: dict) -> bytes:
    rows = [{**{k: v for k, v in r.items() if k != "factors"}, **{f"factor_{k}": v for k, v in r["factors"].items()}}
            for r in dash["defects"]]
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        pd.DataFrame(rows).to_excel(xw, sheet_name="Defect Triage", index=False)
        pd.DataFrame([{"team": t, "label": v["label"], "open_defects": v["count"], "share_pct": v["share_pct"],
                       "sla_breached": v["sla_breached"], "approval": v["approval"].get("status", "pending"),
                       "approved_by": v["approval"].get("by", ""), **v["bands"]}
                      for t, v in dash["teams"].items()]).to_excel(xw, sheet_name="Teams", index=False)
        pd.DataFrame([{"module": m, **v} for m, v in dash["modules"].items()]).to_excel(xw, sheet_name="Modules", index=False)
    return buf.getvalue()
