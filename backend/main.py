from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn, json, uuid, shutil, re, zipfile
from collections import Counter
from datetime import datetime, timedelta
from typing import List, Optional
from pathlib import Path

from config import (
    HOST, PORT, get_api_key, check_keys_on_startup,
    JIRA_BASE_URL, JIRA_PROJECT_KEY, QMETRY_API_BASE, APP_URL,
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_USE_TLS,
    jira_configured, qmetry_configured, smtp_configured,
    CLAUDE_API_KEY,
)
from connectors import JiraClient, JiraError, QMetryClient, QMetryError
from connectors.jira_client import DEFECT_TYPES, build_jql, utc_now_iso
from agents import golden_suite, risk_scanner
from agents import failure_analyzer
from agents import domain_expert
from agents.app_indexer import extract_zip, build_index, load_index, index_local_path
from agents.code_coverage_analyser import analyse as code_coverage_analyse, analyse_with_ai as code_coverage_ai
from agents.coverage_analyzer import analyse_story_coverage, load_scenarios, compute_accuracy_score
from auth import create_token, verify_token, hash_password, verify_password, users_db
from file_parser import parse_feature_file, load_tc_dir
from report_generator import generate_word_report
from models import get_model, list_models

app = FastAPI(title="Test Coverage Utility", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

GUEST_USER = "guest"

ALLOWED_EXTENSIONS = {
    "jira":     [".xlsx", ".xls", ".csv"],
    "features": [".feature"],
    "stepdefs": [".py"],
    "defects":  [".xlsx", ".xls", ".csv", ".json"],
}

security = HTTPBearer(auto_error=False)


def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> str:
    """
    Returns the logged-in username if a valid token is provided,
    otherwise returns GUEST_USER so the app works without login.
    """
    if credentials:
        user = verify_token(credentials.credentials)
        if user:
            return user
    return GUEST_USER


def get_project_dir(user: str, project_id: str) -> Path:
    d = UPLOAD_DIR / user / project_id
    if not d.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    return d


def load_meta(project_dir: Path) -> dict:
    p = project_dir / "meta.json"
    return json.loads(p.read_text()) if p.exists() else {}


def save_meta(project_dir: Path, meta: dict):
    (project_dir / "meta.json").write_text(json.dumps(meta, indent=2))


def wipe_all_files_and_analysis(user: str, project_id: str, project_dir: Path):
    """Deletes ALL uploaded files (jira, features, stepdefs) + analysis + generated scripts."""
    for folder in ["jira", "features", "stepdefs", "defects"]:
        d = project_dir / folder
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    f.unlink()
    analysis_file = project_dir / "analysis_result.json"
    if analysis_file.exists():
        analysis_file.unlink()
    output_dir = OUTPUT_DIR / user / project_id
    if output_dir.exists():
        for f in output_dir.iterdir():
            if f.is_file():
                f.unlink()


# ── MODELS ────────────────────────────────────────────────────────────────────

@app.get("/api/models")
def available_models():
    return list_models()


# ── AUTH ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(username: str = Form(...), password: str = Form(...), team: str = Form("")):
    if username == GUEST_USER:
        raise HTTPException(status_code=400, detail="Username 'guest' is reserved")
    if username in users_db:
        raise HTTPException(status_code=400, detail="Username already exists")
    users_db[username] = {"password": hash_password(password), "team": team or username}
    return {"token": create_token(username), "username": username, "team": team or username}


@app.post("/api/auth/login")
def login(username: str = Form(...), password: str = Form(...)):
    user = users_db.get(username)
    if not user or not verify_password(password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token(username), "username": username, "team": user["team"]}


# ── PROJECTS ──────────────────────────────────────────────────────────────────

@app.get("/api/projects")
def list_projects(user: str = Depends(get_optional_user)):
    user_dir = UPLOAD_DIR / user
    if not user_dir.exists():
        return []
    projects = [
        {"id": d.name, **{k: v for k, v in load_meta(d).items() if k != "password"}}
        for d in user_dir.iterdir() if d.is_dir()
    ]
    # Sort: projects with real data (code/story coverage) first, then alphabetically
    def _priority(p):
        pid = p["id"]
        pd = user_dir / pid
        has_data = (pd / "code_coverage.json").exists() or (pd / "story_coverage.json").exists()
        return (0 if has_data else 1, pid)
    return sorted(projects, key=_priority)


@app.post("/api/projects")
def create_project(
    name: str = Form(...),
    model: str = Form("claude"),
    user: str = Depends(get_optional_user)
):
    project_id = str(uuid.uuid4())[:8]
    d = UPLOAD_DIR / user / project_id
    d.mkdir(parents=True, exist_ok=True)
    save_meta(d, {"name": name, "id": project_id, "model": model})
    return {"id": project_id, "name": name, "model": model}


@app.put("/api/projects/{project_id}/settings")
def update_settings(
    project_id: str,
    model: str = Form(None),
    user: str = Depends(get_optional_user)
):
    d = get_project_dir(user, project_id)
    meta = load_meta(d)
    if model:
        meta["model"] = model
    save_meta(d, meta)
    return {"updated": True}


# ── FILE UPLOAD ───────────────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/upload")
async def upload_files(
    project_id: str,
    files: List[UploadFile] = File(...),
    file_type: str = Form(...),
    user: str = Depends(get_optional_user)
):
    project_dir = get_project_dir(user, project_id)
    if file_type not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unknown file type: {file_type}")

    allowed = ALLOWED_EXTENSIONS[file_type]
    type_dir = project_dir / file_type
    type_dir.mkdir(exist_ok=True)
    saved = []

    for f in files:
        suffix = Path(f.filename).suffix.lower()
        if suffix not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"'{f.filename}': unsupported extension '{suffix}'. Allowed: {', '.join(allowed)}"
            )
        content = await f.read()
        (type_dir / f.filename).write_bytes(content)
        saved.append({"name": f.filename, "size": len(content), "type": file_type})

    return {"uploaded": saved}


