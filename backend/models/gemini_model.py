import json
import re
import google.generativeai as genai
from models.base_model import BaseAIModel

GEMINI_MODEL = "gemini-3.8-flash"


class GeminiModel(BaseAIModel):
    """
    Google Gemini AI model using google-generativeai SDK.
    Implements the same 4-step agentic analysis as ClaudeModel.
    """

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.client = genai.GenerativeModel(GEMINI_MODEL)

    def model_name(self) -> str:
        return "Gemini 3.8 Flash (Google)"

    # ── STEP 1+2+3+4: Full coverage gap analysis ──────────────────────────────

    def analyze_coverage(
        self,
        jira_tcs: list,
        feature_scenarios: list,
        previous_analysis=None,
        previous_jira_tcs=None,
        env_configs=None,
    ) -> dict:

        # Agent Step 1: Group Jira TCs into flows
        step1_prompt = f"""You are a senior QA automation engineer.

Analyse these {len(jira_tcs)} Jira test cases and group them into functional flows.

Return ONLY a valid JSON object:
{{
  "flows": {{
    "Flow Name": ["TC-001", "TC-002"]
  }}
}}

Jira TCs:
{json.dumps([{"key": t["key"], "summary": t["summary"]} for t in jira_tcs], indent=2)}
"""
        step1_result = self._call(step1_prompt)
        jira_flows = self._parse_json(step1_result).get("flows", {})

        # Agent Step 2: Map scenarios to flows
        step2_prompt = f"""You are a senior QA automation engineer.

Given these Jira flows:
{json.dumps(jira_flows, indent=2)}

And these existing automated scenarios:
{json.dumps([{"title": s["title"], "file": s["file"], "tc_ids": s.get("tc_ids", [])} for s in feature_scenarios], indent=2)}

Map each TC key to the feature file that covers it.

Return ONLY valid JSON:
{{
  "coverage_map": {{
    "TC-001": "featureFile.feature",
    "TC-002": null
  }}
}}
"""
        step2_result = self._call(step2_prompt)
        coverage_map = self._parse_json(step2_result).get("coverage_map", {})

        covered = []
        uncovered = []
        for tc in jira_tcs:
            key = tc["key"]
            covered_by = coverage_map.get(key)
            if covered_by:
                tc_copy = dict(tc)
                tc_copy["covered_by"] = covered_by
                covered.append(tc_copy)
            else:
                uncovered.append(tc)

        # Agent Step 4: Group uncovered into flow groups
        uncovered_flows = {}
        if uncovered:
            step4_prompt = f"""Group these uncovered Jira TCs into functional BDD flow groups.

{json.dumps([{"key": t["key"], "summary": t["summary"]} for t in uncovered], indent=2)}

Return ONLY valid JSON:
{{
  "uncovered_flows": {{
    "Flow Group Name": [
      {{"key": "TC-001", "summary": "..."}}
    ]
  }}
}}
"""
            step4_result = self._call(step4_prompt)
            uncovered_flows = self._parse_json(step4_result).get("uncovered_flows", {})

        feature_summary = {}
        for s in feature_scenarios:
            feature_summary.setdefault(s["file"], []).append(s["title"])

        total = len(jira_tcs)
        covered_count = len(covered)
        return {
            "summary": {
                "total": total,
                "covered": covered_count,
                "uncovered": len(uncovered),
                "coverage_pct": round(covered_count / total * 100, 1) if total else 0,
                "model_used": self.model_name(),
            },
            "covered_tcs": covered,
            "uncovered_tcs": uncovered,
            "uncovered_flows": uncovered_flows,
            "feature_summary": feature_summary,
        }

    # ── Feature file generation ───────────────────────────────────────────────

    def generate_feature_file(self, flow_name: str, tcs: list, existing_patterns: str = "") -> str:
        style_hint = f"\nFollow this style from the team's existing feature files:\n{existing_patterns[:3000]}\n" if existing_patterns else ""
        prompt = f"""Generate a complete production-ready .feature file for this uncovered flow.

Flow: {flow_name}
Test cases: {json.dumps(tcs, indent=2)}
{style_hint}

Use Gherkin with Feature, Background, Scenario Outline, Examples.
Each TC gets its own Scenario Outline tagged with @regression and the TC ID.
Use '<testData>' as the Examples parameter.

Return ONLY the raw .feature file content.
"""
        return self._call(prompt)

    # ── Step definition generation ────────────────────────────────────────────

    def generate_stepdef_file(self, flow_name: str, tcs: list, existing_patterns: str = "") -> str:
        style_hint = f"\nMatch this existing code style exactly:\n{existing_patterns[:4000]}\n" if existing_patterns else ""
        prompt = f"""Generate a complete pytest-bdd step definition Python file for this flow.

Flow: {flow_name}
Test cases: {json.dumps(tcs, indent=2)}
{style_hint}

Requirements:
- scenarios() call at the top
- @given/@when/@then with parsers.parse() for parametrised steps
- try/except error handling in every step
- json_data.get(testData, {{}}) pattern
- # TODO comments showing what locator/action is needed

Return ONLY the raw Python file content.
"""
        return self._call(prompt)

    # ── Test data generation ──────────────────────────────────────────────────

    def generate_test_data(self, tcs: list, existing_json_sample: str = "") -> dict:
        sample_hint = f"\nMatch this existing JSON structure:\n{existing_json_sample[:2000]}\n" if existing_json_sample else ""
        prompt = f"""Generate JSON test data entries for these TCs.

{json.dumps(tcs, indent=2)}
{sample_hint}

Each TC ID is a top-level key. Include realistic input values and expected output messages.
Return ONLY valid JSON.
"""
        raw = self._call(prompt)
        return self._parse_json(raw)

    # ── AI-powered Type 2: Story vs Automation ───────────────────────────────

    def analyse_story_coverage_ai(self, stories: list, scenarios: list) -> dict:
        """Same interface as ClaudeModel.analyse_story_coverage_ai — Gemini implementation."""
        from agents.coverage_analyzer import compute_accuracy_score

        sc_index = [
            {
                "idx": i,
                "title": sc.get("title", ""),
                "feature": sc.get("feature", ""),
                "file": sc.get("file", ""),
                "steps": (sc.get("steps", "") or "")[:400],
            }
            for i, sc in enumerate(scenarios)
        ]
        sc_json = json.dumps(sc_index, indent=2)
        if len(sc_json) > 50000:
            sc_index2 = [{"idx": s["idx"], "title": s["title"], "file": s["file"]} for s in sc_index]
            sc_json = json.dumps(sc_index2, indent=2)[:50000]

        BATCH = 80
        all_results: list = []
        key_to_story = {s.get("key", ""): s for s in stories}

        for start in range(0, len(stories), BATCH):
            batch = stories[start:start + BATCH]
            story_input = [
                {
                    "key": s.get("key", ""),
                    "summary": s.get("summary", ""),
                    "description": (s.get("description", "") or "")[:200],
                }
                for s in batch
            ]

            prompt = f"""You are a senior QA automation analyst.

TASK: For each QMetry/Jira test case, determine which automation feature file scenario covers it.

AUTOMATION SCENARIOS ({len(sc_index)} total):
{sc_json}

TEST CASES TO ANALYSE ({len(batch)}):
{json.dumps(story_input, indent=2)}

COVERAGE RULES:
- "covered": scenario steps clearly test the same functionality as the TC
- "partial": scenario covers some but not all aspects of the TC
- "missing": no scenario covers this TC

Return ONLY a valid JSON array — one entry per TC in the SAME ORDER as input:
[
  {{
    "key": "TC-001",
    "coverage": "covered",
    "confidence": 0.92,
    "matched_scenario": "exact scenario title",
    "matched_file": "filename.feature",
    "reason": "one sentence: which step proves coverage"
  }}
]
For missing TCs set matched_scenario/matched_file to null and confidence 0.0–0.15."""

            raw = self._call(prompt)
            parsed = self._parse_json_array(raw)
            if isinstance(parsed, list):
                all_results.extend(parsed)
            elif isinstance(parsed, dict) and isinstance(parsed.get("results"), list):
                all_results.extend(parsed["results"])

        covered_list, partial_list, missing_list = [], [], []
        for item in all_results:
            key = item.get("key", "")
            story = key_to_story.get(key, {"key": key, "summary": ""})
            conf = min(1.0, max(0.0, float(item.get("confidence") or 0)))
            entry = {
                "key": key,
                "summary": story.get("summary", ""),
                "component": story.get("component", ""),
                "priority": story.get("priority", ""),
                "status": story.get("status", ""),
                "match_score": round(conf, 3),
                "ai_confidence": round(conf, 3),
                "matched_scenario": item.get("matched_scenario") or "",
                "matched_file": item.get("matched_file") or "",
                "ai_reason": item.get("reason", ""),
                "coverage": item.get("coverage", "missing"),
            }
            if entry["coverage"] == "covered":
                covered_list.append(entry)
            elif entry["coverage"] == "partial":
                partial_list.append(entry)
            else:
                entry["coverage"] = "missing"
                missing_list.append(entry)

        total = len(stories)
        story_pct = round((len(covered_list) + 0.5 * len(partial_list)) / total * 100, 1) if total else 0
        all_confs = [float(r.get("confidence") or 0) for r in all_results]
        avg_ai_conf = round(sum(all_confs) / len(all_confs) * 100, 1) if all_confs else 0

        accuracy = compute_accuracy_score(stories, scenarios, len(covered_list), len(partial_list), total)
        accuracy["ai_confidence"] = avg_ai_conf
        # Blend: 15% heuristic signals + 85% AI model confidence
        blended = round(accuracy["overall"] * 0.15 + avg_ai_conf * 0.85, 1)
        accuracy["overall"] = blended
        accuracy["label"] = "High" if blended >= 80 else "Medium" if blended >= 60 else "Low"
        accuracy["color"] = "green" if blended >= 80 else "amber" if blended >= 60 else "red"

        return {
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
                "ai_confidence": avg_ai_conf,
                "ai_powered": True,
                "model_used": self.model_name(),
            },
            "covered": covered_list,
            "partial": partial_list,
            "missing": missing_list,
            "analysis_type": "story_coverage_ai",
        }

    def chat(self, prompt: str) -> str:
        return self._call(prompt)

    # ── AI-powered codebase coverage (same 2-step logic as ClaudeModel) ──────

    def analyse_codebase_coverage(self, source_samples: dict, automation_content: dict) -> dict:
        """Extract business flows from source code then map against automation."""
        import re

        src_parts = []
        for mod_name, mod_data in source_samples.items():
            src_parts.append(f"\n### Module: {mod_name}  (layer: {mod_data.get('layer','unknown')})")
            for f in mod_data.get("files", []):
                src_parts.append(f"\n// {f['path']}\n{f['content'][:1500]}")
        src_text = "\n".join(src_parts)[:80000]

        step1_prompt = f"""You are a senior QA analyst reviewing application source code.

Your task: extract business flows that are DIRECTLY EVIDENCED by the code snippets provided.

STRICT RULES — violating any of these makes the result useless:
1. ONLY extract a flow if you can quote a specific line of code (method, endpoint, class, SQL stored procedure) that proves it exists.
2. If the code is ONLY configuration files, environment settings, JSON config, XML config, installer scripts, or SQL DDL — return an empty business_flows array. Do NOT invent flows from your general knowledge.
3. Do NOT use your knowledge of the Americold logistics domain to fill in flows that are not in the code. Only report what you literally see in the snippets.
4. source_evidence MUST be a verbatim or near-verbatim quote from the code — not a description of what you think the system does.

Focus on: method signatures, API route declarations, class names, SQL stored procedures, service calls, controller actions.

Source code:
{src_text}

Return ONLY valid JSON (no markdown fences):
{{
  "business_flows": [
    {{
      "id": "flow-001",
      "name": "Inbound Receiving",
      "description": "Receive carrier shipment at dock, validate, create ASN",
      "module": "ReceivingController",
      "operations": ["validate carrier", "create ASN", "scan pallets", "update inventory"],
      "keywords": ["receive", "inbound", "carrier", "dock", "asn", "pallet"],
      "source_evidence": "EXACT QUOTE: public void ProcessInbound(ShipmentRequest req) {{ CreateASN(req.carrierId); ScanPallets(); }}"
    }}
  ]
}}

If the provided code contains no application logic (only config/env/installer files), return:
{{"business_flows": []}}"""

        flows_raw = self._parse_json(self._call(step1_prompt))
        business_flows = flows_raw.get("business_flows", [])

        if not business_flows:
            return {
                "business_flows": [],
                "summary": {"total_flows": 0, "covered": 0, "partial": 0, "missing": 0, "coverage_pct": 0},
                "error": "Could not extract business flows. Ensure the uploaded codebase contains application logic.",
            }

        auto_parts = []
        for feat in automation_content.get("features", []):
            auto_parts.append(f"\n# Feature: {feat['file']}\n{feat['text'][:3000]}")
        for sd in automation_content.get("stepdefs", []):
            auto_parts.append(f"\n# Step def: {sd['file']}\n{sd['text'][:2000]}")
        auto_text = "\n".join(auto_parts)[:60000]

        if not auto_text.strip():
            merged = [{**f, "coverage": "missing", "covered_by": [],
                       "missing_scenarios": ["No automation code found — upload feature files or set automation repo path"],
                       "confidence": 1.0, "semantic_score": 0.0} for f in business_flows]
        else:
            step2_prompt = f"""You are a senior QA automation engineer reviewing Americold logistics test coverage.

Business flows extracted from source code:
{json.dumps(business_flows, indent=2)[:20000]}

Automation code (feature files + step definitions):
{auto_text}

For each flow determine: "covered" (full happy + error path), "partial" (happy path only), or "missing" (no scenario).

Return ONLY valid JSON (no markdown fences):
{{
  "coverage": [
    {{
      "flow_id": "flow-001",
      "status": "covered",
      "covered_by": ["Scenario: Verify inbound receiving with valid carrier"],
      "match_evidence": "Given I am at the receiving dock\\nWhen I scan the carrier barcode",
      "missing_scenarios": [],
      "confidence": 0.88
    }}
  ]
}}"""

            cov_raw = self._parse_json(self._call(step2_prompt))
            cov_map = {c["flow_id"]: c for c in cov_raw.get("coverage", [])}

            all_auto_tokens = set(re.findall(r"[a-z]{3,}", auto_text.lower()))

            merged = []
            for f in business_flows:
                cov      = cov_map.get(f["id"], {})
                flow_kws = frozenset(w.lower() for w in f.get("keywords", []) if len(w) >= 3)
                sem_score = round(len(flow_kws & all_auto_tokens) / len(flow_kws), 2) if flow_kws else 0.0
                merged.append({
                    **f,
                    "coverage":          cov.get("status", "missing"),
                    "covered_by":        cov.get("covered_by", []),
                    "match_evidence":    cov.get("match_evidence", ""),
                    "missing_scenarios": cov.get("missing_scenarios", []),
                    "confidence":        cov.get("confidence", 0.5),
                    "semantic_score":    sem_score,
                })

        total = len(merged)
        covered_count = sum(1 for f in merged if f["coverage"] == "covered")
        partial_count = sum(1 for f in merged if f["coverage"] == "partial")
        missing_count = sum(1 for f in merged if f["coverage"] == "missing")
        pct = round(100 * (covered_count + partial_count * 0.5) / total) if total else 0
        all_scored = [f for f in merged if "confidence" in f]
        overall_accuracy = round(
            sum(f["confidence"] for f in all_scored) / len(all_scored), 2
        ) if all_scored else 0.0

        return {
            "business_flows": merged,
            "summary": {"total_flows": total, "covered": covered_count, "partial": partial_count,
                        "missing": missing_count, "coverage_pct": pct, "overall_accuracy": overall_accuracy},
        }

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _call(self, prompt: str) -> str:
        response = self.client.generate_content(prompt)
        return response.text.strip()

    def _parse_json(self, text: str) -> dict:
        text = re.sub(r"^```(?:json)?\s*", "", text.strip())
        text = re.sub(r"\s*```$", "", text.strip())
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', text)
            if match:
                try:
                    return json.loads(match.group())
                except Exception:
                    pass
        return {}

    def _parse_json_array(self, text: str):
        text = re.sub(r"^```(?:json)?\s*", "", text.strip())
        text = re.sub(r"\s*```$", "", text.strip())
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r'\[[\s\S]*\]', text)
            if match:
                try:
                    return json.loads(match.group())
                except Exception:
                    pass
            match = re.search(r'\{[\s\S]*\}', text)
            if match:
                try:
                    return json.loads(match.group())
                except Exception:
                    pass
        return []
