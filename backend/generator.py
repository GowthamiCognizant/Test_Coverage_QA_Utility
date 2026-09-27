import re
from pathlib import Path


def generate_scripts(flow_groups: dict, output_dir: Path, existing_patterns: list = None) -> list:
    output_dir.mkdir(parents=True, exist_ok=True)
    generated = []

    for flow_name, tcs in flow_groups.items():
        if not tcs:
            continue
        safe_name = re.sub(r'[^a-z0-9]+', '_', flow_name.lower()).strip('_')
        feature_content = _build_feature_file(flow_name, tcs)
        stepdef_content = _build_stepdef_file(flow_name, tcs)

        feat_path = output_dir / f"{safe_name}.feature"
        step_path = output_dir / f"test_{safe_name}.py"
        feat_path.write_text(feature_content)
        step_path.write_text(stepdef_content)
        generated.append(feat_path.name)
        generated.append(step_path.name)

    return generated


def _build_feature_file(flow_name: str, tcs: list) -> str:
    lines = [f"Feature: {flow_name}\n"]
    lines.append(f"  Background:")
    lines.append(f"    Given Login to the application with system administrator access")
    lines.append(f"    When Navigate to the module under test")
    lines.append(f"    Then The landing page should be displayed 'generic'\n")

    for tc in tcs:
        tc_id = tc["key"]
        summary = tc["summary"]
        safe_tag = tc_id.replace("-", "-tc-").lower() if "tc" not in tc_id.lower() else tc_id.lower()
        lines.append(f"  @regression @amcc @{safe_tag}")
        lines.append(f"  Scenario Outline: {tc_id} {summary}")
        steps = _infer_steps(summary)
        for step in steps:
            lines.append(f"    {step}")
        lines.append(f"    Examples:")
        lines.append(f"      | testData    |")
        lines.append(f"      | {tc_id}     |\n")

    return "\n".join(lines)


def _infer_steps(summary: str) -> list:
    s = summary.lower()
    steps = []

    if any(x in s for x in ["create", "add new", "create new"]):
        steps += [
            "When Click on the Create button",
            "Then Verify the Create flyer is opened '<testData>'",
            "When Enter values in the required fields '<testData>'",
            "And Click on the Submit button",
            "Then Verify '<testData>' success message is displayed",
        ]
    elif any(x in s for x in ["edit", "update"]):
        steps += [
            "Given Search '<testData>' in search box",
            "When Click on the Edit button",
            "Then Edit flyer should be opened and existing values populated '<testData>'",
            "When Update the required fields '<testData>'",
            "And Click on the Save button",
            "Then Verify '<testData>' success message is displayed",
        ]
    elif any(x in s for x in ["delete", "deletion"]):
        steps += [
            "Given Search '<testData>' in search box",
            "When Click the Delete option",
            "Then The confirmation popup should be displayed '<testData>'",
            "When Confirm the deletion",
            "Then Verify the record is removed '<testData>'",
        ]
    elif any(x in s for x in ["search", "filter"]):
        steps += [
            "When Enter a keyword in the search bar '<testData>'",
            "Then Verify search results are displayed '<testData>'",
            "And Verify the keyword is highlighted in results '<testData>'",
        ]
    elif any(x in s for x in ["validate", "verify", "check", "display"]):
        steps += [
            "Then Verify '<testData>' is displayed correctly",
            "And Validate the expected behaviour '<testData>'",
        ]
    elif any(x in s for x in ["navigate", "breadcrumb", "page"]):
        steps += [
            "When Navigate to '<testData>'",
            "Then Verify the correct page is displayed '<testData>'",
        ]
    else:
        steps += [
            "When Perform the action for '<testData>'",
            "Then Verify the expected result '<testData>'",
        ]

    return steps


def _build_stepdef_file(flow_name: str, tcs: list) -> str:
    safe_class = re.sub(r'[^a-zA-Z0-9]+', '_', flow_name).strip('_')
    lines = [
        "# pylint: disable=import-error",
        "import pytest",
        "from pytest_bdd import given, parsers, scenarios, then, when",
        "",
        "from business_components.web_components.login import login_to_application_sso",
        "from object_repository.pages.HomePage import HomePage",
        "from utilities.genericUtils import CustomPyAutoWeb",
        "from utilities.helper import load_test_data_from_json",
        "",
        'json_data = load_test_data_from_json("../../testData/testData.json")',
        "",
        f'scenarios("../../features/{safe_class.lower()}.feature")',
        "",
        "",
        "@given(\"Login to the application with system administrator access\")",
        "def login_with_admin_access(bdd_driver):",
        "    try:",
        "        login_to_application_sso(bdd_driver)",
        "    except Exception as e:",
        "        raise AssertionError(f\"Step FAILED: Login - Details: {e}\") from e",
        "",
        "",
        "@when(\"Navigate to the module under test\")",
        "def navigate_to_module(bdd_driver):",
        "    try:",
        "        CustomPyAutoWeb(bdd_driver).click_wait_locator(locatorList=HomePage.locatorAdministrationBtn)",
        "    except Exception as e:",
        "        raise AssertionError(f\"Step FAILED: Navigate - Details: {e}\") from e",
        "",
        "",
        "@then(parsers.parse(\"The landing page should be displayed '{testData}'\"))",
        "@pytest.mark.parametrize('testData', json_data.keys())",
        "def verify_landing_page(bdd_driver, testData):",
        "    try:",
        "        test_data = json_data.get(testData, {})",
        "        pass",
        "    except Exception as e:",
        "        raise AssertionError(f\"Step FAILED: Landing page - Details: {e}\") from e",
        "",
    ]

    steps_added = set()
    for tc in tcs:
        for step_text in _infer_steps(tc["summary"]):
            keyword = step_text.split(" ")[0].lower()
            body = step_text[len(keyword):].strip()
            if body in steps_added:
                continue
            steps_added.add(body)
            func_name = re.sub(r"[^a-z0-9]+", "_", body.lower().replace("'<testdata>'", "").strip()).strip("_")
            decorator = {"given": "@given", "when": "@when", "then": "@then", "and": "@then"}.get(keyword, "@then")
            has_param = "'<testData>'" in step_text
            if has_param:
                lines.append(f"{decorator}(parsers.parse(\"{body}\"))")
                lines.append(f"@pytest.mark.parametrize('testData', json_data.keys())")
                lines.append(f"def {func_name}(bdd_driver, testData):")
                lines.append(f"    try:")
                lines.append(f"        test_data = json_data.get(testData, {{}})")
                lines.append(f"        # TODO: implement - {body}")
                lines.append(f"        pass")
                lines.append(f"    except Exception as e:")
                lines.append(f"        raise AssertionError(f\"Step FAILED: {body} - Details: {{e}}\") from e")
            else:
                lines.append(f"{decorator}(\"{body}\")")
                lines.append(f"def {func_name}(bdd_driver):")
                lines.append(f"    try:")
                lines.append(f"        # TODO: implement - {body}")
                lines.append(f"        pass")
                lines.append(f"    except Exception as e:")
                lines.append(f"        raise AssertionError(f\"Step FAILED: {body} - Details: {{e}}\") from e")
            lines.append("")

    return "\n".join(lines)