@app.get("/api/projects/{project_id}/files")
def list_files(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    result = []
    for t in ["jira", "features", "stepdefs", "defects"]:
        d = project_dir / t
        if d.exists():
            for f in d.iterdir():
                result.append({"name": f.name, "type": t, "size": f.stat().st_size})
    return result


@app.delete("/api/projects/{project_id}/files/{file_type}/{filename}")
def delete_file(
    project_id: str,
    file_type: str,
    filename: str,
    user: str = Depends(get_optional_user)
):
    project_dir = get_project_dir(user, project_id)
    fp = project_dir / file_type / filename
    if not fp.exists():
        raise HTTPException(status_code=404, detail="File not found")
    # Wipe ALL uploaded files + analysis when any file is deleted
    wipe_all_files_and_analysis(user, project_id, project_dir)
    return {"deleted": filename}


@app.delete("/api/projects/{project_id}/clear-analysis")
def clear_analysis(project_id: str, user: str = Depends(get_optional_user)):
    """Wipes ALL uploaded files + analysis + generated scripts."""
    project_dir = get_project_dir(user, project_id)
    wipe_all_files_and_analysis(user, project_id, project_dir)
    return {"cleared": True}


@app.post("/api/projects/{project_id}/upload-env")
async def upload_env_config(
    project_id: str,
    files: List[UploadFile] = File(...),
    user: str = Depends(get_optional_user)
):
    """Upload environment config JSON files (DEV.json, UAT.json, PROD.json)"""
    project_dir = get_project_dir(user, project_id)
    env_dir = project_dir / "envconfigs"
    env_dir.mkdir(exist_ok=True)
    saved = []
    for f in files:
        if not f.filename.endswith(".json"):
            continue
        content = await f.read()
        (env_dir / f.filename).write_bytes(content)
        saved.append(f.filename)
    return {"uploaded": saved}


@app.post("/api/projects/{project_id}/feature-text")
def save_feature_text(
    project_id: str,
    filename: str = Form(...),
    content: str = Form(...),
    user: str = Depends(get_optional_user)
):
    feat_dir = get_project_dir(user, project_id) / "features"
    feat_dir.mkdir(parents=True, exist_ok=True)
    safe_name = filename if filename.endswith(".feature") else filename + ".feature"
    (feat_dir / safe_name).write_text(content)
    return {"saved": safe_name}


# ── AI ANALYSIS ───────────────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/analyze")
def run_analysis(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)

    jira_dir = project_dir / "jira"
    feat_dir = project_dir / "features"

    if not jira_dir.exists() or not any(jira_dir.iterdir()):
        raise HTTPException(status_code=400, detail="No Jira data yet. Sync from Jira on Data sources first.")

    model_id = meta.get("model", "claude")
    try:
        api_key = get_api_key(model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Excel/CSV uploads + Jira/QMetry sync caches (jira_sync.json, qmetry_testcases.json)
    all_tcs = load_tc_dir(jira_dir)
    jira_tcs = _agent1_scope(all_tcs)

    # Feature files: uploaded dir → uploaded repo → automation local path (all optional)
    feature_scenarios = []
    auto_local = meta.get("automation_local_path")
    repo_dir   = project_dir / "repo"
    for search_root in [feat_dir, repo_dir] + ([Path(auto_local)] if auto_local and Path(auto_local).exists() else []):
        if search_root.exists():
            for f in sorted(search_root.rglob("*.feature")):
                try:
                    feature_scenarios.extend(parse_feature_file(str(f)))
                except Exception:
                    pass

    model = get_model(model_id, api_key)

    # Load previous analysis for before/after comparison (Point 8)
    previous_analysis = None
    prev_result_path = project_dir / "analysis_result.json"
    if prev_result_path.exists():
        try:
            previous_analysis = json.loads(prev_result_path.read_text())
        except Exception:
            pass

    # Load previous Jira TCs for new/changed detection (Points 1 & 2)
    previous_jira_tcs = None
    prev_jira_path = project_dir / "previous_jira_tcs.json"
    if prev_jira_path.exists():
        try:
            previous_jira_tcs = json.loads(prev_jira_path.read_text())
        except Exception:
            pass

    # Load environment configs (Point 10)
    env_configs = {}
    env_dir = project_dir / "envconfigs"
    if env_dir.exists():
        for ef in env_dir.iterdir():
            if ef.suffix == ".json":
                try:
                    env_configs[ef.stem] = json.loads(ef.read_text())
                except Exception:
                    pass

    try:
        result = model.analyze_coverage(
            jira_tcs,
            feature_scenarios,
            previous_analysis=previous_analysis,
            previous_jira_tcs=previous_jira_tcs,
            env_configs=env_configs if env_configs else None,
        )
    except Exception as ai_err:
        import traceback
        print(f"\n[analyze] FULL TRACEBACK:\n{traceback.format_exc()}\n")
        msg = str(ai_err)
        if "credit balance is too low" in msg or "billing" in msg.lower():
            raise HTTPException(status_code=402, detail="Anthropic API credit balance is too low. Go to console.anthropic.com/settings/billing to top up, then retry.")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {msg}")

    result["meta"] = {
        "jira_files":      len(list(jira_dir.iterdir())),
        "feature_files":   len([f for d in [feat_dir, repo_dir] if d.exists() for f in d.rglob("*.feature")]),
        "total_jira_tcs":  len(jira_tcs),
        "available_tcs":   len(all_tcs),
        "total_scenarios": len(feature_scenarios),
        "model_used":      model.model_name(),
    }

    # Save current Jira TCs as "previous" for next run
    prev_jira_path.write_text(json.dumps(jira_tcs, indent=2))
    (project_dir / "analysis_result.json").write_text(json.dumps(result, indent=2))

    # Clear previously generated scripts
    output_dir = OUTPUT_DIR / user / project_id
    if output_dir.exists():
        for f in output_dir.iterdir():
            if f.is_file():
                f.unlink()

    return result


@app.get("/api/projects/{project_id}/analysis")
def get_analysis(project_id: str, user: str = Depends(get_optional_user)):
    rp = get_project_dir(user, project_id) / "analysis_result.json"
    if not rp.exists():
        raise HTTPException(status_code=404, detail="No analysis run yet")
    return json.loads(rp.read_text())


# ── CODE COVERAGE MATRIX (Agent 1 — AI-powered, static fallback) ──────────────

@app.post("/api/projects/{project_id}/coverage/code-scan")
def run_code_coverage(project_id: str, user: str = Depends(get_optional_user)):
    """
    AI-powered: source code → Claude extracts business flows → matches against automation code.
    Falls back to static keyword matching when no Claude API key is configured.
    """
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)

    idx_path = project_dir / "appcode_index.json"
    if not idx_path.exists():
        raise HTTPException(
            status_code=400,
            detail="No application codebase indexed yet. Upload the dev team's source zip or point to a local path on Data sources → Application code first.",
        )
    module_index = json.loads(idx_path.read_text())

    # ── Try AI-powered analysis (Claude or Gemini based on project setting) ──
    model_id = meta.get("model", "gemini")
    try:
        ai_key = get_api_key(model_id)
    except ValueError:
        ai_key = None

    if ai_key:
        try:
            result = code_coverage_ai(project_dir, module_index, meta, ai_key, model_id)
            (project_dir / "code_coverage.json").write_text(json.dumps(result, indent=2))
            return result
        except Exception as ai_err:
            msg = str(ai_err)
            if "credit balance is too low" in msg or "billing" in msg.lower():
                raise HTTPException(status_code=402, detail="API credit balance is too low. Check your API key billing and retry.")
            import traceback
            print(f"[code-scan] AI analysis failed ({ai_err}), falling back to static.\n{traceback.format_exc()}")

    # ── Static fallback (requires feature files) ──────────────────────────────
    auto_local = meta.get("automation_local_path")
    feat_dir   = project_dir / "features"
    repo_dir   = project_dir / "repo"
    has_automation = (
        (feat_dir.exists() and any(feat_dir.rglob("*.feature")))
        or (repo_dir.exists() and any(repo_dir.rglob("*.feature")))
        or (auto_local and Path(auto_local).exists() and any(Path(auto_local).rglob("*.feature")))
    )
    if not has_automation:
        raise HTTPException(
            status_code=400,
            detail="No feature files found. Upload .feature files or point to a local automation repo on Data sources first.",
        )

    # Type 1 is purely codebase business flows vs automation feature files —
    # Jira/QMetry data is not used here (that belongs in Type 2 story coverage).
    result = code_coverage_analyse(
        module_index,
        feat_dir,
        automation_local_path=Path(auto_local) if auto_local and Path(auto_local).exists() else None,
    )
    result["scanned_at"] = utc_now_iso()
    (project_dir / "code_coverage.json").write_text(json.dumps(result, indent=2))
    return result


@app.get("/api/projects/{project_id}/coverage/code-scan")
def get_code_coverage(project_id: str, user: str = Depends(get_optional_user)):
    p = get_project_dir(user, project_id) / "code_coverage.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="No code coverage scan run yet")
    return json.loads(p.read_text())


# ── JIRA CSV/EXCEL UPLOAD (for POC without live Jira) ────────────────────────

@app.post("/api/projects/{project_id}/upload/jira-csv")
async def upload_jira_csv(
    project_id: str,
    file: UploadFile = File(...),
    file_type: str = Form("stories"),   # "stories" | "defects"
    user: str = Depends(get_optional_user),
):
    """
    Accept a Jira CSV or Excel export and store it in the project's jira/ folder.
    file_type: "stories"  → saved as csv_stories.json
               "defects"  → saved as csv_defects.json
    """
    project_dir = get_project_dir(user, project_id)
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Only .csv / .xlsx / .xls accepted")

    jira_dir = project_dir / "jira"
    jira_dir.mkdir(exist_ok=True)

    # Save raw file so file_parser can read it
    raw_path = jira_dir / f"_upload_{file_type}{suffix}"
    content = await file.read()
    raw_path.write_bytes(content)

    from file_parser import parse_excel_csv, parse_tc_file
    try:
        tcs = parse_tc_file(str(raw_path))
    except Exception as e:
        raw_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    if not tcs:
        raw_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="No rows extracted — check column headers (key/id, summary/title required)")

    out_key = "csv_stories" if file_type == "stories" else "csv_defects"
    out_path = jira_dir / f"{out_key}.json"
    out_path.write_text(json.dumps(tcs, indent=2))
    raw_path.unlink(missing_ok=True)

    return {"ok": True, "file_type": file_type, "rows": len(tcs), "saved_as": f"{out_key}.json"}


