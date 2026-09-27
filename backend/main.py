from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn, json, uuid, shutil, re
from typing import List, Optional
from pathlib import Path

from config import HOST, PORT, get_api_key, check_keys_on_startup
from auth import create_token, verify_token, hash_password, verify_password, users_db
from file_parser import parse_excel_csv, parse_feature_file
from report_generator import generate_word_report
from models import get_model, list_models

app = FastAPI(title="Test Coverage Utility", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
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
    for folder in ["jira", "features", "stepdefs"]:
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
    return [
        {"id": d.name, **{k: v for k, v in load_meta(d).items() if k != "password"}}
        for d in user_dir.iterdir() if d.is_dir()
    ]


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
    for t in ["jira", "features", "stepdefs"]:
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
        raise HTTPException(status_code=400, detail="No Jira files uploaded. Go to Upload files first.")
    if not feat_dir.exists() or not any(feat_dir.iterdir()):
        raise HTTPException(status_code=400, detail="No feature files uploaded. Go to Feature files first.")

    model_id = meta.get("model", "claude")
    try:
        api_key = get_api_key(model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    jira_tcs = []
    for f in sorted(jira_dir.iterdir()):
        jira_tcs.extend(parse_excel_csv(str(f)))

    feature_scenarios = []
    for f in sorted(feat_dir.iterdir()):
        feature_scenarios.extend(parse_feature_file(str(f)))

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

    result = model.analyze_coverage(
        jira_tcs,
        feature_scenarios,
        previous_analysis=previous_analysis,
        previous_jira_tcs=previous_jira_tcs,
        env_configs=env_configs if env_configs else None,
    )

    result["meta"] = {
        "jira_files": len(list(jira_dir.iterdir())),
        "feature_files": len(list(feat_dir.iterdir())),
        "total_jira_tcs": len(jira_tcs),
        "total_scenarios": len(feature_scenarios),
        "model_used": model.model_name(),
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


# ── AI SCRIPT GENERATION ──────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/generate")
def run_generation(project_id: str, user: str = Depends(get_optional_user)):
    project_dir = get_project_dir(user, project_id)
    meta = load_meta(project_dir)
    rp = project_dir / "analysis_result.json"
    if not rp.exists():
        raise HTTPException(status_code=400, detail="Run analysis first")

    analysis = json.loads(rp.read_text())
    model_id = meta.get("model", "claude")
    try:
        api_key = get_api_key(model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    model = get_model(model_id, api_key)
    output_dir = OUTPUT_DIR / user / project_id
    output_dir.mkdir(parents=True, exist_ok=True)

    existing_features = _sample_files(project_dir / "features", ".feature", n=3, chars=2500)
    existing_stepdefs = _sample_files(project_dir / "stepdefs", ".py", n=2, chars=3000)
    existing_json = _sample_json(project_dir / "jira")

    generated = []
    all_tcs = []
    generation_scores = {}

    for flow_name, tcs in analysis.get("uncovered_flows", {}).items():
        if not tcs:
            continue
        safe = re.sub(r'[^a-z0-9]+', '_', flow_name.lower()).strip('_')
        feat = model.generate_feature_file(flow_name, tcs, existing_features)
        (output_dir / f"{safe}.feature").write_text(feat)
        generated.append(f"{safe}.feature")
        step = model.generate_stepdef_file(flow_name, tcs, existing_stepdefs)
        (output_dir / f"test_{safe}.py").write_text(step)
        generated.append(f"test_{safe}.py")
        all_tcs.extend(tcs)

        # Score generation accuracy for this flow
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
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)