"""
app_indexer.py — Builds a module index of the application under test.

The development team ships the application source (frontend + backend) as a
zip. We never execute it; we only read it to learn:

  * which functional modules exist (auth, orders, payments, dashboard …)
  * how big / central each one is  -> "Module Index" weight used by Agent 3
                                      (business impact) and Agent 4 (risk)
  * which layer it lives in        -> frontend (UI) vs backend (API/code),
                                      used by Agent 4 to route defects
  * the vocabulary of each module  -> keywords for matching tests and defects

Output: appcode_index.json
  {"root", "files", "loc", "modules": {name: {layer, files, loc, weight,
   keywords, routes, sample_files}}}
"""

import json
import math
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

from agents.common import tokens

try:
    import yaml as _yaml
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False

SOURCE_EXT = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".vue", ".java", ".kt", ".cs", ".go",
    ".rb", ".php", ".scala", ".swift", ".html", ".sql", ".graphql",
}
CONFIG_EXT = {".yml", ".yaml", ".json", ".properties", ".env", ".ini", ".toml", ".xml", ".conf"}
SKIP_DIRS = {
    "node_modules", ".git", "venv", ".venv", "env", "__pycache__", "dist", "build",
    "target", "bin", "obj", ".next", ".nuxt", "coverage", ".idea", ".vscode",
    "vendor", "packages", ".gradle", "out", "assets", "static", "public", "migrations",
}
# Path segments that carry no functional meaning
GENERIC = {
    "src", "main", "java", "app", "apps", "lib", "libs", "com", "org", "net", "io",
    "source", "code", "server", "client", "frontend", "backend", "web", "api", "ui",
    "core", "common", "shared", "modules", "module", "features", "feature", "pages",
    "components", "component", "views", "view", "controllers", "controller", "services",
    "service", "routes", "router", "models", "model", "utils", "util", "helpers",
    "resources", "scripts", "test", "tests", "spec", "internal", "pkg", "cmd", "domain",
    "impl", "repository", "repositories", "dto", "entity", "entities", "store", "redux",
    "hooks", "screens", "containers", "handlers", "schemas", "config", "styles",
}
FRONTEND_HINTS = {"frontend", "client", "ui", "web", "pages", "components", "views", "screens"}
FRONTEND_EXT = {".jsx", ".tsx", ".vue", ".html"}
MAX_EXTRACT_BYTES = 500 * 1024 * 1024

_ROUTE_RE = re.compile(
    r"""(?:@(?:app|router|bp|api)\.(?:get|post|put|patch|delete|route)\(\s*["']([^"']+)|"""
    r"""@(?:Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*)?["']([^"']+)|"""
    r"""(?:router|app)\.(?:get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)|"""
    r"""path:\s*["'`](/[^"'`]*))"""
)


def extract_zip(zip_path: Path, dest: Path) -> int:
    """Safe extraction: blocks path traversal and skips dependency folders."""
    dest.mkdir(parents=True, exist_ok=True)
    root = dest.resolve()
    total, count = 0, 0
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            parts = Path(info.filename).parts
            if any(p in SKIP_DIRS for p in parts):
                continue
            target = (dest / info.filename).resolve()
            if not str(target).startswith(str(root)):
                continue
            total += info.file_size
            if total > MAX_EXTRACT_BYTES:
                raise ValueError("Codebase is larger than 500 MB after extraction.")
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out:
                out.write(src.read())
            count += 1
    return count


def build_index(code_dir: Path) -> dict:
    code_dir = Path(code_dir)
    # If the zip wrapped everything in a single top folder, start below it
    root = code_dir
    while True:
        kids = [k for k in root.iterdir() if not k.name.startswith(".")] if root.exists() else []
        if len(kids) == 1 and kids[0].is_dir():
            root = kids[0]
        else:
            break

    mods = defaultdict(lambda: {"files": 0, "loc": 0, "kw": Counter(), "routes": set(),
                                "fe": 0, "be": 0, "cfg": 0, "samples": []})
    total_files = total_loc = 0

    for f in root.rglob("*"):
        if not f.is_file() or any(p in SKIP_DIRS for p in f.relative_to(root).parts):
            continue
        ext = f.suffix.lower()
        if ext not in SOURCE_EXT and ext not in CONFIG_EXT:
            continue
        rel = f.relative_to(root)
        module = _module_name(rel)
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if len(text) > 400_000:  # minified bundles, data dumps
            continue
        loc = text.count("\n") + 1
        m = mods[module]
        m["files"] += 1
        if ext in CONFIG_EXT:
            m["cfg"] += 1
        else:
            m["loc"] += loc
            total_loc += loc
        total_files += 1
        parts_lower = {p.lower() for p in rel.parts}
        if ext in FRONTEND_EXT or parts_lower & FRONTEND_HINTS:
            m["fe"] += 1
        else:
            m["be"] += 1
        m["kw"].update(tokens(" ".join(rel.with_suffix("").parts)))
        m["kw"].update(_code_identifiers(text))
        for groups in _ROUTE_RE.findall(text):
            r = next((g for g in groups if g), "")
            if r and len(m["routes"]) < 40:
                m["routes"].add(r)
        if len(m["samples"]) < 5:
            m["samples"].append(str(rel).replace("\\", "/"))

    max_loc = max((m["loc"] for m in mods.values()), default=1) or 1
    # Words used by most modules (get, handle, render …) do not identify a module
    doc_freq = Counter(w for m in mods.values() for w in m["kw"])
    common = {w for w, n in doc_freq.items() if len(mods) >= 4 and n > len(mods) * 0.5}
    modules = {}
    for name, m in mods.items():
        # Weight: size (log-scaled) + API surface, 0.2..1.0
        size = math.log1p(m["loc"]) / math.log1p(max_loc)
        surface = min(1.0, len(m["routes"]) / 10)
        weight = round(0.2 + 0.8 * (0.75 * size + 0.25 * surface), 3)
        layer = "config" if m["cfg"] == m["files"] else ("frontend" if m["fe"] > m["be"] else "backend")
        modules[name] = {
            "layer": layer,
            "files": m["files"],
            "loc": m["loc"],
            "weight": weight,
            "keywords": [w for w, _ in m["kw"].most_common(160) if w not in common][:120],
            "routes": sorted(m["routes"]),
            "sample_files": m["samples"],
        }

    # OpenAPI/Swagger spec — language-agnostic API description
    openapi_spec = find_openapi_spec(root)
    openapi_endpoints = extract_openapi_endpoints(openapi_spec) if openapi_spec else []

    result: dict = {
        "root": root.name,
        "files": total_files,
        "loc": total_loc,
        "modules": dict(sorted(modules.items(), key=lambda kv: -kv[1]["weight"])),
    }
    if openapi_endpoints:
        result["openapi"] = {
            "detected": True,
            "title": (openapi_spec or {}).get("info", {}).get("title", ""),
            "version": (openapi_spec or {}).get("info", {}).get("version", ""),
            "endpoints": openapi_endpoints,
        }
    return result