# ── STORY COVERAGE (Type 2: Jira stories/TCs vs Automation feature files) ────

def _load_stories_for_coverage(jira_dir: Path) -> list:
    """
    Load Jira stories/TCs from ALL available sources in the jira/ folder:
    - jira_sync.json     (live sync cache)
    - csv_stories.json   (dedicated CSV upload)
    - any .xlsx/.csv uploaded via file upload
    Excludes pure defect-type items.
    """
    DEFECT_TYPES_LOWER = {"bug", "defect", "production defect", "uat defect"}
    all_items = load_tc_dir(jira_dir) if jira_dir.exists() else []

    # Include everything that is NOT a pure defect
    stories = [
        t for t in all_items
        if (t.get("issue_type") or t.get("label") or "story").lower()
        not in DEFECT_TYPES_LOWER
    ]
    # If filter removed everything (e.g., all are defects), fall back to all items
    return stories if stories else all_items


@app.post("/api/projects/{project_id}/coverage/story-coverage")
def run_story_coverage(project_id: str, user: str = Depends(get_optional_user)):
    """
    Type 2 coverage analysis: Jira user stories / TCs vs automation feature files.
    Uses AI model (Claude/Gemini) for semantic matching with confidence scores.
    Falls back to keyword matching if no AI key is configured.
    """
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)

    jira_dir  = project_dir / "jira"
    stories   = _load_stories_for_coverage(jira_dir)
    scenarios = load_scenarios(project_dir, meta)

    # Try AI-powered matching first
    model_id = meta.get("model", "claude")
    ai_model = None
    try:
        api_key  = get_api_key(model_id)
        ai_model = get_model(model_id, api_key)
    except Exception:
        ai_model = None

    if ai_model and hasattr(ai_model, "analyse_story_coverage_ai"):
        try:
            result = ai_model.analyse_story_coverage_ai(stories, scenarios)
        except Exception as ai_err:
            # AI call failed (billing, rate limit, network) — fall back to keyword matching
            result = analyse_story_coverage(stories, scenarios)
            result["ai_fallback_reason"] = str(ai_err)
    else:
        # Keyword-matching fallback (no AI key configured)
        result = analyse_story_coverage(stories, scenarios)

    result["scanned_at"] = utc_now_iso()
    result["meta"] = {
        "total_stories_loaded": len(stories),
        "total_scenarios": len(scenarios),
        "ai_powered": result.get("summary", {}).get("ai_powered", False),
        "data_sources": [f.name for f in jira_dir.iterdir() if f.is_file()] if jira_dir.exists() else [],
    }
    (project_dir / "story_coverage.json").write_text(json.dumps(result, indent=2))
    return result


@app.get("/api/projects/{project_id}/coverage/story-coverage")
def get_story_coverage(project_id: str, user: str = Depends(get_optional_user)):
    p = get_project_dir(user, project_id) / "story_coverage.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="No story coverage scan run yet")
    return json.loads(p.read_text())


# ── AI SCRIPT GENERATION ──────────────────────────────────────────────────────

def _resolve_model(meta: dict):
    """Try the project's configured model; fall back to the other if billing/key fails."""
    preferred = meta.get("model", "claude")
    fallback  = "gemini" if preferred == "claude" else "claude"
    for model_id in [preferred, fallback]:
        try:
            key = get_api_key(model_id)
            return get_model(model_id, key)
        except Exception:
            continue
    return None


@app.post("/api/projects/{project_id}/generate")
def run_generation(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)
    # Type 1 scan writes to code_coverage.json; fall back to legacy analysis_result.json
    rp = project_dir / "code_coverage.json"
    if not rp.exists():
        rp = project_dir / "analysis_result.json"
    if not rp.exists():
        raise HTTPException(status_code=400, detail="Run code scan first (Type 1 → Scan code)")

    analysis = json.loads(rp.read_text())
    model = _resolve_model(meta)
    if model is None:
        raise HTTPException(status_code=400, detail="No AI model available. Check API keys in .env")
    output_dir = OUTPUT_DIR / user / project_id
    output_dir.mkdir(parents=True, exist_ok=True)

    existing_features = _sample_files(project_dir / "features", ".feature", n=3, chars=2500)
    existing_stepdefs = _sample_files(project_dir / "stepdefs", ".py", n=2, chars=3000)
    existing_json = _sample_json(project_dir / "jira")

    generated = []
    all_tcs = []
    generation_scores = {}

    # Build uncovered_flows from either legacy format or AI business_flows format
    uncovered: dict = {}
    if analysis.get("uncovered_flows"):
        uncovered = analysis["uncovered_flows"]
    else:
        # AI-powered result stores business_flows — extract missing + partial
        for flow in analysis.get("business_flows", []):
            if flow.get("coverage") in ("missing", "partial"):
                name = flow.get("name", "Unnamed Flow")
                ops  = flow.get("operations") or flow.get("missing_scenarios") or []
                uncovered[name] = ops if ops else [name]

    for flow_name, tcs in uncovered.items():
        if not tcs:
            tcs = [flow_name]
        safe = re.sub(r'[^a-z0-9]+', '_', flow_name.lower()).strip('_')
        try:
            feat = model.generate_feature_file(flow_name, tcs, existing_features)
            (output_dir / f"{safe}.feature").write_text(feat)
            generated.append(f"{safe}.feature")
            step = model.generate_stepdef_file(flow_name, tcs, existing_stepdefs)
            (output_dir / f"test_{safe}.py").write_text(step)
            generated.append(f"test_{safe}.py")
            all_tcs.extend(tcs)
        except Exception:
            continue  # skip flow if AI call fails; partial results still returned

        if hasattr(model, "score_generation"):
            try:
                score = model.score_generation(flow_name, tcs, feat, step)
                generation_scores[safe] = {"flow": flow_name, **score}
            except Exception:
                pass

    if all_tcs:
        td = model.generate_test_data(all_tcs, existing_json)
        (output_dir / "new_test_data.json").write_text(json.dumps(td, indent=2))
        generated.append("new_test_data.json")

    # Save generation scores
    if generation_scores:
        (output_dir / "generation_accuracy.json").write_text(json.dumps(generation_scores, indent=2))
        generated.append("generation_accuracy.json")

    return {
        "generated_files": generated,
        "model_used": model.model_name(),
        "generation_scores": generation_scores,
    }


@app.post("/api/projects/{project_id}/generate-stories")
def run_generation_from_stories(project_id: str, user: str = Depends(get_optional_user)):
    """Agent 2 — generate feature files + step defs from Type 2 story coverage gaps."""
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)
    sc_path = project_dir / "story_coverage.json"
    if not sc_path.exists():
        raise HTTPException(status_code=400, detail="Run story coverage analysis first (Type 2)")

    story_cov = json.loads(sc_path.read_text())

    # Model selection with automatic fallback: Claude → Gemini
    model = _resolve_model(meta)
    if model is None:
        raise HTTPException(status_code=400, detail="No AI model available. Check API keys in .env")

    output_dir = OUTPUT_DIR / user / project_id
    output_dir.mkdir(parents=True, exist_ok=True)

    existing_features = _sample_files(project_dir / "features", ".feature", n=3, chars=2500)
    existing_stepdefs = _sample_files(project_dir / "stepdefs", ".py", n=2, chars=3000)

    # Group missing + partial stories by component → treat each component as a flow
    gaps: dict = {}
    for item in (story_cov.get("missing", []) + story_cov.get("partial", [])):
        comp = item.get("component") or "Uncovered Stories"
        gaps.setdefault(comp, []).append(
            f"{item.get('key','')} — {item.get('summary','')}"
        )

    if not gaps:
        return {"generated_files": [], "model_used": model.model_name(), "generation_scores": {}, "note": "No missing or partial stories found"}

    generated = []
    all_tcs = []
    generation_scores = {}

    for flow_name, tcs in gaps.items():
        safe = re.sub(r'[^a-z0-9]+', '_', flow_name.lower()).strip('_')
        feat = model.generate_feature_file(flow_name, tcs, existing_features)
        (output_dir / f"{safe}.feature").write_text(feat)
        generated.append(f"{safe}.feature")
        step = model.generate_stepdef_file(flow_name, tcs, existing_stepdefs)
        (output_dir / f"test_{safe}.py").write_text(step)
        generated.append(f"test_{safe}.py")
        all_tcs.extend(tcs)

        if hasattr(model, "score_generation"):
            try:
                score = model.score_generation(flow_name, tcs, feat, step)
                generation_scores[safe] = {"flow": flow_name, **score}
            except Exception:
                pass

    if generation_scores:
        (output_dir / "generation_accuracy.json").write_text(json.dumps(generation_scores, indent=2))
        generated.append("generation_accuracy.json")

    return {
        "generated_files": generated,
        "model_used": model.model_name(),
        "generation_scores": generation_scores,
    }


