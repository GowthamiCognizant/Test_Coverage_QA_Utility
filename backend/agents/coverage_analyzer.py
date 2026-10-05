"""
Coverage Analyzer — two modes:

  Type 1: Dev codebase vs Automation repo  (code_coverage_analyser.py handles this)
  Type 2: Jira User Stories/TCs vs Automation feature files  (this module)

Accuracy score is computed here and attached to both result types.
"""

from __future__ import annotations
import json, re
from pathlib import Path

# ── Americold logistics domain keywords ─────────────────────────────────────
DOMAIN_KEYWORDS = [
    "warehouse", "shipment", "receipt", "order", "inventory", "temperature",
    "carrier", "pallet", "dock", "inbound", "outbound", "pick", "pack",
    "dispatch", "transfer", "audit", "compliance", "cold storage", "reefer",
    "rfid", "barcode", "scan", "label", "manifest", "load", "unload",
    "slot", "location", "aisle", "bin", "zone", "wms", "tms", "erp",
    "customer", "vendor", "supplier", "delivery", "pickup", "returns",
    "crossdock", "yard", "trailer", "truck", "route", "schedule",
    "expiry", "batch", "lot", "serial", "quantity", "weight", "volume",
    "americold", "amcc", "compass", "chill", "freeze", "ambient",
    "appointment", "asn", "putaway", "replenishment", "wave", "workorder",
]

BUSINESS_FLOWS = [
    "Inbound Receiving", "Outbound Shipment", "Inventory Management",
    "Order Management", "Temperature Monitoring", "Carrier Management",
    "Returns Processing", "Yard Management", "Dock Scheduling",
    "Labeling Compliance", "Audit Reporting", "User Authentication",
    "Cross Dock", "Putaway", "Replenishment", "Wave Planning",
]


# ── Internal helpers ─────────────────────────────────────────────────────────

def _tokens(text: str) -> set:
    return set(re.findall(r'[a-z0-9]+', text.lower()))


