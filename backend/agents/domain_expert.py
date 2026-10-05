"""
Domain Expert — RAG-based Americold Cold Chain knowledge chatbot.

Architecture:
  1. BM25 retriever over a curated JSON knowledge base (no GPU, pure Python).
  2. Retrieved chunks are injected into the AI model's context.
  3. The model answers grounded in domain knowledge, not hallucination.
"""

from __future__ import annotations
import json
import math
import re
from pathlib import Path
from typing import Optional

KNOWLEDGE_BASE_PATH = Path(__file__).parent.parent / "data" / "domain_knowledge.json"

# ── Knowledge base + BM25 index (loaded once, module-level) ──────────────────
_kb: list[dict] | None = None
_inv_index: dict[str, list[tuple[int, int]]] = {}   # token → [(chunk_idx, tf)]
_avg_dl: float = 1.0


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b[a-zA-Z0-9][a-z0-9]{1,}\b", text.lower())


def _load() -> list[dict]:
    global _kb, _inv_index, _avg_dl
    if _kb is not None:
        return _kb

    if not KNOWLEDGE_BASE_PATH.exists():
        _kb = []
        return _kb

    _kb = json.loads(KNOWLEDGE_BASE_PATH.read_text(encoding="utf-8"))
    _inv_index = {}
    total_len = 0

    for idx, chunk in enumerate(_kb):
        text   = " ".join([
            chunk.get("title", ""),
            chunk.get("content", ""),
            " ".join(chunk.get("keywords", [])),
        ])
        tokens = _tokenize(text)
        total_len += len(tokens)
        tc: dict[str, int] = {}
        for t in tokens:
            tc[t] = tc.get(t, 0) + 1
        chunk["_tc"]  = tc
        chunk["_len"] = len(tokens)

        for t, c in tc.items():
            _inv_index.setdefault(t, []).append((idx, c))

    _avg_dl = total_len / max(len(_kb), 1)
    return _kb


def _bm25(q_tokens: list[str], chunk: dict, N: int, k1: float = 1.5, b: float = 0.75) -> float:
    dl = chunk.get("_len", 1)
    tc = chunk.get("_tc", {})
    score = 0.0
    for t in q_tokens:
        if t not in tc:
            continue
        df  = len(_inv_index.get(t, []))
        idf = math.log((N - df + 0.5) / (df + 0.5) + 1)
        tf  = tc[t]
        tf_n = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / _avg_dl))
        score += idf * tf_n
    return score


def retrieve(query: str, top_k: int = 6) -> list[dict]:
    """Return the top-k most relevant knowledge chunks for a query."""
    kb = _load()
    if not kb:
        return []

    tokens = _tokenize(query)
    if not tokens:
        return kb[:top_k]

    N      = len(kb)
    scored = [(c, _bm25(tokens, c, N)) for c in kb]
    scored.sort(key=lambda x: -x[1])

    results = [c for c, s in scored if s > 0][:top_k]
    return results or [c for c, _ in scored[:top_k]]


def get_all_modules() -> list[str]:
    kb = _load()
    seen: set = set()
    return [
        c["module"] for c in kb
        if c.get("module") and c["module"] not in seen and not seen.add(c["module"])
    ]


def get_all_domains() -> list[str]:
    kb = _load()
    seen: set = set()
    return [
        c["domain"] for c in kb
        if c.get("domain") and c["domain"] not in seen and not seen.add(c["domain"])
    ]


# ── Chat ──────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the Americold Cold Compass (AMCC) Domain Expert — a specialist assistant built into the QA utility.

Your knowledge covers:
• Americold temperature-controlled warehousing and logistics operations
• Americold Cold Compass (AMCC) portal and all its modules: Admin, Orders, Inbound/Receipts, Outbound, Inventory, Claims, Reports, Audit Trail, CMO, Action Plans, Holds, Rules Engine, CI Events, Configurations
• Cold chain fundamentals: temperature zones, FEFO/FIFO, cold chain integrity
• Food safety compliance: FDA FSMA, HACCP, SQF, 21 CFR Part 11
• QA/automation testing of the AMCC portal: BDD scenarios, Behave framework, regression tags