@app.get("/api/projects/{project_id}/generated-files")
def list_generated(project_id: str, user: str = Depends(get_optional_user)):
    od = OUTPUT_DIR / user / project_id
    return [{"name": f.name, "size": f.stat().st_size} for f in od.iterdir()] if od.exists() else []


@app.get("/api/projects/{project_id}/download/{filename}")
def download_file(project_id: str, filename: str, user: str = Depends(get_optional_user)):
    fp = OUTPUT_DIR / user / project_id / filename
    if not fp.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(fp, filename=filename)


@app.get("/api/projects/{project_id}/download-all")
def download_all(project_id: str, user: str = Depends(get_optional_user)):
    od = OUTPUT_DIR / user / project_id
    if not od.exists():
        raise HTTPException(status_code=404, detail="No generated files")
    # Zip only script files — exclude the reports subfolder
    import zipfile, tempfile
    zp = OUTPUT_DIR / user / f"{project_id}_scripts.zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in od.iterdir():
            if f.is_file():  # only top-level files, skip reports/ subfolder
                zf.write(f, f.name)
    return FileResponse(str(zp), filename=f"generated_scripts_{project_id}.zip")


# ── WORD REPORT ───────────────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/report")
def export_report(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    rp = project_dir / "analysis_result.json"
    if not rp.exists():
        raise HTTPException(status_code=404, detail="Run analysis first")
    reports_dir = OUTPUT_DIR / user / project_id / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    return FileResponse(generate_word_report(json.loads(rp.read_text()), reports_dir), filename="coverage_report.docx")


AGENT1_MAX_ITEMS = 300
AGENT1_RECENT_DAYS = 14


def _agent1_scope(tcs: list) -> list:
    """
    Agent 1 sends every item to the AI model, so a live QMetry project
    (tens of thousands of test cases) must be narrowed to what changed:
      * uploaded CSV/Excel rows — always
      * Jira items flagged new / updated by the last sync
      * QMetry test cases of those stories, or updated in the last 14 days
    Newest first, capped at AGENT1_MAX_ITEMS.
    """
    synced = [t for t in tcs if str(t.get("source", "")).startswith(("jira:", "qmetry:"))]
    if not synced:
        return tcs[:AGENT1_MAX_ITEMS] if len(tcs) > AGENT1_MAX_ITEMS else tcs
    uploaded = [t for t in tcs if not str(t.get("source", "")).startswith(("jira:", "qmetry:"))]
    changed = [t for t in synced if t.get("sync_state") in ("new", "updated") and t["source"].startswith("jira:")]
    changed_keys = {t["key"] for t in changed}
    cutoff = (datetime.now() - timedelta(days=AGENT1_RECENT_DAYS)).isoformat()
    linked = [t for t in synced if t["source"].startswith("qmetry:")
              and (set(t.get("links", [])) & changed_keys or str(t.get("updated", "")) >= cutoff)]
    scoped = uploaded + sorted(changed + linked, key=lambda t: str(t.get("updated", "")), reverse=True)
    if not scoped:  # nothing changed recently: fall back to the newest items
        scoped = sorted(synced, key=lambda t: str(t.get("updated", "")), reverse=True)
    return scoped[:AGENT1_MAX_ITEMS]


# ── INPUT LAYER: JIRA + QMETRY LIVE SYNC ──────────────────────────────────────

def _jira_settings(meta: dict) -> dict:
    j = meta.get("jira", {})
    return {
        "project_key": j.get("project_key") or JIRA_PROJECT_KEY,
        "issue_types": j.get("issue_types") or ["Story", "Test", "Test Case"],
        "jql": j.get("jql", ""),
        "include_defects": j.get("include_defects", True),
        "include_qmetry": j.get("include_qmetry", True),
        "last_sync": j.get("last_sync"),
        "last_run": j.get("last_run") or j.get("last_sync"),
        "last_result": j.get("last_result"),
    }


def _merge_cache(path: Path, fetched: list, full: bool) -> dict:
    """Upsert fetched issues into a JSON cache and tag each new / updated / unchanged."""
    old = {}
    if path.exists():
        try:
            old = {t["key"]: t for t in json.loads(path.read_text()).get("items", [])}
        except Exception:
            old = {}
    merged = {} if full else {k: {**v, "sync_state": "unchanged"} for k, v in old.items()}
    counts = {"new": 0, "updated": 0, "unchanged": 0}
    for t in fetched:
        prev = old.get(t["key"])
        if not prev:
            state = "new"
        elif prev.get("updated") != t.get("updated") or prev.get("summary") != t.get("summary"):
            state = "updated"
        else:
            state = "unchanged"
        counts[state] += 1
        merged[t["key"]] = {**t, "sync_state": state}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"synced_at": utc_now_iso(), "items": list(merged.values())}, indent=1))
    return {**counts, "total": len(merged)}


@app.get("/api/integrations/status")
def integrations_status(check: bool = True):
    out = {
        "jira": {"configured": jira_configured(), "base_url": JIRA_BASE_URL, "project_key": JIRA_PROJECT_KEY, "ok": False},
        "qmetry": {"configured": qmetry_configured(), "base_url": QMETRY_API_BASE, "ok": False},
        "smtp": {"configured": smtp_configured()},
    }
    if check and jira_configured():
        try:
            me = JiraClient(timeout=10).myself()
            out["jira"].update(ok=True, user=me.get("displayName") or me.get("emailAddress"))
        except JiraError as e:
            out["jira"]["error"] = str(e.args[0])
    if check and qmetry_configured():
        try:
            out["qmetry"].update(QMetryClient(timeout=10).probe())
        except QMetryError as e:
            out["qmetry"]["error"] = str(e)
    return out


@app.get("/api/projects/{project_id}/jira/settings")
def get_jira_settings(project_id: str, user: str = Depends(get_optional_user)):
    return _jira_settings(load_meta(get_project_dir(user, project_id)))