def _jaccard(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _match_score(story: dict, scenario: dict) -> float:
    """How well a Jira story matches an automation scenario (0..1)."""
    story_key = (story.get("key") or "").upper()

    # Exact TC ID match via tags
    for tag in scenario.get("tags", []) + scenario.get("tc_ids", []):
        if story_key and tag.upper() == story_key:
            return 1.0

    # Keyword overlap between story summary and scenario title + feature name
    sc_text = f"{scenario.get('title','')} {scenario.get('feature','')} {scenario.get('file','')}"
    summary_score = _jaccard(story.get("summary", ""), sc_text)

    # Component match bonus
    story_comp = (story.get("component") or "").lower()
    sc_path = (scenario.get("file", "") + " " + scenario.get("folder", "")).lower()
    comp_bonus = 0.12 if story_comp and story_comp in sc_path else 0.0

    return min(1.0, summary_score + comp_bonus)


# ── Story coverage analysis (Type 2) ────────────────────────────────────────

# Cap for demo performance — avoids O(n*m) timeout on large Jira exports
MAX_STORIES = 500


def analyse_story_coverage(stories: list, scenarios: list) -> dict:
    """
    Match Jira stories / TCs to automation feature file scenarios.

    Coverage thresholds:
      ≥ 0.80  → covered   (exact TC ID tag or very strong keyword overlap)
      ≥ 0.20  → partial   (some keyword overlap)
      < 0.20  → missing
    """
    if not stories:
        return {
            "error": "No Jira stories/TCs found. Upload a CSV/Excel or sync from Jira on Data sources.",
            "summary": {"total_stories": 0, "covered": 0, "partial": 0, "missing": 0,
                        "story_coverage_pct": 0, "accuracy_score": 0, "accuracy_label": "Low"},
            "covered": [], "partial": [], "missing": [],
        }

    if not scenarios:
        return {
            "error": "No automation scenarios found. Upload feature files or point to automation repo on Data sources.",
            "summary": {"total_stories": len(stories), "covered": 0, "partial": 0, "missing": len(stories),
                        "story_coverage_pct": 0, "accuracy_score": 0, "accuracy_label": "Low"},
            "covered": [], "partial": [], "missing": [
                {"key": s.get("key",""), "summary": s.get("summary",""),
                 "component": s.get("component",""), "priority": s.get("priority",""),
                 "coverage": "missing", "match_score": 0} for s in stories
            ],
        }

    # Cap large datasets — sample stories prioritising 'Story' issue_type first
    sampled = False
    total_available = len(stories)
    if total_available > MAX_STORIES:
        user_stories = [s for s in stories if (s.get("issue_type") or "").lower() in
                        ("story", "user story", "feature", "epic")]
        rest = [s for s in stories if s not in user_stories]
        stories = (user_stories + rest)[:MAX_STORIES]
        sampled = True

    # Pre-compute scenario token sets and tag sets (avoid recomputing inside O(n*m) loop)
    # Include full step text (Given/When/Then) so matching uses the complete scenario body
    sc_precomputed = []
    for sc in scenarios:
        sc_text = (
            f"{sc.get('title','')} "
            f"{sc.get('feature','')} "
            f"{sc.get('file','')} "
            f"{sc.get('steps','')}"          # full Given/When/Then body
        )
        sc_precomputed.append({
            "sc": sc,
            "tokens": _tokens(sc_text),
            "tags": set(t.upper() for t in sc.get("tags", []) + sc.get("tc_ids", [])),
            "path": (sc.get("file", "") + " " + sc.get("folder", "")).lower(),
        })

    covered_list, partial_list, missing_list = [], [], []

    for story in stories:
        story_key = (story.get("key") or "").upper()
        # Use summary + description for richer matching
        story_tokens = _tokens(
            f"{story.get('summary', '')} {story.get('description', '')}"
        )
        story_comp = (story.get("component") or "").lower()

        best_score, best_sc = 0.0, None
        for pre in sc_precomputed:
            # Exact TC ID match in tags — highest confidence
            if story_key and story_key in pre["tags"]:
                best_score, best_sc = 1.0, pre["sc"]
                break

            # Jaccard on pre-tokenized sets (story summary + description vs full scenario body)
            ta, tb = story_tokens, pre["tokens"]
            if ta and tb:
                jacc = len(ta & tb) / len(ta | tb)
            else:
                jacc = 0.0
            comp_bonus = 0.12 if story_comp and story_comp in pre["path"] else 0.0
            score = min(1.0, jacc + comp_bonus)

            if score > best_score:
                best_score, best_sc = score, pre["sc"]

        entry = {
            "key": story.get("key", ""),
            "summary": story.get("summary", ""),
            "component": story.get("component", ""),
            "priority": story.get("priority", ""),
            "status": story.get("status", ""),
            "match_score": round(best_score, 3),
        }
        if best_sc:
            entry["matched_scenario"] = best_sc.get("title", "")
            entry["matched_file"] = best_sc.get("file", "")

        if best_score >= 0.40:
            entry["coverage"] = "covered"
            covered_list.append(entry)
        elif best_score >= 0.15:
            entry["coverage"] = "partial"
            partial_list.append(entry)
        else:
            entry["coverage"] = "missing"
            missing_list.append(entry)

    total = len(stories)
    story_pct = round((len(covered_list) + 0.5 * len(partial_list)) / total * 100, 1) if total else 0
    accuracy = compute_accuracy_score(stories, scenarios, len(covered_list), len(partial_list), total)

    result = {
        "summary": {
            "total_stories": total,
            "covered": len(covered_list),
            "partial": len(partial_list),
            "missing": len(missing_list),
            "story_coverage_pct": story_pct,
            "accuracy_score": accuracy["overall"],
            "accuracy_label": accuracy["label"],
            "accuracy_color": accuracy["color"],
            "accuracy_breakdown": accuracy["breakdown"],
            "total_scenarios": len(scenarios),
        },
        "covered": covered_list,
        "partial": partial_list,
        "missing": missing_list,
        "analysis_type": "story_coverage",
    }
    if sampled:
        result["sample_note"] = (
            f"Analysed {total} of {total_available} items (top User Stories prioritised). "
            "Upload a filtered CSV export for full analysis."
        )
    return result


# ── Accuracy score ───────────────────────────────────────────────────────────

def compute_accuracy_score(stories: list, scenarios: list,
                           covered: int, partial: int, total: int) -> dict:
    """
    Four-signal accuracy score:

      1. Domain knowledge  (25%) — Americold logistics keywords in automation text
      2. Story traceability (30%) — stories with explicit TC ID tags in feature files
      3. TC mapping quality (30%) — % of stories matched (covered + 0.5×partial)
      4. Business flow coverage (15%) — key flows referenced in automation
    """
    all_text = " ".join(
        f"{sc.get('title','')} {sc.get('feature','')} {sc.get('file','')} {sc.get('folder','')}"
        for sc in scenarios
    ).lower()

    # 1. Domain keywords
    domain_hits = sum(1 for kw in DOMAIN_KEYWORDS if kw in all_text)
    domain_score = min(1.0, domain_hits / max(1, len(DOMAIN_KEYWORDS) * 0.45))

    # 2. Story traceability (TC IDs tagged in feature files)
    tagged_ids: set = set()
    for sc in scenarios:
        for tag in sc.get("tc_ids", []) + sc.get("tags", []):
            tagged_ids.add(tag.upper())
    traced = sum(1 for s in stories if (s.get("key") or "").upper() in tagged_ids)
    story_traceability = traced / max(1, total)

    # 3. TC mapping quality
    tc_mapping = (covered + 0.5 * partial) / max(1, total)

    # 4. Business flow coverage
    flow_hits = sum(
        1 for flow in BUSINESS_FLOWS
        if any(kw.lower() in all_text for kw in flow.split() if len(kw) > 4)
    )
    flow_score = flow_hits / max(1, len(BUSINESS_FLOWS))

    overall = (
        domain_score      * 0.25 +
        story_traceability * 0.30 +
        tc_mapping         * 0.30 +
        flow_score         * 0.15
    )
    pct = round(overall * 100, 1)

    if pct >= 80:
        label, color = "High", "green"
    elif pct >= 60:
        label, color = "Medium", "amber"
    else:
        label, color = "Low", "red"

    return {
        "overall": pct,
        "label": label,
        "color": color,
        "breakdown": {
            "domain_knowledge":   round(domain_score * 100, 1),
            "story_traceability": round(story_traceability * 100, 1),
            "tc_mapping":         round(tc_mapping * 100, 1),
            "flow_coverage":      round(flow_score * 100, 1),
        },
    }


# ── Load feature scenarios from project dirs ─────────────────────────────────

def load_scenarios(project_dir: Path, meta: dict) -> list:
    """Collect all parsed scenarios from feat_dir, repo, and local automation path."""
    from file_parser import parse_feature_file

    scenarios = []
    seen: set = set()
    search_roots = [project_dir / "features", project_dir / "repo"]
    auto_local = meta.get("automation_local_path")
    if auto_local and Path(auto_local).exists():
        search_roots.append(Path(auto_local))

    for root in search_roots:
        if root.exists():
            for f in sorted(root.rglob("*.feature")):
                folder = str(f.relative_to(root).parent) if f.is_relative_to(root) else ""
                try:
                    for sc in parse_feature_file(str(f)):
                        uid = f"{f.name}::{sc['title']}"
                        if uid not in seen:
                            seen.add(uid)
                            sc["folder"] = folder
                            scenarios.append(sc)
                except Exception:
                    pass
    return scenarios
