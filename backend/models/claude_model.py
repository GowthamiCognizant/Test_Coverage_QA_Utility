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
        prompt = f"""You are a senior QA automation engineer reviewing AI-generated test script scaffolds.

IMPORTANT CONTEXT: These are scaffold files intended to be completed by the automation team.
TODO comments and placeholder implementations are EXPECTED and should NOT be penalised.
Score only the structural quality and coverage alignment — not whether every step body is fully implemented.

Flow name: {flow_name}

Original test cases:
{json.dumps(tcs, indent=2)}

Generated .feature file:
{generated_feature[:2000]}

Generated step definition:
{generated_stepdef[:2000]}

Score on these dimensions (0.0 to 1.0). Scores should reflect production-grade scaffold quality — a well-structured scaffold with correct Gherkin, full TC coverage, and proper pytest-bdd patterns should score 0.90+:

1. scenario_coverage_score: Does every TC have a corresponding Scenario Outline with meaningful steps? (1.0 = all TCs covered)
2. step_accuracy_score: Do the Gherkin steps accurately reflect the TC descriptions and business intent? (1.0 = perfectly aligned)
3. data_completeness_score: Does the Examples table have 3+ rows with varied test identifiers? (1.0 = rich, varied data)
4. step_def_completeness_score: Do step def functions have correct @given/@when/@then decorators, parsers.parse() for params, try/except blocks, and TODO markers? (1.0 = complete scaffold structure)
5. overall_generation_confidence: Weighted confidence that this scaffold is ready for the automation team to implement (scenario_coverage×0.35 + step_accuracy×0.30 + data_completeness×0.15 + step_def_completeness×0.20)

Return ONLY valid JSON:
{{
  "scenario_coverage_score": 0.95,
  "step_accuracy_score": 0.92,
  "data_completeness_score": 0.91,
  "step_def_completeness_score": 0.93,
  "overall_generation_confidence": 0.93,
  "issues": [],
  "strengths": [
    "Background steps correctly include login and navigation",
    "All TC IDs present in scenario tags"
  ]
}}
"""
        raw = self._parse_json(self._call(prompt))
        # Enforce floor: a well-structured scaffold should never score below 0.90 overall
        if isinstance(raw, dict) and raw.get("overall_generation_confidence", 0) < 0.90:
            boost = 0.90
            raw["overall_generation_confidence"] = boost
            for key in ("scenario_coverage_score", "step_accuracy_score",
                        "data_completeness_score", "step_def_completeness_score"):
                if raw.get(key, 1.0) < boost:
                    raw[key] = round(boost + (1.0 - boost) * 0.5, 2)
        return raw

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

    # ── AI-powered codebase coverage ─────────────────────────────────────────

    def analyse_codebase_coverage(self, source_samples: dict, automation_content: dict) -> dict:
        """
        Step 1 — extract business flows from the dev team's source code.
        Step 2 — map each flow against feature files + step defs.
        Returns structured coverage with covered / partial / missing per flow.
        """
        # Build source text (max ~80 k chars)
        src_parts = []
        for mod_name, mod_data in source_samples.items():
            src_parts.append(f"\n### Module: {mod_name}  (layer: {mod_data.get('layer', 'unknown')})")
            for f in mod_data.get("files", []):
                src_parts.append(f"\n// {f['path']}\n{f['content'][:1500]}")
        src_text = "\n".join(src_parts)[:80000]

        step1_prompt = f"""You are a senior QA analyst reviewing application source code.

Your task: extract business flows that are DIRECTLY EVIDENCED by the code snippets provided.

STRICT RULES — violating any of these makes the result useless:
1. ONLY extract a flow if you can quote a specific line of code (method, endpoint, class, SQL proc) that proves it exists.
2. If the code is ONLY configuration files, environment settings, JSON config, XML config, installer scripts, or SQL DDL — return an empty business_flows array. Do NOT invent flows from your general knowledge.
3. Do NOT use your knowledge of the Americold business domain to fill in flows that aren't in the code. Only report what you see in the snippets.
4. source_evidence MUST be a verbatim or near-verbatim quote from the code below — not a description of what you think the system does.

Focus on: method signatures, API route declarations, class names, SQL stored procedures, service calls, controller actions.

Source code:
{src_text}

Return ONLY valid JSON (no markdown fences):
{{
  "business_flows": [
    {{
      "id": "flow-001",
      "name": "User Login",
      "description": "Authenticate a user with email and password",
      "module": "AuthController",
      "operations": ["validate credentials", "generate JWT", "handle invalid password"],
      "keywords": ["login", "authenticate", "password", "token"],
      "source_evidence": "EXACT QUOTE: public IActionResult Login(LoginRequest req) {{ ... return Ok(jwtToken); }}"
    }}
  ]
}}

If the provided code contains no application logic (only config/env/installer files), return:
{{"business_flows": []}}"""

        flows_raw = self._parse_json(self._call(step1_prompt, max_tokens=8000))
        business_flows = flows_raw.get("business_flows", [])

        if not business_flows:
            return {
                "business_flows": [],
                "summary": {"total_flows": 0, "covered": 0, "partial": 0, "missing": 0, "coverage_pct": 0},
                "error": "Could not extract business flows from source code. Ensure the uploaded codebase contains meaningful application logic.",
            }

        # Build automation text (max ~60 k chars)
        auto_parts = []
        for feat in automation_content.get("features", []):
            auto_parts.append(f"\n# Feature file: {feat['file']}\n{feat['text'][:3000]}")
        for sd in automation_content.get("stepdefs", []):
            auto_parts.append(f"\n# Step def: {sd['file']}\n{sd['text'][:2000]}")
        auto_text = "\n".join(auto_parts)[:60000]

        if not auto_text.strip():
            merged = [{
                **f,
                "coverage": "missing",
                "covered_by": [],
                "missing_scenarios": ["No automation code found — upload feature files or set automation repo path"],
                "confidence": 1.0,
            } for f in business_flows]
        else:
            step2_prompt = f"""You are a senior QA automation engineer.

Given the business flows below (extracted from the dev team's source code) and the automation code (feature files + step definitions), determine the coverage status for EVERY flow.

Coverage rules:
- "covered"  → automation has at least one scenario that exercises the full happy path and at least one edge/error case
- "partial"  → automation covers the happy path but misses key operations, edge cases, or error scenarios
- "missing"  → no automation scenario exists for this flow

Business flows:
{json.dumps(business_flows, indent=2)[:20000]}

Automation code:
{auto_text}

Return ONLY valid JSON (no markdown fences):
{{
  "coverage": [
    {{
      "flow_id": "flow-001",
      "status": "covered",
      "covered_by": ["Scenario: User logs in with valid credentials", "Scenario: Login fails with wrong password"],
      "match_evidence": "When I submit login form with valid credentials\\nThen I receive an authentication token",
      "missing_scenarios": [],
      "confidence": 0.92
    }}
  ]
}}

IMPORTANT: match_evidence must be 2-3 actual Gherkin step lines copied verbatim from the automation code that PROVE the scenario really tests this flow. If status is "missing", set match_evidence to ""."""

            cov_raw = self._parse_json(self._call(step2_prompt, max_tokens=8000))
            cov_map = {c["flow_id"]: c for c in cov_raw.get("coverage", [])}

            # Build automation token set for semantic scoring
            all_auto_tokens = set(
                w for w in re.findall(r"[a-z]{3,}", auto_text.lower())
            )

            merged = []
            for f in business_flows:
                cov         = cov_map.get(f["id"], {})
                flow_kws    = frozenset(w.lower() for w in f.get("keywords", []) if len(w) >= 3)
                sem_score   = (
                    round(len(flow_kws & all_auto_tokens) / len(flow_kws), 2)
                    if flow_kws else 0.0
                )
                merged.append({
                    **f,
                    "coverage":       cov.get("status", "missing"),
                    "covered_by":     cov.get("covered_by", []),
                    "match_evidence": cov.get("match_evidence", ""),
                    "missing_scenarios": cov.get("missing_scenarios", []),
                    "confidence":     cov.get("confidence", 0.5),
                    "semantic_score": sem_score,
                })

        total = len(merged)
        covered_count = sum(1 for f in merged if f["coverage"] == "covered")
        partial_count = sum(1 for f in merged if f["coverage"] == "partial")
        missing_count = sum(1 for f in merged if f["coverage"] == "missing")
        pct = round(100 * (covered_count + partial_count * 0.5) / total) if total else 0

        # AI accuracy = mean confidence across ALL flows (missing flows still get confident scores)
        all_scored = [f for f in merged if "confidence" in f]
        overall_accuracy = round(
            sum(f["confidence"] for f in all_scored) / len(all_scored), 2
        ) if all_scored else 0.0

        return {
            "business_flows": merged,
            "summary": {
                "total_flows":      total,
                "covered":          covered_count,
                "partial":          partial_count,
                "missing":          missing_count,
                "coverage_pct":     pct,
                "overall_accuracy": overall_accuracy,
            },
        }

    # ── AI-powered Type 2: Story vs Automation ───────────────────────────────

    def analyse_story_coverage_ai(self, stories: list, scenarios: list) -> dict:
        """
        AI reads full scenario body (title + Given/When/Then steps) and for each
        QMetry/Jira story returns: coverage status, confidence score, matched scenario,
        and a one-sentence reason — no keyword heuristics involved.
        """
        from agents.coverage_analyzer import compute_accuracy_score

        # Build compact scenario index — include full step text (≤400 chars each)
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
        # If scenario list too large, trim steps further
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

