"""
Failure Analyzer — Agent 4 extension.

Parses test execution reports (Cucumber JSON, JUnit XML, plain text),
locates the relevant step definition and feature file in the automation repo,
and uses AI to diagnose root cause + suggest a code fix.
"""

from __future__ import annotations
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional


# ── Root cause categories ─────────────────────────────────────────────────────
ROOT_CAUSES = {
    "element_not_found":  ("Element not found",     "#8a1a1a"),
    "assertion_failed":   ("Assertion failed",       "#7a4810"),
    "timeout":            ("Timeout / wait",         "#6a2fa0"),
    "step_mismatch":      ("Step not matched",       "#1a4f8a"),
    "api_error":          ("API / HTTP error",       "#8a1a1a"),
    "data_setup":         ("Test data issue",        "#185FA5"),
    "env_issue":          ("Environment / config",   "#5a5650"),
    "locator_change":     ("Locator changed",        "#8a1a1a"),
    "unknown":            ("Unknown",                "#5a5650"),
}

ERROR_PATTERNS = [
    (r"NoSuchElementException|ElementNotFound|Unable to locate|no element found", "element_not_found"),
    (r"StaleElementReferenceException|Element.*stale",                             "element_not_found"),
    (r"ElementNotInteractableException|element not interactable",                  "locator_change"),
    (r"TimeoutException|timeout|Timed out|wait.*expired",                          "timeout"),
    (r"AssertionError|AssertionException|Expected.*but was|assert.*failed",        "assertion_failed"),
    (r"Undefined step|UndefinedStepException|No step definition",                  "step_mismatch"),
    (r"HTTP 4\d\d|HTTP 5\d\d|ConnectionRefused|ConnectionError",                   "api_error"),
    (r"FileNotFoundError|KeyError|NullPointerException|NoneType.*has no attribute","data_setup"),
    (r"EnvironmentError|ConfigurationError|Missing.*env|connection.*refused",       "env_issue"),
]


# ── Parsers ───────────────────────────────────────────────────────────────────

def parse_cucumber_json(content: str) -> list[dict]:
    """Parse Cucumber / Behave JSON report → list of failed scenarios."""
    failures: list[dict] = []
    try:
        data = json.loads(content)
    except Exception:
        return []

    if isinstance(data, dict):
        data = [data]

    for feature in data:
        if not isinstance(feature, dict):
            continue
        feature_name = feature.get("name") or feature.get("id") or ""
        feature_uri  = feature.get("uri") or feature.get("location") or ""

        for element in feature.get("elements", []):
            if element.get("type") not in (None, "scenario", "scenario_outline", ""):
                continue

            failed_steps: list[dict] = []
            all_steps = element.get("steps", [])

            for step in all_steps:
                result = step.get("result", {})
                status = result.get("status", "")
                if status in ("failed", "pending", "undefined"):
                    err = result.get("error_message", "") or result.get("error", "") or ""
                    failed_steps.append({
                        "keyword":       (step.get("keyword") or "").strip(),
                        "name":          (step.get("name") or step.get("text") or "").strip(),
                        "error_message": err[:1200],
                        "status":        status,
                    })

            if failed_steps:
                tags = [
                    t.get("name", "").lstrip("@")
                    for t in element.get("tags", [])
                    if isinstance(t, dict)
                ]
                failures.append({
                    "feature":      feature_name,
                    "feature_uri":  feature_uri,
                    "scenario":     element.get("name") or element.get("id") or "",
                    "tags":         tags,
                    "failed_steps": failed_steps,
                    "total_steps":  len(all_steps),
                })

    return failures


