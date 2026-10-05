"""
code_coverage_analyser.py — Coverage analysis for Agent 01.

Two modes:
  * analyse()          — Static keyword / route matching (no AI required)
  * analyse_with_ai()  — AI-powered: source code → extract business flows → compare vs automation
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_STORY_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")
_STOP = frozenset(
    "the a an is are to of in on for with and or that this it at be by from "
    "as not we have has been when then given after before during while if else "
    "should can will get set use go do see".split()
)


# ── text helpers ──────────────────────────────────────────────────────────────

def _tok(text: str) -> frozenset:
    return frozenset(w for w in re.findall(r"[a-z]{3,}", text.lower()) if w not in _STOP)


def _route_tok(route: str) -> frozenset:
    parts = re.split(r"[/{}\-_]", route)
    return frozenset(p.lower() for p in parts if len(p) >= 3 and not (p.startswith("v") and p[1:].isdigit()))


# ── feature file parser ───────────────────────────────────────────────────────

def _parse_feature_file(path: Path) -> list:
    scenarios = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return scenarios
    current = None
    pending_tags: list = []
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("@"):
            pending_tags = [t.lstrip("@") for t in line.split()]
        elif re.match(r"(?i)^scenario( outline)?:", line):
            if current:
                scenarios.append(current)
            name = re.sub(r"(?i)^scenario( outline)?:\s*", "", line)
            current = {"file": path.name, "name": name, "steps": [], "tags": list(pending_tags), "text": name.lower()}
            pending_tags = []
        elif re.match(r"(?i)^(given|when|then|and|but) ", line) and current is not None:
            step = re.sub(r"(?i)^(given|when|then|and|but) ", "", line)
            current["steps"].append(step)
            current["text"] += " " + step.lower()
    if current:
        scenarios.append(current)
    return scenarios


def load_feature_corpus(feat_dir: Path) -> list:
    corpus = []
    if not feat_dir or not feat_dir.exists():
        return corpus
    for p in feat_dir.rglob("*.feature"):
        corpus.extend(_parse_feature_file(p))
    return corpus


# ── pre-tokenised corpus cache ────────────────────────────────────────────────

def _build_corpus_index(corpus: list) -> list:
    """Pre-tokenise every scenario once. Returns list of (scenario, tok_set)."""
    return [(sc, _tok(sc["text"])) for sc in corpus]


# ── route matching (uses pre-built index) ─────────────────────────────────────

def _match_route(route: str, mod_keywords: list, idx: list) -> tuple:
    rt = _route_tok(route)
    kw = frozenset(w.lower() for w in mod_keywords[:30] if len(w) >= 3)
    best_score, best_name = 0, None
    for sc, sc_tok in idx:
        r_overlap = len(rt & sc_tok)
        verbatim  = route.lower().rstrip("/") in sc["text"] or any(r in sc["text"] for r in rt)
        k_overlap = len(kw & sc_tok)
        score = r_overlap * 2 + k_overlap + (3 if verbatim else 0)
        if score > best_score:
            best_score, best_name = score, sc["name"]
    if best_score >= 6:
        return True, best_name, "high"
    if best_score >= 4:
        return True, best_name, "medium"
    return False, None, "none"


def _match_openapi_endpoint(endpoint: dict, idx: list) -> tuple:
    ep_text = " ".join(filter(None, [
        endpoint.get("path", ""), endpoint.get("summary", ""),
        endpoint.get("operationId", ""), " ".join(endpoint.get("tags") or []),
    ]))
    ep_tok    = _tok(ep_text)
    path_tok  = _route_tok(endpoint.get("path", ""))
    best_score, best_name = 0, None
    for sc, sc_tok in idx:
        ep_overlap   = len(ep_tok & sc_tok)
        path_overlap = len(path_tok & sc_tok)
        verbatim     = any(t in sc["text"] for t in path_tok if len(t) > 4)
        score = ep_overlap + path_overlap * 2 + (4 if verbatim else 0)
        if score > best_score:
            best_score, best_name = score, sc["name"]
    if best_score >= 8:
        return True, best_name, "high"
    if best_score >= 5:
        return True, best_name, "medium"
    if best_score >= 3:
        return True, best_name, "low"
    return False, None, "none"


def _count_module_scenarios(mod_tok: frozenset, idx: list) -> int:
    return sum(1 for _sc, sc_tok in idx if mod_tok & sc_tok)


# ── story traceability ────────────────────────────────────────────────────────

def _qm_story_keys(qm_path: Optional[Path]) -> set:
    keys: set = set()
    if not qm_path or not qm_path.exists():
        return keys
    try:
        data = json.loads(qm_path.read_text())
        for tc in data.get("items", []):
            for link in tc.get("links", []):
                m = _STORY_KEY_RE.fullmatch(str(link))
                if m:
                    keys.add(m.group(1))
    except Exception:
        pass
    return keys


def _feature_story_keys(corpus: list) -> set:
    keys: set = set()
    for sc in corpus:
        for tag in sc["tags"]:
            m = _STORY_KEY_RE.fullmatch(tag)
            if m:
                keys.add(m.group(1))
        for m in _STORY_KEY_RE.finditer(sc["text"]):
            keys.add(m.group(1))
    return keys


# ── main analyser ─────────────────────────────────────────────────────────────

def analyse(
    module_index: dict,
    feat_dir: Path,
    automation_local_path: Optional[Path] = None,
) -> dict:
    """
    Static code-vs-automation coverage (no AI required).
    Matches module routes/keywords against automation feature file scenarios ONLY.
    Jira/QMetry data is not used here — that is Type 2 (story coverage).
    """
    # Load + merge feature corpus
    corpus = load_feature_corpus(feat_dir)
    if automation_local_path:
        local_corpus = load_feature_corpus(Path(automation_local_path))
        if corpus:
            existing = {s["name"] for s in corpus}
            corpus += [s for s in local_corpus if s["name"] not in existing]
        else:
            corpus = local_corpus

    # Pre-tokenise once — all matching functions use this index
    idx = _build_corpus_index(corpus)

    # ── module + route coverage ───────────────────────────────────────────────
    mods_out = []
    total_routes = covered_routes = 0
    uncovered_routes: list = []

    openapi_info  = module_index.get("openapi") if isinstance(module_index, dict) else None
    all_openapi_eps = (openapi_info or {}).get("endpoints", [])
    mods = module_index.get("modules", {}) if isinstance(module_index, dict) else {}

    for mod_name, mod in mods.items():
        routes   = mod.get("routes", [])
        keywords = mod.get("keywords", [])
        layer    = mod.get("layer", "unknown")
        weight   = round(mod.get("weight", 0), 3)
        mod_tok  = _tok(mod_name) | frozenset(w.lower() for w in keywords[:30] if len(w) >= 3)

        route_detail: list = []

        # OpenAPI endpoints first (best accuracy)
        mod_eps = [
            ep for ep in all_openapi_eps
            if any(_tok(t) & mod_tok for t in (ep.get("tags") or []))
            or bool(_route_tok(ep["path"]) & mod_tok)
        ]
        if mod_eps:
            for ep in mod_eps:
                cov, matched, conf = _match_openapi_endpoint(ep, idx)
                label = f"{ep['method']} {ep['path']}"
                desc  = ep.get("summary") or ""
                route_detail.append({"route": label, "covered": cov, "matched_by": matched,
                                     "confidence": conf, "description": desc, "source": "openapi"})
                if cov:
                    covered_routes += 1
                else:
                    uncovered_routes.append({"module": mod_name, "route": label, "description": desc})
            total_routes += len(mod_eps)
        else:
            for route in routes:
                cov, matched, conf = _match_route(route, keywords, idx)
                route_detail.append({"route": route, "covered": cov, "matched_by": matched,
                                     "confidence": conf, "source": "annotation"})
                if cov:
                    covered_routes += 1
                else:
                    uncovered_routes.append({"module": mod_name, "route": route, "description": ""})
            total_routes += len(routes)

        sc_count   = _count_module_scenarios(mod_tok, idx)
        rts_cov    = sum(1 for r in route_detail if r["covered"])
        total_r    = len(route_detail)
        cov_pct    = round(100 * rts_cov / total_r) if total_r else min(100, sc_count * 20)

        mods_out.append({
            "module": mod_name, "layer": layer, "weight": weight, "loc": mod.get("loc", 0),
            "routes_total": total_r, "routes_covered": rts_cov,
            "scenarios_count": sc_count, "coverage_pct": cov_pct,
            "route_detail": route_detail, "has_openapi": bool(mod_eps),
        })

    mods_out.sort(key=lambda m: (-m["coverage_pct"], -m["scenarios_count"]))

    mod_covered_count = sum(1 for m in mods_out if m["coverage_pct"] > 0)
    high_conf = sum(1 for m in mods_out for r in m["route_detail"] if r.get("confidence") == "high"  and r["covered"])
    med_conf  = sum(1 for m in mods_out for r in m["route_detail"] if r.get("confidence") == "medium" and r["covered"])

    return {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "total_scenarios": len(corpus),
        "total_modules": len(mods_out),
        "modules_covered": mod_covered_count,
        "module_coverage_pct": round(100 * mod_covered_count / len(mods_out)) if mods_out else 0,
        "total_routes": total_routes,
        "covered_routes": covered_routes,
        "route_coverage_pct": round(100 * covered_routes / total_routes) if total_routes else 0,
        "openapi_used": bool(all_openapi_eps),
        "openapi_endpoints_total": len(all_openapi_eps),
        "match_confidence": {"high": high_conf, "medium": med_conf,
                             "low": max(0, covered_routes - high_conf - med_conf)},
        "modules": mods_out,
        "uncovered_routes": uncovered_routes[:150],
        "analysis_type": "code_vs_automation",
    }


# ── AI-powered analysis ───────────────────────────────────────────────────────

_HIGH_VALUE_KEYWORDS = frozenset({
    "controller", "service", "handler", "route", "router", "api", "endpoint",
    "manager", "processor", "business", "logic", "usecase", "use_case",
    "resource", "action", "command", "query", "repository", "facade",
})


def analyse_with_ai(project_dir: Path, module_index: dict, meta: dict, api_key: str,
                    model_id: str = "claude") -> dict:
    """
    AI-powered coverage analysis — works with Claude or Gemini.
      1. Samples source files from the indexed app codebase.
      2. Collects feature files + step defs from the automation repo.
      3. Calls model.analyse_codebase_coverage() for semantic analysis.
    """
    from models import get_model
    ai_model = get_model(model_id, api_key)

    # ── 1. Resolve source root ────────────────────────────────────────────────
    app_meta   = meta.get("codebase", {}).get("app", {})
    local_path = app_meta.get("local_path")
    zip_root   = project_dir / "appcode"

    if local_path and Path(local_path).exists():
        src_root = Path(local_path)
    elif zip_root.exists():
        src_root = zip_root
    else:
        raise ValueError(
            "No application source code found. "
            "Upload the dev team's source zip or set a local path on Data sources first."
        )

    # ── 2. Sample source files ────────────────────────────────────────────────
    # Only pick files that are actual code — skip config/env/installer files.
    _CODE_EXTS = {".cs", ".java", ".py", ".ts", ".js", ".go", ".rb", ".kt",
                  ".cpp", ".c", ".h", ".scala", ".php", ".swift", ".rs"}
    _SKIP_STEMS = {
        "environmentconfiguration", "reportingconfiguration", "appsettings",
        "web.config", "app.config", "package.json", "package-lock.json",
        "tsconfig", "webpack", "babel", ".env", "dockerfile", "makefile",
        "windowsserviceinstaller", "windowsserviceinstaller.designer",
        "assemblyinfo", "globalassemblyinfo",
    }

    def _is_code_file(rel_path: str) -> bool:
        p = Path(rel_path)
        stem_lower = p.stem.lower()
        ext_lower  = p.suffix.lower()
        # Skip known non-code stems
        if stem_lower in _SKIP_STEMS:
            return False
        # Skip config/env patterns by name prefix
        if any(stem_lower.startswith(pfx) for pfx in
               ("environmentconfiguration", "reportingconfiguration", "appsettings",
                "web.", "app.", "nlog", "log4", "startup", "program")):
            return False
        # Must be a recognised source code extension
        return ext_lower in _CODE_EXTS

    mods = module_index.get("modules", {})
    source_samples: dict = {}
    sampled_file_paths: list = []   # for transparency in result

    for mod_name, mod in mods.items():
        sample_files = mod.get("sample_files", [])

        # Filter to only real code files, then prefer high-value layers
        code_files = [f for f in sample_files if _is_code_file(f)]
        preferred  = [f for f in code_files if any(k in Path(f).stem.lower() for k in _HIGH_VALUE_KEYWORDS)]
        rest       = [f for f in code_files if f not in preferred]
        candidates = (preferred + rest)[:5]  # take up to 5 real code files per module

        files_data = []
        for rel_path in candidates:
            abs_path = src_root / rel_path
            if not abs_path.exists():
                hits = list(src_root.rglob(Path(rel_path).name))
                abs_path = hits[0] if hits else abs_path
            if abs_path.exists():
                try:
                    content = abs_path.read_text(encoding="utf-8", errors="replace")
                    files_data.append({"path": rel_path, "content": content[:2000]})
                    sampled_file_paths.append(rel_path)
                except Exception:
                    pass
            if len(files_data) >= 3:
                break

        if files_data:
            source_samples[mod_name] = {"layer": mod.get("layer", "unknown"), "files": files_data}

    # If no code files found at all — this codebase has no application logic we can sample
    if not source_samples:
        return {
            "business_flows": [],
            "summary": {"total_flows": 0, "covered": 0, "partial": 0, "missing": 0, "coverage_pct": 0},
            "error": (
                "No application logic files (.cs/.java/.py/.ts/etc.) found in the indexed codebase. "
                "The uploaded zip appears to contain only configuration files, SQL scripts, or installer files. "
                "For Type 1 analysis, upload the dev team's application source code (controllers, services, APIs)."
            ),
            "sampled_files": [],
            "scanned_at": datetime.now(timezone.utc).isoformat(),
            "ai_powered": True,
        }

    # ── 3. Collect automation content ─────────────────────────────────────────
    auto_local = meta.get("automation_local_path")
    feat_dir    = project_dir / "features"
    repo_dir    = project_dir / "repo"
    stepdef_dir = project_dir / "stepdefs"

    feature_texts: list = []
    stepdef_texts: list = []

    def _collect_features(root: Path):
        for p in root.rglob("*.feature"):
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
                feature_texts.append({"file": p.name, "text": text})
            except Exception:
                pass

    def _collect_stepdefs(root: Path):
        for ext in ("*.py", "*.js", "*.ts", "*.java", "*.rb"):
            for p in root.rglob(ext):
                name_lower = p.name.lower()
                parent_lower = str(p.parent).lower()
                if "step" in name_lower or "step" in parent_lower or "glue" in parent_lower:
                    try:
                        content = p.read_text(encoding="utf-8", errors="replace")
                        stepdef_texts.append({"file": p.name, "text": content})
                    except Exception:
                        pass
                if len(stepdef_texts) >= 10:
                    return

    # Feature priority: uploaded files → uploaded repo → local path
    if feat_dir.exists() and any(feat_dir.rglob("*.feature")):
        _collect_features(feat_dir)
    if repo_dir.exists() and any(repo_dir.rglob("*.feature")):
        _collect_features(repo_dir)
    if not feature_texts and auto_local and Path(auto_local).exists():
        _collect_features(Path(auto_local))

    # Step defs
    if stepdef_dir.exists():
        _collect_stepdefs(stepdef_dir)
    if not stepdef_texts and repo_dir.exists():
        _collect_stepdefs(repo_dir)
    if not stepdef_texts and auto_local and Path(auto_local).exists():
        _collect_stepdefs(Path(auto_local))

    automation_content = {
        "features":  feature_texts[:50],
        "stepdefs":  stepdef_texts[:10],
    }

    # ── 4. Call AI model (Claude or Gemini) ──────────────────────────────────
    result = ai_model.analyse_codebase_coverage(source_samples, automation_content)

    result["scanned_at"]       = datetime.now(timezone.utc).isoformat()
    result["total_scenarios"]  = len(feature_texts)
    result["total_stepdefs"]   = len(stepdef_texts)
    result["total_modules"]    = len(source_samples)
    result["ai_powered"]       = True
    result["sampled_files"]    = sampled_file_paths   # transparency: exactly what the AI read

    return result