STRICT RULES:
1. Answer based primarily on the DOMAIN KNOWLEDGE provided in context.
2. If the answer is clearly in the context, be precise and complete.
3. If not in the context, say: "My knowledge base doesn't have specifics on this, but based on general cold chain / WMS knowledge: ..." and give a useful answer.
4. For business flow questions → give numbered step-by-step process.
5. For module questions → describe the module's purpose, key features, and how it connects to other modules.
6. For QA/testing questions → mention relevant test scenarios, edge cases, and automation tags.
7. Keep answers focused. Use bullet points for lists. Be direct — no waffle.
8. Do NOT say "based on the context provided" — just answer naturally as the domain expert.
"""


def chat(
    question: str,
    history: list[dict],
    model,
) -> dict:
    """
    Main entry point. Retrieve relevant chunks → build prompt → call AI.
    Returns {"answer": str, "sources": [...], "retrieved_chunks": int}.
    """
    chunks = retrieve(question, top_k=6)

    if not model:
        return {
            "answer":           "No AI model configured. Please set Claude or Gemini credentials in backend/.env.",
            "sources":          [],
            "retrieved_chunks": 0,
        }

    # Context block from retrieved chunks
    ctx_parts: list[str] = []
    for c in chunks:
        header = f"[{c.get('domain','').upper()} · {c.get('module','').upper()}] {c['title']}"
        ctx_parts.append(f"--- {header} ---\n{c['content']}")
    context = "\n\n".join(ctx_parts)

    # Conversation history (last 6 turns)
    history_lines: list[str] = []
    for turn in (history or [])[-6:]:
        role = "User" if turn.get("role") == "user" else "Assistant"
        history_lines.append(f"{role}: {turn.get('content', '')[:400]}")
    history_text = "\n".join(history_lines)

    prompt = f"""{SYSTEM_PROMPT}

=== DOMAIN KNOWLEDGE ===
{context}

=== CONVERSATION HISTORY ===
{history_text or "(this is the first message)"}

=== QUESTION ===
{question}

Answer:"""

    try:
        answer = model.chat(prompt)
    except Exception as exc:
        answer = f"Error generating response: {exc}"

    sources = [
        {
            "title":  c.get("title", ""),
            "module": c.get("module", ""),
            "domain": c.get("domain", ""),
        }
        for c in chunks
    ]

    return {
        "answer":           answer.strip(),
        "sources":          sources,
        "retrieved_chunks": len(chunks),
    }


# ── Suggested starter questions ───────────────────────────────────────────────

SUGGESTED_QUESTIONS: list[dict] = [
    {"category": "Business flows",  "q": "What is the inbound receipts process at Americold, step by step?"},
    {"category": "Business flows",  "q": "How does the outbound order fulfillment process work?"},
    {"category": "Business flows",  "q": "What is FEFO and how does Americold apply it?"},
    {"category": "Business flows",  "q": "How does the claims process work for a temperature deviation?"},
    {"category": "Business flows",  "q": "What is CMO (Contract Manufacturing Operations) at Americold?"},
    {"category": "Modules",         "q": "What modules are covered under the Admin section of AMCC?"},
    {"category": "Modules",         "q": "What does the Rules Engine do in AMCC?"},
    {"category": "Modules",         "q": "How does the Holds Management module work?"},
    {"category": "Modules",         "q": "What is the CI Events module and what does it integrate with?"},
    {"category": "Modules",         "q": "What is the Message Centre used for in AMCC?"},
    {"category": "QA & Testing",    "q": "What are the key regression test scenarios for the Claims module?"},
    {"category": "QA & Testing",    "q": "Which automation tag covers all admin module tests?"},
    {"category": "QA & Testing",    "q": "What is the difference between sanity tests and full regression?"},
    {"category": "QA & Testing",    "q": "What does the @ci-event-regression-1 tag cover?"},
    {"category": "Cold Chain",      "q": "What are the temperature zones at Americold and what products go in each?"},
    {"category": "Cold Chain",      "q": "What happens when a cold chain break occurs?"},
    {"category": "Compliance",      "q": "What food safety regulations does Americold comply with?"},
    {"category": "Compliance",      "q": "How does AMCC support FDA 21 CFR Part 11 compliance?"},
]