def index_local_path(local_path: Path) -> dict:
    """Build module index from a local directory without zip extraction."""
    p = Path(local_path)
    if not p.exists() or not p.is_dir():
        raise ValueError(f"Not a valid directory: {local_path}")
    return build_index(p)


def load_index(project_dir: Path) -> dict:
    p = Path(project_dir) / "appcode_index.json"
    return json.loads(p.read_text()) if p.exists() else {}


# ── OpenAPI / Swagger detection ───────────────────────────────────────────────

_OPENAPI_CANDIDATES = [
    "swagger.json", "openapi.json", "openapi.yaml", "openapi.yml",
    "swagger.yaml", "swagger.yml", "api-docs.json", "api-spec.json",
    "docs/swagger.json", "docs/openapi.json", "docs/api.json",
    "src/docs/swagger.json", "src/main/resources/swagger.json",
    "src/main/resources/static/swagger.json",
]
_HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def _load_spec_file(p: Path) -> Optional[dict]:
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
        if p.suffix in (".yaml", ".yml"):
            if _HAS_YAML:
                data = _yaml.safe_load(text)
            else:
                return None  # yaml not installed
        else:
            data = json.loads(text)
        if isinstance(data, dict) and "paths" in data:
            return data
    except Exception:
        pass
    return None


def find_openapi_spec(root: Path) -> Optional[dict]:
    """Find and parse OpenAPI/Swagger spec starting from the codebase root."""
    for rel in _OPENAPI_CANDIDATES:
        p = root / rel
        if p.exists():
            spec = _load_spec_file(p)
            if spec:
                return spec
    # Wider search: any *.json with a "paths" key, up to 3 levels deep
    for p in root.glob("**/*.json"):
        parts = p.relative_to(root).parts
        if len(parts) > 4:
            continue
        if any(skip in parts for skip in SKIP_DIRS):
            continue
        if "swagger" in p.name.lower() or "openapi" in p.name.lower() or "api-doc" in p.name.lower():
            spec = _load_spec_file(p)
            if spec:
                return spec
    return None


def extract_openapi_endpoints(spec: dict) -> list:
    """Return a flat list of endpoints from an OpenAPI 2.x or 3.x spec."""
    if not spec or "paths" not in spec:
        return []
    endpoints = []
    for path, methods in (spec.get("paths") or {}).items():
        if not isinstance(methods, dict):
            continue
        for method, op in methods.items():
            if method.lower() not in _HTTP_METHODS or not isinstance(op, dict):
                continue
            summary = (op.get("summary") or op.get("description") or "").strip()[:200]
            endpoints.append({
                "path": path,
                "method": method.upper(),
                "summary": summary,
                "tags": op.get("tags") or [],
                "operationId": op.get("operationId") or "",
            })
    return endpoints


def _module_name(rel: Path) -> str:
    parts = list(rel.parent.parts)
    meaningful = [p for p in parts if p.lower() not in GENERIC and not p.startswith(".")]
    if meaningful:
        return meaningful[0].lower()
    stem = re.sub(r"(controller|service|routes?|page|view|screen|component|api|model|test|spec)$", "",
                  rel.stem.lower().replace("-", "").replace("_", ""))
    return stem or (parts[0].lower() if parts else "root")


_IDENT_RE = re.compile(r"\b(?:def|function|class|const|interface|public\s+\w+|async\s+def)\s+([A-Za-z_][A-Za-z0-9_]{3,})")


def _code_identifiers(text: str) -> Counter:
    c = Counter()
    for ident in _IDENT_RE.findall(text[:200_000]):
        c.update(tokens(ident))
    return c
