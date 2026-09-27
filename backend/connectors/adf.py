"""
adf.py — Atlassian Document Format flattener.

Jira Cloud REST v3 returns rich text fields (description, comments,
acceptance criteria) as nested ADF JSON, not as a string:

    {"type": "doc", "version": 1, "content": [
        {"type": "paragraph", "content": [
            {"type": "text", "text": "User logs in"}]}]}

Feeding that raw into an LLM prompt wastes tokens on structural noise and
confuses the model. adf_to_text() walks the tree and returns readable
plain text with list bullets and table rows preserved.

Jira Data Center / Server (REST v2) returns wiki markup strings instead,
so adf_to_text() passes strings straight through.
"""

from typing import Any

# Nodes that should start a new line in the output
_BLOCK_TYPES = {
    "paragraph", "heading", "blockquote", "codeBlock", "panel",
    "rule", "listItem", "tableRow", "mediaSingle",
}


def adf_to_text(node: Any, _depth: int = 0) -> str:
    """
    Flatten an ADF document (or any sub-node) into plain text.

    Accepts anything Jira might hand back:
      - None            -> ""
      - str             -> returned as-is (REST v2 wiki markup)
      - dict / list     -> walked recursively
    """
    if node is None:
        return ""
    if isinstance(node, str):
        return node.strip()
    if isinstance(node, (int, float, bool)):
        return str(node)
    if isinstance(node, list):
        return "\n".join(p for p in (adf_to_text(n, _depth) for n in node) if p)
    if not isinstance(node, dict):
        return ""

    ntype = node.get("type", "")

    # Leaf: plain text run
    if ntype == "text":
        return node.get("text", "")

    # Leaf: @mention / emoji / date / status lozenge
    if ntype in ("mention", "emoji", "status"):
        attrs = node.get("attrs", {})
        return str(attrs.get("text") or attrs.get("shortName") or attrs.get("displayName") or "")
    if ntype == "date":
        return str(node.get("attrs", {}).get("timestamp", ""))
    if ntype == "inlineCard":
        return str(node.get("attrs", {}).get("url", ""))
    if ntype == "hardBreak":
        return "\n"
    if ntype == "rule":
        return "---"

    children = node.get("content", [])

    # Bullet and ordered lists: render each item on its own bulleted line
    if ntype in ("bulletList", "orderedList"):
        lines = []
        for i, item in enumerate(children, start=1):
            body = adf_to_text(item, _depth + 1).strip()
            if not body:
                continue
            marker = f"{i}." if ntype == "orderedList" else "-"
            indent = "  " * _depth
            lines.append(f"{indent}{marker} {body}")
        return "\n".join(lines)

    # Tables: pipe-separated rows so column relationships survive
    if ntype == "table":
        return "\n".join(
            r for r in (adf_to_text(row, _depth) for row in children) if r
        )
    if ntype == "tableRow":
        cells = [adf_to_text(c, _depth).strip().replace("\n", " ") for c in children]
        return " | ".join(c for c in cells if c)

    inner = adf_to_text(children, _depth)

    if ntype == "codeBlock":
        return inner
    if ntype in _BLOCK_TYPES or ntype == "doc":
        return inner

    return inner


def flatten_fields(fields: dict, keys: list) -> str:
    """
    Flatten several ADF fields into one text block, skipping empties.
    Used to fold description + acceptance criteria into the TC summary
    context that Agent 1 reasons over.
    """
    parts = []
    for k in keys:
        text = adf_to_text(fields.get(k)).strip()
        if text:
            parts.append(text)
    return "\n\n".join(parts)
