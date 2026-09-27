import json
import re
import google.generativeai as genai
from models.base_model import BaseAIModel

GEMINI_MODEL = "gemini-1.5-pro"


class GeminiModel(BaseAIModel):
    """
    Google Gemini AI model using google-generativeai SDK.
    Implements the same 4-step agentic analysis as ClaudeModel.
    """

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.client = genai.GenerativeModel(GEMINI_MODEL)

    def model_name(self) -> str:
        return "Gemini (Google)"

    # ── STEP 1+2+3+4: Full coverage gap analysis ──────────────────────────────

    def analyze_coverage(self, jira_tcs: list, feature_scenarios: list) -> dict:

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
{json.dumps([{{"key": t["key"], "summary": t["summary"]}} for t in jira_tcs], indent=2)}
"""
        step1_result = self._call(step1_prompt)
        jira_flows = self._parse_json(step1_result).get("flows", {})

        # Agent Step 2: Map scenarios to flows
        step2_prompt = f"""You are a senior QA automation engineer.

Given these Jira flows:
{json.dumps(jira_flows, indent=2)}

And these existing automated scenarios:
{json.dumps([{{"title": s["title"], "file": s["file"], "tc_ids": s.get("tc_ids", [])}} for s in feature_scenarios], indent=2)}

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

{json.dumps([{{"key": t["key"], "summary": t["summary"]}} for t in uncovered], indent=2)}

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
