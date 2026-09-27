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
            "component": str(row.get(col_map.get("component", ""), "")).strip(),
            "priority": str(row.get(col_map.get("priority", ""), "")).strip(),
            "label": str(row.get(col_map.get("label", ""), "")).strip(),
            "status": str(row.get(col_map.get("status", ""), "")).strip(),
            "source": source,
        })
    return tcs


def parse_feature_file(file_path: str) -> list:
    scenarios = []
    try:
        content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        feature_name = ""
        for line in content.splitlines():
            line = line.strip()
            if line.lower().startswith("feature:"):
                feature_name = line[8:].strip()
            elif line.lower().startswith("scenario outline:") or line.lower().startswith("scenario:"):
                prefix = "scenario outline:" if "outline" in line.lower() else "scenario:"
                title = line[len(prefix):].strip()
                tc_ids = re.findall(r'(?:amcc|tc|jira)[-_](?:tc[-_])?\d+', title.lower())
                scenarios.append({
                    "title": title,
                    "feature": feature_name,
                    "file": Path(file_path).name,
                    "tc_ids": [t.upper().replace("_", "-") for t in tc_ids],
                })
    except Exception as e:
        print(f"Error parsing feature file {file_path}: {e}")
    return scenarios
