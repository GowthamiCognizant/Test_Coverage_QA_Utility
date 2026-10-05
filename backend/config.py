"""
config.py — Single source of truth for all environment-based configuration.

How it works:
  1. Loads .env from the backend/ folder automatically (via python-dotenv)
  2. Every other module imports from here — nobody calls os.environ directly

Usage:
    from config import CLAUDE_API_KEY, GEMINI_API_KEY, JWT_SECRET

To add a new key:
  1. Add it to .env.example with a comment
  2. Add it to .env with your real value
  3. Add it here with os.getenv()
"""

import os
import re
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the same folder as this file
_env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=_env_path)

# ── AI Model API Keys ─────────────────────────────────────────────────────────
CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# ── Auth ──────────────────────────────────────────────────────────────────────
JWT_SECRET: str = os.getenv("JWT_SECRET", "qa-utility-default-secret-change-in-production")

# ── Server ────────────────────────────────────────────────────────────────────
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8080"))

# ── Jira Cloud (Agent 1 input layer) ──────────────────────────────────────────
# Cloud uses Basic auth: email + API token from
# https://id.atlassian.com/manage-profile/security/api-tokens
JIRA_BASE_URL: str = os.getenv("JIRA_BASE_URL", "").rstrip("/")
JIRA_EMAIL: str = os.getenv("JIRA_EMAIL", "")
# Alias: the team .env names this atlassian_Jira_API_Token
JIRA_API_TOKEN: str = os.getenv("JIRA_API_TOKEN") or os.getenv("atlassian_Jira_API_Token", "")
_raw_project_key: str = os.getenv("JIRA_PROJECT_KEY", "")
# Handle "Project Name (KEY)" display format → extract just the key
_key_match = re.search(r'\(([A-Z][A-Z0-9_-]+)\)\s*$', _raw_project_key)
JIRA_PROJECT_KEY: str = _key_match.group(1) if _key_match else _raw_project_key

# ── QMetry Test Management for Jira Cloud (QTM4J) ────────────────────────────
# QTM4J Cloud exposes its Open API on a separate host, authenticated with the
# "apiKey" header (Jira > Apps > QMetry > Configuration > Open API).
# Alias: the team .env names this qmetry_API_Key
QMETRY_API_KEY: str = os.getenv("QMETRY_API_KEY") or os.getenv("qmetry_API_Key", "")
QMETRY_API_BASE: str = os.getenv("QMETRY_API_BASE", "https://qtmcloud.qmetry.com/rest/api/latest").rstrip("/")
QMETRY_TEST_ISSUE_TYPES: str = os.getenv("QMETRY_TEST_ISSUE_TYPES", "Test,Test Case")

# Optional Jira custom field that holds acceptance criteria, e.g. customfield_10035
JIRA_ACCEPTANCE_FIELD: str = os.getenv("JIRA_ACCEPTANCE_FIELD", "")
# Set to "false" behind a corporate proxy that re-signs TLS certificates
HTTP_VERIFY_SSL: bool = os.getenv("HTTP_VERIFY_SSL", "true").lower() != "false"

# ── SMTP (Agent 4 auto-email to teams) ────────────────────────────────────────
SMTP_HOST: str = os.getenv("SMTP_HOST", "")
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER: str = os.getenv("SMTP_USER", "")
SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM: str = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

# Link placed in Agent 4 emails so teams can record their Go-Live approval
APP_URL: str = os.getenv("APP_URL", "http://localhost:3000")


def jira_configured() -> bool:
    return bool(JIRA_BASE_URL and JIRA_EMAIL and JIRA_API_TOKEN)


def qmetry_configured() -> bool:
    return bool(QMETRY_API_KEY and QMETRY_API_BASE)


def smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM)


def get_api_key(model_id: str) -> str:
    """
    Returns the API key for the given model ID.
    Always reads from environment — never from project meta files.
    Raises ValueError if the key is missing or still the placeholder value.
    """
    key_map = {
        "claude": CLAUDE_API_KEY,
        "gemini": GEMINI_API_KEY,
    }
    key = key_map.get(model_id.lower(), "")

    if not key or "your-key-here" in key:
        raise ValueError(
            f"API key for '{model_id}' is not set. "
            f"Open backend/.env and set {'CLAUDE_API_KEY' if model_id == 'claude' else 'GEMINI_API_KEY'}."
        )
    return key


def check_keys_on_startup():
    """
    Prints a clear startup message showing which keys are loaded.
    Call this from main.py so the team knows the app is configured correctly.
    """
    print("\n── QA Coverage Utility startup ───────────────────────────")
    _check("CLAUDE_API_KEY", CLAUDE_API_KEY)
    _check("GEMINI_API_KEY", GEMINI_API_KEY)
    print(f"  JWT_SECRET      : {'custom' if JWT_SECRET != 'qa-utility-default-secret-change-in-production' else 'using default (change in production)'}")
    print(f"  JIRA            : {JIRA_BASE_URL + '  ✓' if jira_configured() else 'NOT SET — Excel/CSV upload only'}")
    print(f"  QMETRY          : {'configured  ✓' if qmetry_configured() else 'NOT SET — no live execution status'}")
    print(f"  SMTP            : {SMTP_HOST + '  ✓' if smtp_configured() else 'NOT SET — Agent 4 email disabled'}")
    print("──────────────────────────────────────────────────────────\n")


def _check(name: str, value: str):
    if not value or "your-key-here" in value:
        print(f"  {name:20s}: NOT SET — set it in backend/.env")
    else:
        masked = value[:8] + "..." + value[-4:]
        print(f"  {name:20s}: {masked}  ✓")
