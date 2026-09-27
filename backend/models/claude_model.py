import anthropic
import json
import re
from models.base_model import BaseAIModel

CLAUDE_MODEL = "claude-sonnet-4-6"


class ClaudeModel(BaseAIModel):
    """
    Claude AI model — full 11-point coverage analysis:
      1.  New requirement detection
      2.  Changed requirement detection
      3.  Missed requirement detection
      4.  Coverage % (overall + per flow)
      5.  Test case coverage with traceability
      6.  Test data coverage (multiple data rows check)
      7.  Tailgate scenario verification
      8.  Before/After coverage comparison
      9.  Incomplete coverage indication (script exists but missing validation)
      10. Environment configuration check
      11. Feature file vs flow comparison via GenAI
    """

    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)

    def model_name(self) -> str:
        return "Claude (Anthropic)"

    # ─────────────────────────────────────────────────────────────────────────
    # MAIN ANALYSIS — All 11 points
    # ─────────────────────────────────────────────────────────────────────────

    def analyze_coverage(
        self,
        jira_tcs: list,
        feature_scenarios: list,
        previous_analysis: dict = None,
        previous_jira_tcs: list = None,
        env_configs: dict = None,
    ) -> dict:
        """
        Full 11-point coverage analysis.
        previous_analysis: result from last run (for point 8 - before/after)
        previous_jira_tcs: last sprint's TC list (for points 1 & 2 - new/changed)
        env_configs: dict of {env_name: config_dict} (for point 10)
        """

        # ── POINT 1 & 2: New and Changed requirements ─────────────────────────
        new_tcs, changed_tcs, removed_tcs = [], [], []
        if previous_jira_tcs:
            prev_map = {t["key"]: t for t in previous_jira_tcs}
            curr_map = {t["key"]: t for t in jira_tcs}
            for key, tc in curr_map.items():
                if key not in prev_map:
                    new_tcs.append(tc)
                elif tc["summary"] != prev_map[key]["summary"]:
                    changed_tcs.append({
                        "key": key,
                        "old_summary": prev_map[key]["summary"],
                        "new_summary": tc["summary"],
                    })
            for key in prev_map:
                if key not in curr_map:
                    removed_tcs.append(prev_map[key])

        # ── POINT 3, 4, 5, 11: Core gap analysis + traceability ───────────────
        step1_prompt = f"""You are a senior QA automation engineer.

Analyse {len(jira_tcs)} Jira test cases and group them into meaningful functional flows.

Return ONLY valid JSON:
{{
  "flows": {{
    "Flow Name": ["TC-001", "TC-002"]
  }}
}}

Jira TCs:
{json.dumps([{"key": t["key"], "summary": t["summary"]} for t in jira_tcs], indent=2)}
"""
        jira_flows = self._parse_json(self._call(step1_prompt)).get("flows", {})

        # Point 11 + Confidence Scoring: Feature file vs flow comparison
        step2_prompt = f"""You are a senior QA automation engineer performing a precise coverage audit.

Given these Jira flows:
{json.dumps(jira_flows, indent=2)}

And these existing automated scenarios:
{json.dumps([{"title": s["title"], "file": s["file"], "tc_ids": s.get("tc_ids", [])} for s in feature_scenarios], indent=2)}

For each Jira TC, analyse carefully and return:
1. The covering scenario (if any)
2. Analysis confidence score (0.0-1.0): how confident are you that the mapping is correct?
   - 1.0 = TC ID explicitly in scenario title or Examples table
   - 0.8-0.9 = scenario description closely matches TC summary
   - 0.5-0.7 = partial match, some steps align
   - 0.1-0.4 = weak match, different intent
   - 0.0 = no coverage found
3. Confidence reason: one sentence explaining the score
4. Whether the scenario intent matches the TC business requirement (alignment)
5. Data coverage depth

Return ONLY valid JSON:
{{
  "coverage_map": {{
    "TC-001": {{
      "covered_by": "featureFileName.feature",
      "scenario": "Scenario title",
      "status": "COVERED",
      "analysis_confidence": 0.95,
      "confidence_reason": "TC ID AMCC-TC-001 found in scenario title and Examples table",
      "alignment_ok": true,
      "alignment_note": "",
      "data_coverage": "SUFFICIENT",
      "data_note": ""
    }},
    "TC-002": {{
      "covered_by": null,
      "scenario": null,
      "status": "MISSING",
      "analysis_confidence": 0.0,
      "confidence_reason": "No scenario found matching this TC in any feature file",
      "alignment_ok": null,
      "alignment_note": "",
      "data_coverage": null,
      "data_note": ""
    }}
  }}
}}

Status values: COVERED (fully covered), INCOMPLETE (script exists but missing validation/data), MISSING (no script)
data_coverage values: SUFFICIENT (multiple rows), SINGLE (only 1 row), MISSING (no data), null (not applicable)
Be strict with confidence scores — only give 0.9+ when you are very certain.
"""
        coverage_raw = self._parse_json(self._call(step2_prompt)).get("coverage_map", {})

        # Build covered / incomplete / uncovered lists
        covered, incomplete, uncovered = [], [], []
        tc_traceability = []

        for tc in jira_tcs:
            key = tc["key"]
            cov = coverage_raw.get(key, {})
            status = cov.get("status", "MISSING")
            entry = {
                **tc,
                "covered_by":          cov.get("covered_by"),
                "scenario":            cov.get("scenario"),
                "status":              status,
                "analysis_confidence": cov.get("analysis_confidence", 0.0 if status == "MISSING" else 0.5),
                "confidence_reason":   cov.get("confidence_reason", ""),
                "alignment_ok":        cov.get("alignment_ok"),
                "alignment_note":      cov.get("alignment_note", ""),
                "data_coverage":       cov.get("data_coverage"),
                "data_note":           cov.get("data_note", ""),
            }
            tc_traceability.append(entry)
            if status == "COVERED":
                covered.append(entry)
            elif status == "INCOMPLETE":
                incomplete.append(entry)
            else:
                uncovered.append(entry)

        # ── POINT 5: Per-flow coverage breakdown ──────────────────────────────
        flow_coverage = {}
        for flow_name, tc_keys in jira_flows.items():
            flow_covered   = sum(1 for k in tc_keys if coverage_raw.get(k, {}).get("status") == "COVERED")
            flow_incomplete = sum(1 for k in tc_keys if coverage_raw.get(k, {}).get("status") == "INCOMPLETE")
            flow_missing   = sum(1 for k in tc_keys if coverage_raw.get(k, {}).get("status") == "MISSING")
            flow_total     = len(tc_keys)
            flow_coverage[flow_name] = {
                "total": flow_total,
                "covered": flow_covered,
                "incomplete": flow_incomplete,
                "missing": flow_missing,
                "pct": round(flow_covered / flow_total * 100, 1) if flow_total else 0,
            }

        # ── POINT 3: Group uncovered + incomplete for script generation ────────
        uncovered_for_generation = uncovered + incomplete
        uncovered_flows = {}
        if uncovered_for_generation:
            step3_prompt = f"""You are a senior QA automation engineer.

These Jira TCs need new or improved automation scripts:
{json.dumps([{"key": t["key"], "summary": t["summary"], "status": t["status"]} for t in uncovered_for_generation], indent=2)}

Group them into BDD flow groups with descriptive names.

Return ONLY valid JSON:
{{
  "uncovered_flows": {{
    "Flow Group Name": [
      {{"key": "TC-001", "summary": "...", "status": "MISSING"}}
    ]
  }}
}}
"""
            uncovered_flows = self._parse_json(self._call(step3_prompt)).get("uncovered_flows", {})

        # ── POINT 7: Tailgate scenario verification ───────────────────────────
        tailgate_issues = []
        if len(jira_tcs) > 1:
            step_tailgate = f"""You are a senior QA automation engineer.

Review these test cases and identify TAILGATE dependencies — where TC-B requires TC-A's output as a precondition.
If TC-A has no automation (MISSING or INCOMPLETE) but TC-B depends on it, flag TC-B as a blocked tailgate.

Test cases with their coverage status:
{json.dumps([{"key": t["key"], "summary": t["summary"], "status": coverage_raw.get(t["key"], {}).get("status", "MISSING")} for t in jira_tcs], indent=2)}

Return ONLY valid JSON:
{{
  "tailgate_issues": [
    {{
      "dependent_tc": "TC-002",
      "depends_on": "TC-001",
      "reason": "TC-002 requires a message created by TC-001",
      "risk": "HIGH"
    }}
  ]
}}

Return empty list if no tailgate dependencies found.
"""
            tailgate_issues = self._parse_json(self._call(step_tailgate)).get("tailgate_issues", [])

        # ── POINT 6: Test data coverage depth ─────────────────────────────────
        data_gaps = [
            {"key": t["key"], "summary": t["summary"], "note": t["data_note"]}
            for t in tc_traceability
            if t.get("data_coverage") in ["SINGLE", "MISSING"] and t.get("covered_by")
        ]

        # ── POINT 9: Incomplete coverage — scripts without validation ─────────
        incomplete_coverage = [
            {"key": t["key"], "summary": t["summary"], "file": t.get("covered_by"), "note": t.get("alignment_note", "")}
            for t in incomplete
        ]

        # ── POINT 10: Environment configuration check ─────────────────────────
        env_issues = []
        if env_configs:
            env_prompt = f"""You are a senior QA automation engineer.

Review these environment configurations and the test cases.
Identify which TCs have test data only for one environment and are missing coverage for others.

Environments available: {list(env_configs.keys())}
Environment configs: {json.dumps(env_configs, indent=2)[:2000]}

Test cases:
{json.dumps([{"key": t["key"], "summary": t["summary"]} for t in jira_tcs[:30]], indent=2)}

Return ONLY valid JSON:
{{
  "env_issues": [
    {{
      "tc_key": "TC-001",
      "missing_envs": ["UAT", "PROD"],
      "note": "Test data only covers DEV environment"
    }}
  ]
}}
"""
            env_issues = self._parse_json(self._call(env_prompt)).get("env_issues", [])

        # ── POINT 8: Before/After comparison ─────────────────────────────────
        delta = {}
        if previous_analysis:
            prev_summary = previous_analysis.get("summary", {})
            prev_pct = prev_summary.get("coverage_pct", 0)
            curr_total = len(jira_tcs)
            curr_covered = len(covered)
            curr_pct = round(curr_covered / curr_total * 100, 1) if curr_total else 0

            prev_covered_keys = {t["key"] for t in previous_analysis.get("covered_tcs", [])}
            curr_covered_keys = {t["key"] for t in covered}

            newly_covered = [k for k in curr_covered_keys if k not in prev_covered_keys]
            newly_missed  = [k for k in prev_covered_keys if k not in curr_covered_keys]

            delta = {
                "prev_coverage_pct":  prev_pct,
                "curr_coverage_pct":  curr_pct,
                "pct_change":         round(curr_pct - prev_pct, 1),
                "prev_covered_count": prev_summary.get("covered", 0),
                "curr_covered_count": curr_covered,
                "newly_covered_tcs":  newly_covered,
                "newly_missed_tcs":   newly_missed,
                "new_tcs_this_run":   [t["key"] for t in new_tcs],
                "changed_tcs_this_run": [t["key"] for t in changed_tcs],
                "improvement": curr_pct > prev_pct,
            }

        # ── Feature file summary ───────────────────────────────────────────────
        feature_summary = {}
        for s in feature_scenarios:
            feature_summary.setdefault(s["file"], []).append(s["title"])

        total = len(jira_tcs)
        covered_count = len(covered)
        incomplete_count = len(incomplete)

        return {
            "summary": {
                "total":            total,
                "covered":          covered_count,
                "incomplete":       incomplete_count,
                "uncovered":        len(uncovered),
                "coverage_pct":     round(covered_count / total * 100, 1) if total else 0,
                "effective_pct":    round((covered_count + incomplete_count) / total * 100, 1) if total else 0,
                "model_used":       self.model_name(),
            },
            # Point 3, 4, 5
            "covered_tcs":          covered,
            "incomplete_tcs":       incomplete,
            "uncovered_tcs":        uncovered,
            "uncovered_flows":      uncovered_flows,
            "feature_summary":      feature_summary,
            "flow_coverage":        flow_coverage,
            "tc_traceability":      tc_traceability,
            # Point 1, 2
            "new_tcs":              new_tcs,
            "changed_tcs":          changed_tcs,
            "removed_tcs":          removed_tcs,
            # Point 6
            "data_gaps":            data_gaps,
            # Point 7
            "tailgate_issues":      tailgate_issues,
            # Point 8
            "delta":                delta,
            # Point 9
            "incomplete_coverage":  incomplete_coverage,
            # Point 10
            "env_issues":           env_issues,
        }

    # ── Feature file generation ───────────────────────────────────────────────

    def generate_feature_file(self, flow_name: str, tcs: list, existing_patterns: str = "") -> str:
        style_hint = f"\nFollow the exact same style as these existing feature files:\n{existing_patterns[:3000]}\n" if existing_patterns else ""
        prompt = f"""You are a senior QA automation engineer specialising in BDD with pytest-bdd.

Generate a complete, production-ready .feature file for this uncovered flow:

Flow name: {flow_name}

Test cases to cover:
{json.dumps(tcs, indent=2)}
{style_hint}

Requirements:
- Use Gherkin syntax (Feature, Background, Scenario Outline, Examples)
- Background should include Login and Navigate steps
- Each TC gets its own Scenario Outline with @regression tag and TC ID tag
- Use '<testData>' as the Examples parameter name
- Steps should be realistic BDD steps matching the TC descriptions
- Include multiple Examples rows where applicable (positive, negative, boundary)
- The Examples table should have a testData column with the TC ID as value

Return ONLY the raw .feature file content. No explanation, no markdown fences.
"""
        result = self._call(prompt)
        return result

    def score_generation(self, flow_name: str, tcs: list, generated_feature: str, generated_stepdef: str) -> dict:
        """
        Score the quality and accuracy of generated scripts.
        Returns confidence scores for feature file and step definitions.
        """
        prompt = f"""You are a senior QA automation engineer reviewing AI-generated test scripts.

Flow name: {flow_name}

Original test cases:
{json.dumps(tcs, indent=2)}

Generated .feature file:
{generated_feature[:2000]}

Generated step definition:
{generated_stepdef[:2000]}

Score the generated scripts on these dimensions (0.0 to 1.0):

1. scenario_coverage_score: Does every TC have a corresponding Scenario Outline? (1.0 = all covered)
2. step_accuracy_score: Do the Gherkin steps accurately reflect the TC descriptions? (1.0 = perfectly aligned)
3. data_completeness_score: Does the Examples table have multiple rows with varied test data? (1.0 = rich data)
4. step_def_completeness_score: Do step def functions have proper structure, error handling, and TODO comments? (1.0 = complete)
5. overall_generation_confidence: Overall confidence that these scripts are production-ready (weighted average)

Return ONLY valid JSON:
{{
  "scenario_coverage_score": 0.95,
  "step_accuracy_score": 0.88,
  "data_completeness_score": 0.72,
  "step_def_completeness_score": 0.91,
  "overall_generation_confidence": 0.87,
  "issues": [
    "TC-003 scenario steps do not match the delete confirmation flow",
    "Examples table has only 1 row — needs negative test data"
  ],
  "strengths": [
    "Background steps correctly include login and navigation",
    "All TC IDs present in scenario tags"
  ]
}}
"""
        return self._parse_json(self._call(prompt))

    # ── Step definition generation ────────────────────────────────────────────

    def generate_stepdef_file(self, flow_name: str, tcs: list, existing_patterns: str = "") -> str:
        style_hint = f"\nFollow the EXACT same code style and patterns:\n{existing_patterns[:4000]}\n" if existing_patterns else ""
        prompt = f"""You are a senior QA automation engineer specialising in pytest-bdd with Python and Selenium.

Generate a complete, production-ready pytest-bdd step definition Python file for this flow:

Flow name: {flow_name}

Test cases:
{json.dumps(tcs, indent=2)}
{style_hint}

Requirements:
- Include scenarios() call at the top referencing the matching .feature file
- Every @given/@when/@then step must have a proper function with bdd_driver parameter
- Use parsers.parse() for any step containing a parameter
- Include try/except error handling in every step function
- Add # TODO: implement comments with the locator/action needed
- Load test data from json_data using json_data.get(testData, {{}})
- Include Background steps (login, navigate, verify page)
- Include data validation assertions (Then steps with proper assertions)

Return ONLY the raw Python file content. No explanation, no markdown fences.
"""
        return self._call(prompt)

    # ── Test data JSON generation ─────────────────────────────────────────────

    def generate_test_data(self, tcs: list, existing_json_sample: str = "") -> dict:
        sample_hint = f"\nUse the EXACT same key naming and value structure:\n{existing_json_sample[:2000]}\n" if existing_json_sample else ""
        prompt = f"""You are a senior QA automation engineer.

Generate JSON test data entries for these test cases:
{json.dumps(tcs, indent=2)}
{sample_hint}

Requirements:
- Each TC ID becomes a top-level key
- Include MULTIPLE test data variations per TC: positive case, negative case, boundary values
- Include realistic field values: message text, dates (MM/DD/YYYY), priority, area, type
- Include expected results for each variation
- Match camelCase naming conventions
- Cover DEV, SIT, UAT environment values where applicable

Return ONLY a valid JSON object. No explanation, no markdown fences.
"""
        raw = self._call(prompt)
        return self._parse_json(raw)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _call(self, prompt: str, max_tokens: int = 8000) -> str:
        message = self.client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text.strip()

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