def parse_junit_xml(content: str) -> list[dict]:
    """Parse JUnit / Surefire XML report → list of failed test cases."""
    failures: list[dict] = []
    try:
        root = ET.fromstring(content)
    except Exception:
        return []

    for tc in root.iter("testcase"):
        failure_el = tc.find("failure") or tc.find("error")
        if failure_el is None:
            continue
        classname = tc.get("classname", "")
        name      = tc.get("name", "")
        msg       = failure_el.get("message", "") + "\n" + (failure_el.text or "")
        failures.append({
            "feature":      classname,
            "feature_uri":  classname.replace(".", "/") + ".feature",
            "scenario":     name,
            "tags":         [],
            "failed_steps": [{
                "keyword":       "",
                "name":          name,
                "error_message": msg[:1200].strip(),
                "status":        "failed",
            }],
            "total_steps":  1,
        })

    return failures


def parse_text(content: str) -> list[dict]:
    """Best-effort parse of pasted failure text (plain log / traceback)."""
    lines  = content.strip().splitlines()
    errors = [l.strip() for l in lines if re.search(r"Error|Exception|FAIL|assert|Traceback", l, re.I)]
    if not errors:
        return [{
            "feature":      "Pasted log",
            "feature_uri":  "",
            "scenario":     lines[0][:120] if lines else "Unknown",
            "tags":         [],
            "failed_steps": [{"keyword": "", "name": "pasted text", "error_message": content[:1200], "status": "failed"}],
            "total_steps":  1,
        }]
    return [{
        "feature":      "Pasted log",
        "feature_uri":  "",
        "scenario":     errors[0][:120],
        "tags":         [],
        "failed_steps": [{"keyword": "", "name": "pasted text", "error_message": "\n".join(errors[:20]), "status": "failed"}],
        "total_steps":  1,
    }]


def detect_and_parse(content: str, filename: str = "") -> tuple[list[dict], str]:
    """Auto-detect report format and return (failures, format_name)."""
    content = content.strip()
    if filename.endswith(".xml") or content.startswith("<"):
        return parse_junit_xml(content), "junit_xml"
    if content.startswith("[") or content.startswith("{"):
        result = parse_cucumber_json(content)
        if result:
            return result, "cucumber_json"
    return parse_text(content), "text"


# ── Automation repo helpers ───────────────────────────────────────────────────

def _step_def_dirs(automation_path: Path) -> list[Path]:
    """Common locations for step definition files."""
    candidates: list[Path] = []
    for pattern in ("step_definitions", "step_defs", "steps", "stepDefs", "stepdefinitions"):
        candidates.extend(automation_path.rglob(pattern))
    return [c for c in candidates if c.is_dir()]


def find_step_definition_code(step_text: str, automation_path: Path) -> tuple[str, str]:
    """
    Search step definition files for the step that best matches `step_text`.
    Returns (file_relative_path, code_snippet).
    """
    if not automation_path or not automation_path.exists():
        return "", ""

    words = [w.lower() for w in re.split(r"\W+", step_text) if len(w) > 3][:6]
    if not words:
        return "", ""

    step_dirs = _step_def_dirs(automation_path)
    if not step_dirs:
        # Fallback: search whole repo for .py files
        step_dirs = [automation_path]

    best_score  = 0
    best_file   = None
    best_snippet = ""

    for step_dir in step_dirs:
        for py_file in step_dir.rglob("*.py"):
            try:
                text  = py_file.read_text(encoding="utf-8", errors="ignore")
                lines = text.splitlines()
                score = sum(1 for w in words if w in text.lower())
                if score > best_score:
                    # Find the most-relevant region
                    best_line = 0
                    for i, line in enumerate(lines):
                        if any(w in line.lower() for w in words):
                            best_line = i
                            break
                    start = max(0, best_line - 5)
                    end   = min(len(lines), best_line + 35)
                    snippet = "\n".join(lines[start:end])
                    best_score  = score
                    best_file   = py_file
                    best_snippet = snippet
            except Exception:
                pass

    if best_file and best_score >= 2:
        try:
            rel = best_file.relative_to(automation_path)
        except ValueError:
            rel = best_file
        return str(rel), best_snippet[:1200]

    return "", ""