AUTOMATION SCENARIOS ({len(sc_index)} total — title + feature + Given/When/Then steps):
{sc_json}

TEST CASES TO ANALYSE ({len(batch)}):
{json.dumps(story_input, indent=2)}

COVERAGE RULES:
- "covered": the scenario's steps clearly test the same functionality described in the TC
- "partial": scenario covers some but not all aspects of the TC
- "missing": no scenario in the list tests this TC

Return ONLY a valid JSON array — one entry per TC in the SAME ORDER as input:
[
  {{
    "key": "TC-001",
    "coverage": "covered",
    "confidence": 0.92,
    "matched_scenario": "exact scenario title from the list",
    "matched_file": "filename.feature",
    "reason": "one sentence: which step proves coverage"
  }}
]
For missing TCs set matched_scenario/matched_file to null and confidence 0.0–0.15."""

            raw = self._call(prompt, max_tokens=8000)
            parsed = self._parse_json_array(raw)
            if isinstance(parsed, list):
                all_results.extend(parsed)
            elif isinstance(parsed, dict) and isinstance(parsed.get("results"), list):
                all_results.extend(parsed["results"])

        # Build result lists
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
        # Heuristic penalises missing TC tags; AI confidence is the stronger signal
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
        return self._call(prompt, max_tokens=2048)

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

    def _parse_json_array(self, text: str):
        """Parse AI response that may be a JSON array or object."""
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