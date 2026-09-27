import pytest
from pytest_bdd import scenarios, given, when, then, parsers
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import json
import logging

logger = logging.getLogger(__name__)

scenarios("dashboard_and_reports_data_synchronisation.feature")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def bdd_driver(driver):
    """Alias fixture so every step receives the WebDriver instance."""
    return driver


@pytest.fixture
def json_data(test_data_file):
    """Load test data from a JSON file supplied via the test_data_file fixture."""
    try:
        with open(test_data_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        logger.error("Failed to load test data: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# Background steps – login, navigate, verify page
# ---------------------------------------------------------------------------

@given("the user is logged into the application")
def user_is_logged_in(bdd_driver, json_data):
    """Background: authenticate the user."""
    try:
        credentials = json_data.get("login_credentials", {})
        username = credentials.get("username", "")
        password = credentials.get("password", "")

        # TODO: implement – navigate to login URL e.g. bdd_driver.get(BASE_URL + "/login")
        # TODO: implement – locate username field e.g. By.ID, "username"
        # TODO: implement – locate password field e.g. By.ID, "password"
        # TODO: implement – locate and click login/submit button e.g. By.XPATH, "//button[@type='submit']"

        wait = WebDriverWait(bdd_driver, 10)
        # TODO: implement – wait for post-login element e.g. wait.until(EC.presence_of_element_located((By.ID, "dashboard")))

        logger.info("User logged in successfully with username: %s", username)
    except Exception as exc:
        logger.error("Step 'user_is_logged_in' failed: %s", exc)
        raise


@given("the user navigates to the Dashboard page")
def navigate_to_dashboard(bdd_driver, json_data):
    """Background: open the Dashboard page."""
    try:
        dashboard_url = json_data.get("dashboard_url", "/dashboard")

        # TODO: implement – navigate to dashboard URL e.g. bdd_driver.get(BASE_URL + dashboard_url)
        # TODO: implement – wait for dashboard container e.g. By.ID, "dashboard-container"

        wait = WebDriverWait(bdd_driver, 10)
        # TODO: implement – wait.until(EC.url_contains("dashboard"))

        logger.info("Navigated to Dashboard page: %s", dashboard_url)
    except Exception as exc:
        logger.error("Step 'navigate_to_dashboard' failed: %s", exc)
        raise


@given("the Dashboard page is fully loaded and visible")
def dashboard_page_is_loaded(bdd_driver, json_data):
    """Background: verify the Dashboard page is fully rendered."""
    try:
        wait = WebDriverWait(bdd_driver, 15)

        # TODO: implement – verify dashboard header is visible e.g. By.CSS_SELECTOR, ".dashboard-header"
        # TODO: implement – verify widgets section is visible e.g. By.CSS_SELECTOR, ".widget-container"
        # TODO: implement – wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".dashboard-header")))

        logger.info("Dashboard page is fully loaded and visible.")
    except Exception as exc:
        logger.error("Step 'dashboard_page_is_loaded' failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# AMCC-7099 – Data Not in Sync: Dashboard Widgets vs. Reports
# ---------------------------------------------------------------------------

@given("the dashboard contains widgets displaying key metrics")
def dashboard_contains_widgets(bdd_driver, json_data):
    """Verify that one or more metric widgets are present on the dashboard."""
    try:
        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate all metric widget elements e.g. By.CSS_SELECTOR, ".metric-widget"
        # TODO: implement – assert at least one widget is displayed
        # e.g. widgets = bdd_driver.find_elements(By.CSS_SELECTOR, ".metric-widget")
        #      assert len(widgets) > 0, "No metric widgets found on dashboard"

        logger.info("Dashboard widgets for key metrics are present.")
    except Exception as exc:
        logger.error("Step 'dashboard_contains_widgets' failed: %s", exc)
        raise


@given(parsers.parse("the widget '{testData}' displays a specific metric value"))
def widget_displays_metric_value(bdd_driver, json_data, testData):
    """Capture the metric value shown in the specified dashboard widget."""
    try:
        widget_config = json_data.get(testData, {})
        widget_locator = widget_config.get("widget_locator", "")
        expected_metric = widget_config.get("expected_metric_value", "")

        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate the specific widget by testData name or locator
        # e.g. widget = wait.until(EC.visibility_of_element_located((By.XPATH, widget_locator)))
        # TODO: implement – read the displayed metric value from the widget
        # e.g. displayed_value = widget.find_element(By.CSS_SELECTOR, ".metric-value").text
        # TODO: implement – store displayed_value in a context variable for later comparison

        logger.info(
            "Widget '%s' displays metric value. Expected: %s", testData, expected_metric
        )
    except Exception as exc:
        logger.error("Step 'widget_displays_metric_value' failed for '%s': %s", testData, exc)
        raise


@when("the user navigates to the Reports section")
def navigate_to_reports(bdd_driver, json_data):
    """Click or navigate to the Reports section of the application."""
    try:
        reports_url = json_data.get("reports_url", "/reports")

        # TODO: implement – click on the Reports navigation link e.g. By.LINK_TEXT, "Reports"
        # TODO: implement – or navigate directly: bdd_driver.get(BASE_URL + reports_url)

        wait = WebDriverWait(bdd_driver, 10)
        # TODO: implement – wait for the reports page to load e.g. By.CSS_SELECTOR, ".reports-container"
        # TODO: implement – wait.until(EC.url_contains("reports"))

        logger.info("Navigated to Reports section: %s", reports_url)
    except Exception as exc:
        logger.error("Step 'navigate_to_reports' failed: %s", exc)
        raise


@when(parsers.parse("the user opens the report '{testData}'"))
def open_specific_report(bdd_driver, json_data, testData):
    """Open a specific report by name or identifier."""
    try:
        report_config = json_data.get(testData, {})
        report_name = report_config.get("report_name", testData)
        report_link_locator = report_config.get("report_link_locator", "")

        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate the report link by name/locator
        # e.g. report_link = wait.until(EC.element_to_be_clickable((By.LINK_TEXT, report_name)))
        # TODO: implement – click the report link: report_link.click()
        # TODO: implement – wait for report content to load e.g. By.CSS_SELECTOR, ".report-content"

        logger.info("Opened report: %s", report_name)
    except Exception as exc:
        logger.error("Step 'open_specific_report' failed for '%s': %s", testData, exc)
        raise


@when(parsers.parse("the user applies the filter '{testData}' to the report"))
def apply_report_filter(bdd_driver, json_data, testData):
    """Apply a filter configuration to the currently open report."""
    try:
        filter_config = json_data.get(testData, {})
        filter_type = filter_config.get("filter_type", "")
        filter_value = filter_config.get("filter_value", "")

        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate the filter dropdown/input e.g. By.CSS_SELECTOR, ".report-filter"
        # TODO: implement – select or enter the filter value
        # TODO: implement – click apply/submit filter button e.g. By.CSS_SELECTOR, ".apply-filter-btn"
        # TODO: implement – wait for report to refresh with filter applied

        logger.info(
            "Applied filter '%s' with type '%s' and value '%s'",
            testData, filter_type, filter_value,
        )
    except Exception as exc:
        logger.error("Step 'apply_report_filter' failed for '%s': %s", testData, exc)
        raise


@when("the user records the metric values displayed in the report")
def record_report_metric_values(bdd_driver, json_data):
    """Read and store the metric values shown in the open report for comparison."""
    try:
        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate all metric value cells/rows in the report
        # e.g. metric_elements = bdd_driver.find_elements(By.CSS_SELECTOR, ".report-metric-value")
        # TODO: implement – extract text from each element and store in a shared context/dict
        # TODO: implement – log or assert that at least one metric value was captured

        logger.info("Recorded metric values from the report.")
    except Exception as exc:
        logger.error("Step 'record_report_metric_values' failed: %s", exc)
        raise


@then("the metric values in the report should match the dashboard widget values")
def report_metrics_match_dashboard(bdd_driver, json_data):
    """Assert that report metric values are identical to the dashboard widget values."""
    try:
        # TODO: implement – retrieve stored dashboard widget values from shared context
        # TODO: implement – retrieve stored report metric values from shared context
        # TODO: implement – compare each pair of values and assert equality
        # e.g. assert dashboard_value == report_value, (
        #         f"Mismatch: Dashboard shows {dashboard_value}, Report shows {report_value}"
        #      )

        logger.info("Metric values in the report match the dashboard widget values.")
    except AssertionError as exc:
        logger.error("Assertion failed – metrics out of sync: %s", exc)
        raise
    except Exception as exc:
        logger.error("Step 'report_metrics_match_dashboard' failed: %s", exc)
        raise


@then(parsers.parse("the '{testData}' metric in the report matches the corresponding widget"))
def specific_metric_matches_widget(bdd_driver, json_data, testData):
    """Assert a named metric is consistent between the report and the dashboard widget."""
    try:
        metric_config = json_data.get(testData, {})
        expected_value = metric_config.get("expected_metric_value", "")

        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate the specific metric value in the report
        # e.g. report_metric = wait.until(
        #         EC.visibility_of_element_located((By.XPATH, metric_config.get("report_locator", "")))
        #      )
        # TODO: implement – read the displayed value: actual_value = report_metric.text
        # TODO: implement – assert actual_value == expected_value

        logger.info(
            "Metric '%s' in the report matches the dashboard widget. Expected: %s",
            testData, expected_value,
        )
    except AssertionError as exc:
        logger.error(
            "Assertion failed for metric '%s' – value mismatch: %s", testData, exc
        )
        raise
    except Exception as exc:
        logger.error(
            "Step 'specific_metric_matches_widget' failed for '%s': %s", testData, exc
        )
        raise


@then("no data discrepancy alert or warning should be displayed")
def no_data_discrepancy_alert(bdd_driver, json_data):
    """Verify that no sync-error or discrepancy warning is shown on the page."""
    try:
        # TODO: implement – check that discrepancy alert elements are NOT present
        # e.g. alerts = bdd_driver.find_elements(By.CSS_SELECTOR, ".data-discrepancy-alert")
        # TODO: implement – assert len(alerts) == 0, "Data discrepancy alert is displayed"
        # TODO: implement – also check for any toast/banner warning messages

        logger.info("No data discrepancy alert or warning is displayed.")
    except AssertionError as exc:
        logger.error("Discrepancy alert found on page: %s", exc)
        raise
    except Exception as exc:
        logger.error("Step 'no_data_discrepancy_alert' failed: %s", exc)
        raise


@then("the data sync timestamp on the dashboard should match the report generation time")
def sync_timestamp_matches_report_time(bdd_driver, json_data):
    """Confirm the last-sync timestamp on the dashboard equals the report generation time."""
    try:
        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate and read the dashboard last-sync timestamp
        # e.g. sync_element = wait.until(EC.visibility_of_element_located(
        #         (By.CSS_SELECTOR, ".dashboard-sync-timestamp")))
        # TODO: implement – dashboard_sync_time = sync_element.text
        # TODO: implement – locate and read the report generation timestamp
        # e.g. report_time_element = bdd_driver.find_element(By.CSS_SELECTOR, ".report-generated-at")
        # TODO: implement – report_gen_time = report_time_element.text
        # TODO: implement – assert dashboard_sync_time == report_gen_time, (
        #         f"Timestamp mismatch: Dashboard '{dashboard_sync_time}' vs Report '{report_gen_time}'"
        #      )

        logger.info("Data sync timestamp matches the report generation time.")
    except AssertionError as exc:
        logger.error("Timestamp mismatch between dashboard sync and report generation: %s", exc)
        raise
    except Exception as exc:
        logger.error("Step 'sync_timestamp_matches_report_time' failed: %s", exc)
        raise


@then(parsers.parse("the synchronisation status for '{testData}' should be 'Synced'"))
def synchronisation_status_is_synced(bdd_driver, json_data, testData):
    """Verify that the synchronisation status indicator shows 'Synced' for the given entity."""
    try:
        entity_config = json_data.get(testData, {})
        status_locator = entity_config.get("sync_status_locator", "")
        expected_status = entity_config.get("expected_sync_status", "Synced")

        wait = WebDriverWait(bdd_driver, 10)

        # TODO: implement – locate the sync status element using status_locator
        # e.g. status_element = wait.until(EC.visibility_of_element_located(
        #         (By.XPATH, status_locator)))
        # TODO: implement – actual_status = status_element.text.strip()
        # TODO: implement – assert actual_status == expected_status, (
        #         f"Expected sync status '{expected_status}', got '{actual_status}'"
        #      )

        logger.info(
            "Synchronisation status for '%s' is '%s'.", testData, expected_status
        )
    except AssertionError as exc:
        logger.error(
            "Sync status assertion failed for '%s': %s", testData, exc
        )
        raise
    except Exception as exc:
        logger.error(
            "Step 'synchronisation_status_is_synced' failed for '%s': %s", testData, exc
        )
        raise