def read_feature_snippet(feature_uri: str, scenario_name: str, automation_path: Path) -> str:
    """Read the feature file and return the scenario block."""
    if not automation_path or not automation_path.exists():
        return ""

    # Try direct path
    candidates: list[Path] = []
    if feature_uri:
        direct = automation_path / feature_uri
        if direct.exists():
            candidates.append(direct)

    # Search by filename
    fname = Path(feature_uri).name if feature_uri else ""
    if fname and fname.endswith(".feature"):
        candidates.extend(list(automation_path.rglob(fname))[:3])

    # Search by scenario name words
    if not candidates and scenario_name:
        swords = [w.lower() for w in re.split(r"\W+", scenario_name) if len(w) > 4][:3]
        for f in list(automation_path.rglob("*.feature"))[:200]:
            try:
                if all(w in f.read_text(encoding="utf-8", errors="ignore").lower() for w in swords):
                    candidates.append(f)
                    break
            except Exception:
                pass

    for candidate in candidates:
        try:
            lines     = candidate.read_text(encoding="utf-8", errors="ignore").splitlines()
            sc_lower  = scenario_name.lower()
            start_idx = next((i for i, l in enumerate(lines) if sc_lower in l.lower()), 0)
            end_idx   = start_idx + 1
            for i in range(start_idx + 1, min(len(lines), start_idx + 30)):
                if re.match(r"\s*(Scenario|Feature|Background|@)", lines[i], re.I) and i > start_idx + 1:
                    break
                end_idx = i + 1
            return "\n".join(lines[max(0, start_idx - 2): end_idx])
        except Exception:
            pass

    return ""


# ── Rule-based root cause ─────────────────────────────────────────────────────

def classify_error(error_text: str) -> str:
    error_lower = error_text.lower()
    for pattern, category in ERROR_PATTERNS:
        if re.search(pattern, error_text, re.I):
            return category
    return "unknown"


def _fallback_analysis(failure: dict) -> dict:
    """Rule-based analysis when no AI model available."""
    all_errors = " ".join(s["error_message"] for s in failure["failed_steps"])
    category   = classify_error(all_errors)
    label, _   = ROOT_CAUSES.get(category, ROOT_CAUSES["unknown"])

    first_err  = failure["failed_steps"][0]["error_message"] if failure["failed_steps"] else ""
    first_step = failure["failed_steps"][0]

    generic_fixes = {
        "element_not_found": "Update the element locator (XPath/CSS). Check if the element ID or class changed in the latest build.",
        "locator_change":    "The element exists but is not interactable. Add an explicit wait: `wait.until(EC.element_to_be_clickable(...))` before interacting.",
        "timeout":           "Increase the explicit wait timeout or add a custom wait condition for the element/page state.",
        "assertion_failed":  "Compare the actual vs expected value. The application response may have changed — update the expected value or the test data.",
        "step_mismatch":     "The Gherkin step text doesn't match any `@step` decorator. Check for typos or add a new step definition.",
        "api_error":         "The API returned an error. Verify the endpoint URL, authentication token, and request payload.",
        "data_setup":        "Test data is missing or in an unexpected state. Ensure the `@Before` hook creates the required data.",
        "env_issue":         "Check environment variables and configuration files (.env). The test may be pointing to the wrong environment.",
        "unknown":           "Review the full stack trace to identify the root cause.",
    }

    return {
        "scenario":       failure["scenario"],
        "feature":        failure["feature"],
        "feature_uri":    failure["feature_uri"],
        "tags":           failure["tags"],
        "failed_step":    f"{first_step['keyword']} {first_step['name']}".strip() if first_step else "",
        "error_snippet":  first_err[:300],
        "root_cause":     category,
        "root_cause_label": label,
        "explanation":    f"Rule-based detection: {label}. {generic_fixes.get(category, '')}",
        "fix_suggestion": generic_fixes.get(category, "Review the stack trace manually."),
        "fix_code":       "",
        "fix_file":       "",
        "confidence":     70,
        "ai_powered":     False,
    }


# ── AI analysis ───────────────────────────────────────────────────────────────