@app.post("/api/projects/{project_id}/jira/sync")
def jira_sync(
    project_id: str,
    project_key: str = Form(""),
    issue_types: str = Form("Story,Test,Test Case"),
    jql: str = Form(""),
    full: bool = Form(False),
    include_defects: bool = Form(True),
    include_qmetry: bool = Form(True),
    user: str = Depends(get_optional_user),
):
    """
    Incremental pull: only issues updated since the last sync (minus a 1-day
    safety margin for JQL timezone rounding), merged into the local cache so
    Agent 1 still sees the full set and can flag new / changed requirements.
    """
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)
    settings = _jira_settings(meta)
    project_key = (project_key or settings["project_key"]).strip().upper()
    if not project_key:
        raise HTTPException(status_code=400, detail="Enter a Jira project key (e.g. AMCC).")
    types = [t.strip() for t in issue_types.split(",") if t.strip()]

    if not jira_configured() and not (include_qmetry and qmetry_configured()):
        raise HTTPException(status_code=400, detail="Neither Jira nor QMetry is configured in backend/.env.")

    cache = project_dir / "jira" / "jira_sync.json"
    full = full or not cache.exists() or settings.get("project_key") != project_key
    since = None
    if not full and settings["last_sync"]:
        since = (datetime.fromisoformat(settings["last_sync"]) - timedelta(days=1)).isoformat()

    started = utc_now_iso()
    result = {"project_key": project_key, "mode": "full" if full else "incremental", "since": since, "warnings": []}
    if jira_configured():
        try:
            jira = JiraClient()
            stories = jira.fetch_issues(project_key, types, since=since, extra_jql=jql)
            result["jira"] = _merge_cache(cache, stories, full)
            result["jql"] = build_jql(project_key, types, since, jql)
            if include_defects:
                defects = jira.fetch_issues(project_key, DEFECT_TYPES, since=since)
                result["defects"] = _merge_cache(project_dir / "defects" / "jira_defects.json", defects, full)
        except JiraError as e:
            raise HTTPException(status_code=502, detail=str(e.args[0]))
    else:
        result["warnings"].append("Jira not configured (JIRA_BASE_URL / JIRA_EMAIL) — stories and defects skipped.")

    if include_qmetry and qmetry_configured():
        try:
            qm = QMetryClient(timeout=60)
            jira_project_id = qm.project_id(project_key)
            tcs = qm.fetch_test_cases(jira_project_id)
            result["qmetry"] = _merge_cache(project_dir / "jira" / "qmetry_testcases.json", tcs, True)
            execs = qm.fetch_execution_summary(jira_project_id)
            (project_dir / "qmetry").mkdir(exist_ok=True)
            (project_dir / "qmetry" / "executions.json").write_text(json.dumps(execs, indent=1))
            result["qmetry"]["executions"] = len(execs)
            result["qmetry"]["by_status"] = dict(Counter(v["last_status"] for v in execs.values()))
        except QMetryError as e:
            result["warnings"].append(f"QMetry: {e}")
    elif include_qmetry:
        result["warnings"].append("QMetry API key not set — skipped test cases and execution results.")

    meta["jira"] = {
        "project_key": project_key, "issue_types": types, "jql": jql,
        "include_defects": include_defects, "include_qmetry": include_qmetry,
        "last_sync": started if "jira" in result else settings["last_sync"],  # Jira incremental watermark
        "last_run": started,
        "last_result": {k: v for k, v in result.items() if k in ("jira", "defects", "qmetry", "mode")},
    }
    save_meta(project_dir, meta)
    return result


