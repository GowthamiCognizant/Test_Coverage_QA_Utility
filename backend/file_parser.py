import pandas as pd
import re
from pathlib import Path


def parse_excel_csv(file_path: str) -> list:
    path = Path(file_path)
    tcs = []
    try:
        if path.suffix.lower() in [".xlsx", ".xls"]:
            df = pd.read_excel(file_path, sheet_name=None, engine="openpyxl")
            for sheet_name, sheet_df in df.items():
                tcs.extend(_extract_tcs_from_df(sheet_df, sheet_name))
        elif path.suffix.lower() == ".csv":
            df = pd.read_csv(file_path)
            tcs.extend(_extract_tcs_from_df(df, path.stem))
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
    return tcs


def _extract_tcs_from_df(df: pd.DataFrame, source: str) -> list:
    tcs = []
    col_map = {}

    for col in df.columns:
        cl = col.lower().strip()
        if cl in ("description", "details", "steps to reproduce"):
            col_map.setdefault("description", col)
            continue
        if cl in ("created", "created date", "created on", "raised on", "date created"):
            col_map.setdefault("created", col)
            continue
        if cl in ("assignee", "assigned to", "owner"):
            col_map.setdefault("assignee", col)
            continue
        if any(k in cl for k in ["work key", "issue key", "key", "id", "tc id", "test id"]):
            col_map.setdefault("key", col)
        elif any(k in cl for k in ["summary", "title", "name", "description", "test name"]):
            col_map.setdefault("summary", col)
        elif any(k in cl for k in ["component", "module", "feature", "area"]):
            col_map.setdefault("component", col)
        elif any(k in cl for k in ["priority", "severity"]):
            col_map.setdefault("priority", col)
        elif any(k in cl for k in ["label", "tag", "type"]):
            col_map.setdefault("label", col)
        elif any(k in cl for k in ["status", "state"]):
            col_map.setdefault("status", col)

    for _, row in df.iterrows():
        key = str(row.get(col_map.get("key", ""), "")).strip()
        summary = str(row.get(col_map.get("summary", ""), "")).strip()
        if not key or not summary or key == "nan" or summary == "nan":
            continue
        tcs.append({
            "key": key,
            "summary": summary,
            "component": _cell(row, col_map.get("component")),
            "priority": _cell(row, col_map.get("priority")),
            "label": _cell(row, col_map.get("label")),
            "status": _cell(row, col_map.get("status")),
            "source": source,
            "description": _cell(row, col_map.get("description")),
            "created": _cell(row, col_map.get("created")),
            "assignee": _cell(row, col_map.get("assignee")),
        })
    return tcs


def _cell(row, col) -> str:
    if not col:
        return ""
    v = str(row.get(col, "")).strip()
    return "" if v == "nan" else v


def parse_feature_file(file_path: str) -> list:
    """
    Parse a .feature file and return one dict per scenario.
    Captures: title, feature name, file, tags, TC ID tags, and full step text
    (Given/When/Then/And/But lines) so matching can use the complete scenario body.
    """
    scenarios = []
    try:
        content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        feature_name = ""
        current_scenario = None
        pending_tags: list = []

        for raw_line in content.splitlines():
            line = raw_line.strip()

            # Collect @tags — may appear before Feature: or Scenario:
            if line.startswith("@"):
                pending_tags.extend(re.findall(r'@(\S+)', line))
                continue

            if line.lower().startswith("feature:"):
                feature_name = line[8:].strip()
                pending_tags = []
                continue

            if line.lower().startswith("scenario outline:") or line.lower().startswith("scenario:"):
                if current_scenario:
                    current_scenario["steps"] = " ".join(current_scenario["steps"])
                    scenarios.append(current_scenario)

                prefix = "scenario outline:" if "outline" in line.lower() else "scenario:"
                title = line[len(prefix):].strip()

                # TC IDs from title text
                title_tc_ids = [
                    t.upper().replace("_", "-")
                    for t in re.findall(r'(?:amcc|tc|jira|qtm|qmetry)[-_](?:tc[-_])?\d+', title.lower())
                ]
                # TC IDs from @tags on this scenario
                tag_tc_ids = [
                    tag.upper()
                    for tag in pending_tags
                    if re.match(r'(?:amcc|tc|jira|qtm|qmetry|atc)[-_]?\d', tag.lower())
                ]

                current_scenario = {
                    "title": title,
                    "feature": feature_name,
                    "file": Path(file_path).name,
                    "tags": pending_tags[:],
                    "tc_ids": list(dict.fromkeys(title_tc_ids + tag_tc_ids)),
                    "steps": [],
                }
                pending_tags = []
                continue

            # Capture step lines (Given / When / Then / And / But)
            if current_scenario and line.lower().startswith(
                ("given ", "when ", "then ", "and ", "but ", "given\t", "when\t", "then\t")
            ):
                current_scenario["steps"].append(line)

        # Flush the last scenario
        if current_scenario:
            current_scenario["steps"] = " ".join(current_scenario["steps"])
            scenarios.append(current_scenario)

    except Exception as e:
        print(f"Error parsing feature file {file_path}: {e}")
    return scenarios


def parse_json_tcs(file_path: str) -> list:
    """Jira / QMetry sync caches: a list of test-case dicts or {"items": [...]}."""
    import json
    try:
        data = json.loads(Path(file_path).read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
        return []
    items = data.get("items", []) if isinstance(data, dict) else data
    return [t for t in items if isinstance(t, dict) and t.get("key") and t.get("summary")]


def parse_tc_file(file_path: str) -> list:
    """Dispatch on extension: Excel/CSV exports or JSON sync caches."""
    if Path(file_path).suffix.lower() == ".json":
        return parse_json_tcs(file_path)
    return parse_excel_csv(file_path)


def load_tc_dir(directory) -> list:
    """All test cases in a folder, de-duplicated by key (last file wins)."""
    d = Path(directory)
    if not d.exists():
        return []
    by_key = {}
    for f in sorted(d.iterdir()):
        if f.is_file():
            for tc in parse_tc_file(str(f)):
                by_key[tc["key"]] = tc
    return list(by_key.values())