def analyze_failures(
    failures: list[dict],
    automation_path: Optional[Path],
    model,
) -> list[dict]:
    """
    For each failed scenario, find its code context then ask AI for root cause
    and a concrete fix. Falls back to rule-based analysis when model is None.
    """
    results: list[dict] = []

    for failure in failures[:25]:
        first_step = failure["failed_steps"][0] if failure["failed_steps"] else {}
        all_errors = "\n".join(s["error_message"] for s in failure["failed_steps"])
        category   = classify_error(all_errors)

        # Gather code context from the automation repo
        step_file, step_code = "", ""
        feature_snippet      = ""

        if automation_path:
            step_name = first_step.get("name", "")
            if step_name:
                step_file, step_code = find_step_definition_code(step_name, automation_path)
            feature_snippet = read_feature_snippet(
                failure["feature_uri"], failure["scenario"], automation_path
            )

        if not model:
            result = _fallback_analysis(failure)
            result["step_file"]       = step_file
            result["feature_snippet"] = feature_snippet
            results.append(result)
            continue

        # ── Build AI prompt ──────────────────────────────────────────────────
        prompt = f"""You are a senior QA automation engineer for Americold Cold Compass (Python/Behave BDD automation suite).

Analyse this failing test and provide a precise root cause + actionable fix.

=== FAILING SCENARIO ===
Feature  : {failure['feature']}
Scenario : {failure['scenario']}
Tags     : {', '.join(failure['tags'])}

=== FAILED STEP(S) ===
{json.dumps(failure['failed_steps'][:3], indent=2)}

=== FEATURE FILE SNIPPET ===
{feature_snippet or "(not found — infer from scenario name)"}

=== STEP DEFINITION CODE ===
File: {step_file or "(not found)"}
{step_code or "(not found — infer from error)"}

=== TASK ===
1. Identify the exact root cause category from: element_not_found, assertion_failed, timeout, step_mismatch, api_error, data_setup, env_issue, locator_change, unknown
2. Explain WHY it failed in 1–2 sentences (be specific about the error message)
3. Suggest the exact code fix — show the BEFORE / AFTER diff in the step definition or feature file
4. Name the file to edit (relative path)

Return ONLY valid JSON, no markdown:
{{
  "root_cause": "locator_change",
  "root_cause_label": "Locator changed",
  "explanation": "The button with id='submit-btn' no longer exists in the DOM after the v2.3 UI update. The element now uses class='btn-save'.",
  "fix_suggestion": "Update the locator from #submit-btn to .btn-save and add an explicit wait.",
  "fix_code": "# BEFORE\\ndriver.find_element(By.ID, 'submit-btn').click()\\n# AFTER\\nwait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, '.btn-save'))).click()",
  "fix_file": "tests/step_definitions/admin/userManagement_steps.py",
  "confidence": 92
}}"""

        try:
            raw = model.chat(prompt)
            raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
            raw = re.sub(r"\s*```$", "", raw.strip())
            ai  = json.loads(raw)

            results.append({
                "scenario":         failure["scenario"],
                "feature":          failure["feature"],
                "feature_uri":      failure["feature_uri"],
                "tags":             failure["tags"],
                "failed_step":      f"{first_step.get('keyword','')} {first_step.get('name','')}".strip(),
                "error_snippet":    all_errors[:400],
                "root_cause":       ai.get("root_cause", category),
                "root_cause_label": ai.get("root_cause_label", ROOT_CAUSES.get(category, ("Unknown",""))[0]),
                "explanation":      str(ai.get("explanation", ""))[:600],
                "fix_suggestion":   str(ai.get("fix_suggestion", ""))[:600],
                "fix_code":         str(ai.get("fix_code", ""))[:1500],
                "fix_file":         str(ai.get("fix_file", step_file))[:300],
                "confidence":       max(70, min(100, int(ai.get("confidence", 85)))),
                "ai_powered":       True,
                "step_file":        step_file,
                "feature_snippet":  feature_snippet,
            })

        except Exception:
            result = _fallback_analysis(failure)
            result["step_file"]       = step_file
            result["feature_snippet"] = feature_snippet
            results.append(result)

    return results