@app.get("/api/projects/{project_id}/jira/synced")
def jira_synced(project_id: str, state: str = "", limit: int = 300, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    out = {}
    for name, path in (("stories", project_dir / "jira" / "jira_sync.json"),
                       ("test_cases", project_dir / "jira" / "qmetry_testcases.json"),
                       ("defects", project_dir / "defects" / "jira_defects.json")):
        items = json.loads(path.read_text()).get("items", []) if path.exists() else []
        if state:
            items = [i for i in items if i.get("sync_state") == state]
        items.sort(key=lambda i: ({"new": 0, "updated": 1}.get(i.get("sync_state"), 2), i.get("updated", "")), reverse=False)
        out[name] = {"total": len(items), "items": [
            {k: i.get(k) for k in ("key", "summary", "issue_type", "priority", "status", "updated", "sync_state", "url")}
            for i in items[:limit]]}
    return out


# ── INPUT LAYER: CODEBASE ZIPS ───────────────────────────────────────────────

@app.post("/api/projects/{project_id}/codebase")
async def upload_codebase(
    project_id: str,
    file: UploadFile = File(...),
    kind: str = Form("app"),
    user: str = Depends(get_optional_user),
):
    """
    kind=app   — application source from the dev team -> module index (Agents 3 & 4)
    kind=tests — automation repo (.feature / pytest)   -> full-repo scan (Agents 1 & 3)
    """
    if kind not in ("app", "tests"):
        raise HTTPException(status_code=400, detail="kind must be 'app' or 'tests'")
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Upload the codebase as a .zip file")
    project_dir = get_project_dir(user, project_id)
    target = project_dir / ("appcode" if kind == "app" else "repo")
    if target.exists():
        shutil.rmtree(target)
    tmp = project_dir / f"_{kind}_upload.zip"
    with open(tmp, "wb") as out:
        shutil.copyfileobj(file.file, out)
    try:
        extracted = extract_zip(tmp, target)
    except (zipfile.BadZipFile, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Could not extract zip: {e}")
    finally:
        tmp.unlink(missing_ok=True)

    meta = load_meta(project_dir)
    info = {"filename": file.filename, "files": extracted, "uploaded_at": utc_now_iso()}
    if kind == "app":
        index = build_index(target)
        (project_dir / "appcode_index.json").write_text(json.dumps(index, indent=1))
        info.update(modules=len(index["modules"]), loc=index["loc"])
    else:
        info.update(features=sum(1 for _ in target.rglob("*.feature")), pytest_files=sum(1 for _ in target.rglob("test_*.py")))
    if kind == "app" and index.get("openapi"):
        info["openapi_detected"] = True
        info["openapi_endpoints"] = len(index["openapi"]["endpoints"])
        info["openapi_title"] = index["openapi"].get("title", "")
    meta.setdefault("codebase", {})[kind] = info
    save_meta(project_dir, meta)
    return {"kind": kind, **info}


@app.post("/api/projects/{project_id}/codebase/local")
async def index_codebase_local(
    project_id: str,
    request: Request,
    user: str = Depends(get_optional_user),
):
    """
    Index a codebase from a local filesystem path — no upload/zip needed.
    Body: {"path": "C:\\dev\\amcc-source", "kind": "app"|"tests"}
    """
    body = await request.json()
    path_str = (body.get("path") or "").strip()
    kind = body.get("kind", "app")

    if not path_str:
        raise HTTPException(status_code=400, detail="path is required")
    if kind not in ("app", "tests"):
        raise HTTPException(status_code=400, detail="kind must be 'app' or 'tests'")

    local_path = Path(path_str)
    if not local_path.exists():
        raise HTTPException(status_code=400, detail=f"Path not found: {path_str}")
    if not local_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {path_str}")

    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)
    info = {"local_path": str(local_path), "source": "local_path", "indexed_at": utc_now_iso()}

    if kind == "app":
        try:
            index = index_local_path(local_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        (project_dir / "appcode_index.json").write_text(json.dumps(index, indent=1))
        info.update(modules=len(index["modules"]), loc=index["loc"])
        if index.get("openapi"):
            info["openapi_detected"] = True
            info["openapi_endpoints"] = len(index["openapi"]["endpoints"])
            info["openapi_title"] = index["openapi"].get("title", "")
    else:
        # Count automation artefacts and store the path reference
        feat_count = sum(1 for _ in local_path.rglob("*.feature"))
        pytest_count = sum(1 for _ in local_path.rglob("test_*.py"))
        info.update(features=feat_count, pytest_files=pytest_count)
        meta["automation_local_path"] = str(local_path)

    meta.setdefault("codebase", {})[kind] = info
    save_meta(project_dir, meta)
    return {"kind": kind, **info}


@app.get("/api/projects/{project_id}/codebase")
def get_codebase(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    index = load_index(project_dir)
    meta = load_meta(project_dir)
    openapi = index.get("openapi")
    return {
        "uploads": meta.get("codebase", {}),
        "openapi": {"detected": True, "title": openapi.get("title", ""), "endpoints": len(openapi.get("endpoints", []))} if openapi else None,
        "modules": [
            {"name": n, **{k: m[k] for k in ("layer", "files", "loc", "weight")}, "routes": m["routes"][:8], "keywords": m["keywords"][:12]}
            for n, m in index.get("modules", {}).items()
        ],
    }


# ── AGENT 3 — GOLDEN SUITE ENGINE ─────────────────────────────────────────────

def _load_defects(project_dir: Path) -> list:
    defects = load_tc_dir(project_dir / "defects")
    if defects:
        return defects
    # Fallback: defect rows mixed into the Jira CSV exports
    return [t for t in load_tc_dir(project_dir / "jira")
            if re.search(r"\b(bug|defect)\b", f'{t.get("issue_type", "")} {t.get("label", "")} {t.get("source", "")}', re.I)]


@app.post("/api/projects/{project_id}/golden-suite/scan")
def golden_scan(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    ex_path = project_dir / "qmetry" / "executions.json"
    executions = {k.upper(): v for k, v in json.loads(ex_path.read_text()).items()} if ex_path.exists() else {}
    meta = load_meta(project_dir)
    model = None
    try:
        model_id = meta.get("model", "gemini")
        model = get_model(model_id, get_api_key(model_id))
    except Exception:
        pass  # AI enrichment optional — scan still works without it
    auto_local_str = meta.get("automation_local_path")
    auto_local = Path(auto_local_str) if auto_local_str and Path(auto_local_str).exists() else None
    scan = golden_suite.run_scan(
        project_dir, load_tc_dir(project_dir / "jira"), executions,
        _load_defects(project_dir), load_index(project_dir),
        model=model, automation_local_path=auto_local,
    )
    if not scan["total"]:
        raise HTTPException(status_code=400, detail="Nothing to scan. Add feature files, step definitions, a test repo zip or Jira/QMetry test cases first.")
    return {k: v for k, v in scan.items() if k != "items"}


@app.get("/api/projects/{project_id}/golden-suite")
def golden_get(project_id: str, coverage: float = 30, limit: int = 300,
               fit_budget: bool = False, user: str = Depends(get_optional_user)):
    scan = golden_suite.load_scan(get_project_dir(user, project_id))
    if not scan:
        raise HTTPException(status_code=404, detail="Run a golden suite scan first")
    sel = golden_suite.select(scan, coverage, fit_budget=fit_budget)
    return {
        "scan": {k: v for k, v in scan.items() if k not in ("items",)},
        "selection": {**sel, "items": sel["items"][:limit]},
    }


@app.post("/api/projects/{project_id}/golden-suite/smart-tags")
async def golden_smart_tags(project_id: str, request: Request, user: str = Depends(get_optional_user)):
    """
    AI Tag Recommender — analyse Jira stories, fixed defects, and optional release
    context text to recommend the minimal @tag set for this release.
    """
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    release_context = str(body.get("release_context", "")).strip()

    # Load available tags from golden scan
    scan = golden_suite.load_scan(project_dir)
    top_tags: dict = scan.get("top_tags", {})
    if not top_tags:
        raise HTTPException(status_code=400, detail="No automation tags found — run Golden Suite scan first.")

    # Load Jira stories
    jira_dir = project_dir / "jira"
    jira_stories = load_tc_dir(jira_dir) if jira_dir.exists() else []

    # Load defects
    defects_dir = project_dir / "defects"
    defects: list = []
    if defects_dir.exists():
        for f in defects_dir.iterdir():
            if f.suffix.lower() in (".json",):
                try:
                    raw = json.loads(f.read_text())
                    items = raw.get("items", raw) if isinstance(raw, dict) else raw
                    if isinstance(items, list):
                        defects.extend(items)
                except Exception:
                    pass
    # Also check jira defects cache
    jira_defects_path = jira_dir / "jira_defects.json"
    if jira_defects_path.exists():
        try:
            raw = json.loads(jira_defects_path.read_text())
            items = raw.get("items", raw) if isinstance(raw, dict) else raw
            if isinstance(items, list):
                defects.extend(items)
        except Exception:
            pass

    # Build full tag counts + tag→folder map from ALL scan items
    # (top_tags in scan only has top-20; this captures all tags including @orders, @reports)
    tag_module_map: dict = {}
    full_tag_counts: dict = {}
    scan_items = scan.get("items", [])
    for it in scan_items:
        folder = it.get("folder") or it.get("module") or ""
        for tag in it.get("tags", []):
            if tag:
                tag_module_map.setdefault(tag, set()).add(folder)
                full_tag_counts[tag] = full_tag_counts.get(tag, 0) + 1
    tag_module_map = {t: sorted(folders) for t, folders in tag_module_map.items() if folders}
    # Merge: stored top_tags (pre-scored) + any new tags from full count
    merged_top_tags = {**full_tag_counts, **top_tags} if full_tag_counts else top_tags
    # Supplement by_folder with all folders seen in items (scan stores only top 20)
    full_by_folder: dict = {}
    for it in scan_items:
        f = it.get("folder") or it.get("module") or ""
        if f:
            full_by_folder[f] = full_by_folder.get(f, 0) + 1
    by_folder = {**full_by_folder, **scan.get("by_folder", {})} if full_by_folder else scan.get("by_folder", {})

    model = _resolve_model(meta)

    result = golden_suite.recommend_tags(
        top_tags=merged_top_tags,
        jira_stories=jira_stories,
        defects=defects,
        release_context=release_context,
        model=model,
        tag_module_map=tag_module_map,
        by_folder=by_folder,
    )
    return result


@app.get("/api/projects/{project_id}/golden-suite/yaml-preview")
def golden_yaml_preview(project_id: str, coverage: float = 30, fit_budget: bool = False,
                        tags: str = "", user: str = Depends(get_optional_user)):
    """
    Return YAML as plain text for live preview in the UI (no download header).
    Optional `tags` param is a comma-separated list of smart-tag names to inject
    into the YAML as an extra `smart_tags` block.
    """
    project_dir = get_project_dir(user, project_id)
    scan = golden_suite.load_scan(project_dir)
    if not scan:
        raise HTTPException(status_code=404, detail="Run a golden suite scan first")
    sel = golden_suite.select(scan, coverage, fit_budget=fit_budget)
    name = load_meta(project_dir).get("name", "project")
    yaml_text = golden_suite.export_yaml(sel, name)
    # Inject smart tags block when provided
    if tags.strip():
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        marker_expr = " or ".join(f'"{t}"' for t in tag_list)
        inject = (
            f"\n# Smart tags from AI Tag Recommender\n"
            f"smart_tags:\n"
            f"  tags: [{', '.join(tag_list)}]\n"
            f"  pytest_command: \"pytest -m '{marker_expr}'\"\n"
        )
        yaml_text = yaml_text + inject
    return {"yaml": yaml_text, "coverage": coverage, "selected": sel["selected"], "total": sel["total"]}


@app.get("/api/projects/{project_id}/golden-suite/build-lookup")
def golden_build_lookup(project_id: str, version: str = "", user: str = Depends(get_optional_user)):
    """
    Look up which Jira stories/components are tagged with a given build/fix version.
    Returns affected_modules so the frontend can pre-fill the AI Tag Recommender input.
    """
    if not version.strip():
        raise HTTPException(status_code=400, detail="version parameter required")
    project_dir = get_project_dir(user, project_id)
    jira_dir = project_dir / "jira"
    stories = load_tc_dir(jira_dir) if jira_dir.exists() else []

    ver_lower = version.strip().lower().lstrip("v")
    matched_stories = []
    components: Counter = Counter()

    for s in stories:
        # Check fix_versions field
        fix_vers = s.get("fix_versions", []) or []
        story_ver = " ".join(str(v).lower().lstrip("v") for v in fix_vers)
        # Check labels field
        labels = " ".join(str(l).lower() for l in (s.get("labels") or []))
        # Check summary / description for version mention
        summary = (s.get("summary") or "").lower()

        if (ver_lower in story_ver or ver_lower in labels or
                ver_lower in summary or version.lower() in summary):
            matched_stories.append({
                "key": s.get("key", ""),
                "summary": (s.get("summary") or "")[:100],
                "component": s.get("component", ""),
                "status": s.get("status", ""),
            })
            comp = s.get("component", "").strip()
            if comp:
                components[comp] += 1

    # Also try live Jira if configured and cached data found nothing
    if not matched_stories and jira_configured():
        try:
            from connectors.jira_client import JiraClient
            client = JiraClient(JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)
            jql = f'project = {JIRA_PROJECT_KEY} AND fixVersion = "{version}"'
            live = client.fetch_issues(jql, max_results=50)
            for s in live:
                comp = s.get("component", "").strip()
                matched_stories.append({
                    "key": s.get("key", ""),
                    "summary": (s.get("summary") or "")[:100],
                    "component": comp,
                    "status": s.get("status", ""),
                })
                if comp:
                    components[comp] += 1
        except Exception:
            pass

    affected = [comp for comp, _ in components.most_common(10)]
    return {
        "version": version,
        "matched_stories": len(matched_stories),
        "affected_modules": affected,
        "stories": matched_stories[:20],
    }


@app.get("/api/projects/{project_id}/golden-suite/export")
def golden_export(project_id: str, coverage: float = 30, format: str = "yaml", ci: str = "github",
                  fit_budget: bool = False, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    scan = golden_suite.load_scan(project_dir)
    if not scan:
        raise HTTPException(status_code=404, detail="Run a golden suite scan first")
    sel = golden_suite.select(scan, coverage, fit_budget=fit_budget)
    name = load_meta(project_dir).get("name", "project")
    tag = f"{sel['preset']}_{int(sel['coverage'])}pct"
    if format == "yaml":
        return _download(golden_suite.export_yaml(sel, name).encode(), f"golden_suite_{tag}.yaml", "application/x-yaml")
    if format == "json":
        return _download(json.dumps({k: v for k, v in sel.items()}, indent=1).encode(), f"golden_suite_{tag}.json", "application/json")
    if format == "csv":
        return _download(golden_suite.export_table(sel, "csv"), f"golden_suite_{tag}.csv", "text/csv")
    if format == "xlsx":
        return _download(golden_suite.export_table(sel, "xlsx"), f"golden_suite_{tag}.xlsx",
                         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    if format == "ci":
        fname, content = golden_suite.export_ci(sel, ci)
        return _download(content.encode(), fname, "text/plain")
    if format == "features":
        return _download(golden_suite.tagged_features_zip(project_dir, sel), f"golden_tagged_features_{tag}.zip", "application/zip")
    raise HTTPException(status_code=400, detail="format must be yaml, json, csv, xlsx, ci or features")


# ── AGENT 4 — RISK SCANNER ────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/risk/scan")
def risk_scan(project_id: str, use_ai: bool = Form(True), user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    defects = _load_defects(project_dir)
    if not defects:
        raise HTTPException(status_code=400, detail="No defects found. Sync Jira (with defects) or upload a defect CSV on Data sources.")
    model = None
    if use_ai:
        try:
            model_id = load_meta(project_dir).get("model", "claude")
            model = get_model(model_id, get_api_key(model_id))
        except ValueError:
            model = None  # rule-based classification only
    result = risk_scanner.run_scan(project_dir, defects, load_index(project_dir), model)
    return risk_scanner.dashboard(result, risk_scanner.load_approvals(project_dir))


@app.get("/api/projects/{project_id}/risk")
def risk_get(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    result = risk_scanner.load_result(project_dir)
    if not result:
        raise HTTPException(status_code=404, detail="Run the risk scan first")
    return risk_scanner.dashboard(result, risk_scanner.load_approvals(project_dir))


@app.post("/api/projects/{project_id}/risk/approve")
def risk_approve(
    project_id: str,
    team: str = Form(...),
    status: str = Form(...),
    note: str = Form(""),
    approver: str = Form(""),
    user: str = Depends(get_optional_user),
):
    if team not in risk_scanner.TEAMS:
        raise HTTPException(status_code=400, detail=f"Unknown team '{team}'")
    if status not in ("approved", "risk_accepted", "pending"):
        raise HTTPException(status_code=400, detail="status must be approved, risk_accepted or pending")
    if status == "risk_accepted" and not note.strip():
        raise HTTPException(status_code=400, detail="Accepting risk needs a short justification note")
    project_dir = get_project_dir(user, project_id)
    risk_scanner.save_approval(project_dir, team, status, approver or user, note)
    return risk_scanner.dashboard(risk_scanner.load_result(project_dir), risk_scanner.load_approvals(project_dir))


@app.get("/api/projects/{project_id}/risk/recipients")
def risk_recipients(project_id: str, user: str = Depends(get_optional_user)):
    return load_meta(get_project_dir(user, project_id)).get("team_emails", {})


@app.put("/api/projects/{project_id}/risk/recipients")
async def risk_set_recipients(project_id: str, request: Request, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    body = await request.json()
    meta = load_meta(project_dir)
    meta["team_emails"] = {t: str(body.get(t, "")).strip() for t in risk_scanner.TEAMS}
    save_meta(project_dir, meta)
    return meta["team_emails"]


@app.post("/api/projects/{project_id}/risk/notify")
def risk_notify(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    result = risk_scanner.load_result(project_dir)
    if not result:
        raise HTTPException(status_code=404, detail="Run the risk scan first")
    meta = load_meta(project_dir)
    smtp = {"host": SMTP_HOST, "port": SMTP_PORT, "user": SMTP_USER, "password": SMTP_PASSWORD,
            "from": SMTP_FROM, "tls": SMTP_USE_TLS} if smtp_configured() else {}
    outcomes = risk_scanner.send_emails(project_dir, result, meta.get("team_emails", {}),
                                        meta.get("name", "project"), APP_URL, smtp)
    return {"smtp_configured": smtp_configured(), "outcomes": outcomes}


@app.get("/api/projects/{project_id}/risk/export")
def risk_export(project_id: str, format: str = "xlsx", user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    result = risk_scanner.load_result(project_dir)
    if not result:
        raise HTTPException(status_code=404, detail="Run the risk scan first")
    dash = risk_scanner.dashboard(result, risk_scanner.load_approvals(project_dir))
    if format == "json":
        return _download(json.dumps(dash, indent=1).encode(), "defect_triage_report.json", "application/json")
    return _download(risk_scanner.export_xlsx(dash), "defect_triage_report.xlsx",
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ── LIVE JIRA DEFECTS (Agent 4 live feed) ─────────────────────────────────────

@app.get("/api/projects/{project_id}/defects/live")
def defects_live(project_id: str, user: str = Depends(get_optional_user)):
    """Real-time open-defect snapshot from Jira — no local cache."""
    if not jira_configured():
        raise HTTPException(
            status_code=503,
            detail="Jira is not configured. Add JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN to backend/.env.",
        )

    project_key = JIRA_PROJECT_KEY or "AMCC"

    try:
        client = JiraClient()
        defects = client.fetch_issues(
            project_key=project_key,
            issue_types=DEFECT_TYPES,
            extra_jql='statusCategory != "Done"',
            max_results=500,
        )
    except JiraError as e:
        raise HTTPException(status_code=502, detail=str(e))

    def _band(priority: str) -> str:
        p = (priority or "").lower()
        if p in ("highest", "critical"):
            return "Critical"
        if p == "high":
            return "High"
        if p == "medium":
            return "Medium"
        return "Low"

    _band_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    by_priority = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    by_module: dict = {}
    by_assignee: dict = {}
    enriched = []

    for d in defects:
        band = _band(d["priority"])
        by_priority[band] += 1

        module = d["component"] or "Unknown"
        bm = by_module.setdefault(module, {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "total": 0})
        bm[band] += 1
        bm["total"] += 1

        assignee = d["assignee"] or "Unassigned"
        by_assignee[assignee] = by_assignee.get(assignee, 0) + 1

        enriched.append({**d, "band": band})

    enriched.sort(key=lambda x: (_band_order.get(x["band"], 4), x.get("created", "")))
    by_module = dict(sorted(by_module.items(), key=lambda x: x[1]["total"], reverse=True))

    return {
        "fetched_at": utc_now_iso(),
        "total_open": len(enriched),
        "by_priority": by_priority,
        "by_module": by_module,
        "by_assignee": by_assignee,
        "defects": enriched[:20],
        "project_key": project_key,
        "jira_url": JIRA_BASE_URL,
    }


# ── FAILURE ANALYSIS ──────────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/failure-analysis")
async def failure_analysis(
    project_id: str,
    request: Request,
    user: str = Depends(get_optional_user),
):
    """
    Accepts a test execution report (Cucumber JSON / JUnit XML / pasted text)
    and returns AI-powered root cause + fix suggestions per failed scenario.
    """
    project_dir = get_project_dir(user, project_id)
    meta        = load_meta(project_dir)

    # Read automation repo path from meta
    automation_local_path: Path | None = None
    raw_path = meta.get("automation_local_path") or meta.get("automation_path") or ""
    if raw_path:
        p = Path(raw_path)
        if p.exists():
            automation_local_path = p

    # Accept multipart file OR JSON body with { "text": "...", "filename": "..." }
    content  = ""
    filename = ""

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        f = form.get("file")
        if f and hasattr(f, "read"):
            raw_bytes = await f.read()
            content  = raw_bytes.decode("utf-8", errors="replace")
            filename  = getattr(f, "filename", "") or ""
        text_field = form.get("text", "")
        if text_field and not content:
            content  = str(text_field)
    else:
        try:
            body    = await request.json()
            content = body.get("text", "")
            filename = body.get("filename", "")
        except Exception:
            raw = await request.body()
            content = raw.decode("utf-8", errors="replace")

    if not content.strip():
        raise HTTPException(status_code=400, detail="No report content provided.")

    failures, fmt = failure_analyzer.detect_and_parse(content, filename)
    if not failures:
        return {"format": fmt, "total_failures": 0, "results": [], "message": "No failures found in the report."}

    model   = _resolve_model(meta)
    results = failure_analyzer.analyze_failures(failures, automation_local_path, model)

    # Group by root cause for summary
    from collections import Counter
    cause_counts = Counter(r["root_cause"] for r in results)

    return {
        "format":         fmt,
        "total_failures": len(results),
        "automation_path": str(automation_local_path) if automation_local_path else None,
        "cause_summary":  dict(cause_counts.most_common()),
        "results":        results,
    }


# ── PIPELINE OVERVIEW (dashboard) ─────────────────────────────────────────────

def _cache_count(path: Path) -> int:
    """Return the number of items in a jira-style cache JSON file."""
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text())
        items = data.get("items", data) if isinstance(data, dict) else data
        return len(items) if isinstance(items, list) else 0
    except Exception:
        return 0


@app.get("/api/projects/{project_id}/pipeline")
def pipeline_status(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)
    gen = OUTPUT_DIR / user / project_id / "generation_accuracy.json"
    golden = golden_suite.load_scan(project_dir)
    risk = risk_scanner.load_result(project_dir)

    # Agent 1 — Type 1: code coverage (prefer AI result over legacy)
    cc_path = project_dir / "code_coverage.json"
    ar_path = project_dir / "analysis_result.json"
    cc = json.loads(cc_path.read_text()) if cc_path.exists() else {}
    ar = json.loads(ar_path.read_text()) if (not cc and ar_path.exists()) else {}
    t1 = cc or ar
    t1_summary = t1.get("summary", {})

    # Agent 1 — Type 2: story coverage
    sc_path = project_dir / "story_coverage.json"
    sc = json.loads(sc_path.read_text()) if sc_path.exists() else {}
    t2_summary = sc.get("summary", {})
    t2_ai = t2_summary.get("ai_powered") or sc.get("meta", {}).get("ai_powered") or False

    # Live cache counts (accurate even when last_result is stale)
    jira_count    = _cache_count(project_dir / "jira" / "jira_sync.json")
    qmetry_count  = _cache_count(project_dir / "jira" / "qmetry_testcases.json")
    defect_count  = _cache_count(project_dir / "defects" / "jira_defects.json")

    last_result = meta.get("jira", {}).get("last_result") or {}

    agent1_done = bool(t1) or bool(sc)
    return {
        "inputs": {
            "jira_last_sync":   meta.get("jira", {}).get("last_run") or meta.get("jira", {}).get("last_sync"),
            "jira_last_result": {
                **last_result,
                "jira":    {"total": jira_count,   **(last_result.get("jira")   or {})},
                "qmetry":  {"total": qmetry_count,  **(last_result.get("qmetry") or {})},
                "defects": {"total": defect_count,  **(last_result.get("defects") or {})},
            },
            "codebase": meta.get("codebase", {}),
        },
        "agent1": {
            "done": agent1_done,
            # Type 1 — code vs automation
            "type1_done": bool(t1),
            "type1_coverage_pct": t1_summary.get("coverage_pct"),
            "type1_accuracy": round(t1_summary.get("overall_accuracy", 0) * 100, 1) if t1_summary.get("overall_accuracy") else None,
            "type1_flows": t1_summary.get("total_flows"),
            "type1_covered": t1_summary.get("covered"),
            "type1_partial": t1_summary.get("partial"),
            "type1_missing": t1_summary.get("missing"),
            # Type 2 — stories vs automation
            "type2_done": bool(sc),
            "type2_coverage_pct": t2_summary.get("story_coverage_pct"),
            "type2_accuracy": t2_summary.get("accuracy_score"),
            "type2_total": t2_summary.get("total_stories"),
            "type2_covered": t2_summary.get("covered"),
            "type2_partial": t2_summary.get("partial"),
            "type2_missing": t2_summary.get("missing"),
            "type2_ai_powered": t2_ai,
            # legacy fields kept for backward compat
            "coverage_pct": t1_summary.get("coverage_pct") or t2_summary.get("story_coverage_pct"),
            "total": t1_summary.get("total_flows") or t2_summary.get("total_stories"),
        },
        "agent2": {"done": gen.exists(), "flows": len(json.loads(gen.read_text())) if gen.exists() else 0},
        "agent3": {"done": bool(golden), "total": golden.get("total", 0), "by_tier": golden.get("by_tier", {})},
        "agent4": {"done": bool(risk), "open": risk.get("open", 0),
                   "go_live": risk_scanner.dashboard(risk, risk_scanner.load_approvals(project_dir))["go_live"] if risk else None},
    }


# ── DOMAIN EXPERT ─────────────────────────────────────────────────────────────

@app.get("/api/domain-expert/questions")
def domain_expert_questions():
    """Return suggested starter questions and module list."""
    return {
        "suggested":  domain_expert.SUGGESTED_QUESTIONS,
        "modules":    domain_expert.get_all_modules(),
        "domains":    domain_expert.get_all_domains(),
        "kb_size":    len(domain_expert._load()),
    }


@app.post("/api/domain-expert/chat")
async def domain_expert_chat(request: Request, user: str = Depends(get_optional_user)):
    """
    Chat with the Americold domain expert.
    Body: { "question": str, "history": [{role, content}, ...], "project_id": str (optional) }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be JSON.")

    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required.")

    history    = body.get("history", [])
    project_id = body.get("project_id") or ""

    # Resolve model — use project model if project_id supplied, otherwise global default
    model = None
    if project_id:
        try:
            project_dir = get_project_dir(user, project_id)
            meta        = load_meta(project_dir)
            model       = _resolve_model(meta)
        except Exception:
            pass

    if not model:
        model = _resolve_model({"model": "claude"})

    result = domain_expert.chat(question, history, model)
    return result


def _download(content: bytes, filename: str, media_type: str) -> Response:
    return Response(content=content, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"',
                             "Access-Control-Expose-Headers": "Content-Disposition"})


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _sample_files(directory: Path, ext: str, n: int = 3, chars: int = 2500) -> str:
    if not directory.exists():
        return ""
    out = []
    for f in sorted(directory.iterdir())[:n]:
        if f.suffix.lower() == ext or f.name.lower().endswith(ext):
            try:
                out.append(f"# === {f.name} ===\n" + f.read_text(errors="ignore")[:chars])
            except Exception:
                pass
    return "\n\n".join(out)


def _sample_json(directory: Path) -> str:
    if not directory.exists():
        return ""
    for f in directory.iterdir():
        if f.suffix == ".json":
            return f.read_text(errors="ignore")[:1500]
    return ""


if __name__ == "__main__":
    check_keys_on_startup()
    uvicorn.run(app, host=HOST, port=PORT, reload=False)