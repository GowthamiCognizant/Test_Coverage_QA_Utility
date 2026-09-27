import re
from collections import defaultdict


def analyze_coverage(jira_tcs: list, feature_scenarios: list) -> dict:
    covered_ids = set()
    for scenario in feature_scenarios:
        for tc_id in scenario.get("tc_ids", []):
            covered_ids.add(tc_id.upper())
        title_ids = re.findall(r'(?:AMCC|TC)[-_](?:TC[-_])?\d+', scenario["title"], re.IGNORECASE)
        for tid in title_ids:
            covered_ids.add(tid.upper().replace("_", "-"))

    covered = []
    uncovered = []
    for tc in jira_tcs:
        key = tc["key"].upper()
        is_covered = key in covered_ids
        if is_covered:
            matching = [s for s in feature_scenarios if key in [x.upper() for x in s.get("tc_ids", [])]
                        or key.lower() in s["title"].lower()]
            tc["covered_by"] = matching[0]["file"] if matching else "unknown"
            covered.append(tc)
        else:
            uncovered.append(tc)

    flow_groups = _group_by_flow(uncovered)

    feature_summary = defaultdict(list)
    for scenario in feature_scenarios:
        feature_summary[scenario["file"]].append(scenario["title"])

    return {
        "summary": {
            "total": len(jira_tcs),
            "covered": len(covered),
            "uncovered": len(uncovered),
            "coverage_pct": round(len(covered) / len(jira_tcs) * 100, 1) if jira_tcs else 0,
        },
        "covered_tcs": covered,
        "uncovered_tcs": uncovered,
        "uncovered_flows": flow_groups,
        "feature_summary": dict(feature_summary),
    }


def _group_by_flow(tcs: list) -> dict:
    flow_keywords = {
        "Read-only admin access": ["read-only", "read only", "unavailability", "role 1", "role1"],
        "Create message — date validations": ["start date", "end date", "date", "dd/mm", "mm/dd", "greater than", "prior to"],
        "Create message — section placement": ["future section", "historical section", "current section", "displayed in future", "displayed in current", "displayed in historical"],
        "Create message — typeahead (role id)": ["role id", "role_id", "active role", "inactive role"],
        "Create message — typeahead (locked/expired)": ["locked", "expired", "inactive", "purged"],
        "Create message — long message": ["long message", "1000", "truncation", "without truncation"],
        "Edit message — date updates": ["update.*date", "date.*manual", "date.*picker", "date fields"],
        "Edit message — section placement": ["updated message.*section", "past.*current", "past.*future", "current.*future"],
        "Search — date columns": ["start date.*search", "end date.*search", "search.*date"],
        "Search — type/account columns": ["type.*column", "account.*column", "account/user.*column"],
        "Search — clear and restore": ["clearing search", "clear.*search", "restores full list"],
        "Pagination — sections on page 1": ["page 1", "current.*future.*historical", "page.*section"],
        "Message count — sum of sections": ["sum of", "sum.*current.*future", "total.*count.*sum"],
        "Message count — filter update": ["count.*search", "count.*filter", "updated based on search"],
        "Message count — future/historical create": ["count.*future.*message", "count.*historical.*message"],
        "Delete — confirmation popup": ["confirm.*delete", "confirmation popup", "confirm deletion"],
    }

    groups = defaultdict(list)
    assigned = set()

    for tc in tcs:
        summary_lower = tc["summary"].lower()
        matched = False
        for flow, keywords in flow_keywords.items():
            if any(re.search(kw, summary_lower) for kw in keywords):
                groups[flow].append({"key": tc["key"], "summary": tc["summary"]})
                assigned.add(tc["key"])
                matched = True
                break
        if not matched:
            groups["Other / miscellaneous"].append({"key": tc["key"], "summary": tc["summary"]})

    return dict(groups)
