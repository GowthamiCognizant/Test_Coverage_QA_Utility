"""
common.py — Small helpers shared by Agents 3 and 4.
"""

import re

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "when", "then", "given",
    "should", "user", "users", "able", "are", "was", "not", "can", "has", "have",
    "into", "onto", "been", "will", "all", "any", "its", "via", "per", "page",
    "test", "tests", "verify", "check", "validate", "scenario", "outline", "feature",
    "clicks", "click", "see", "sees", "shown", "display", "displayed", "value", "data",
}

# Jira / QMetry priority names -> P0..P3
_PRIORITY_MAP = [
    (("blocker", "highest", "critical", "p0", "urgent", "sev1", "s1"), "P0"),
    (("high", "major", "p1", "sev2", "s2"), "P1"),
    (("medium", "normal", "p2", "sev3", "s3", "moderate"), "P2"),
    (("low", "lowest", "minor", "trivial", "p3", "p4", "sev4", "s4"), "P3"),
]
PRIORITY_WEIGHT = {"P0": 1.0, "P1": 0.75, "P2": 0.5, "P3": 0.25}


def to_tier(priority: str, default: str = "P2") -> str:
    p = (priority or "").strip().lower()
    if not p or p == "nan":
        return default
    for names, tier in _PRIORITY_MAP:
        if any(p == n or p.startswith(n) for n in names):
            return tier
    return default


def tokens(text: str) -> set:
    words = re.findall(r"[a-z][a-z0-9]{2,}", split_camel(text or "").lower())
    return {w for w in words if w not in STOPWORDS}


def split_camel(text: str) -> str:
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text).replace("_", " ").replace("-", " ")


def overlap(a: set, b: set) -> float:
    """Share of `a` found in `b` (0..1)."""
    return len(a & b) / len(a) if a else 0.0


_prepared: dict = {}


def _prepare(module_index: dict) -> list:
    """Keyword sets per module, built once per index object."""
    cache_key = id(module_index)
    if cache_key not in _prepared:
        modules = module_index.get("modules", {}) if module_index else {}
        _prepared.clear()
        _prepared[cache_key] = [
            (name, set(m.get("keywords", [])), tokens(name), m.get("weight", 0.5))
            for name, m in modules.items()
        ]
    return _prepared[cache_key]


def best_module(text_tokens: set, module_index: dict, component: str = "") -> tuple:
    """
    Pick the application module a test/defect most likely touches.
    Returns (module_name, weight 0..1, match_strength 0..1).
    """
    comp = (component or "").lower()
    best, best_w, best_score = "", 0.5, 0.0
    for name, kw, name_tokens, weight in _prepare(module_index):
        score = overlap(text_tokens, kw)
        if name_tokens and name_tokens <= text_tokens:
            score += 0.6
        if comp and (comp in name.lower() or name.lower() in comp):
            score += 0.5
        if score > best_score:
            best, best_w, best_score = name, weight, score
    if not best or best_score < 0.15:
        return (component.split(",")[0].strip() if component else "Unmapped") or "Unmapped", 0.5, 0.0
    return best, best_w, min(1.0, best_score)
