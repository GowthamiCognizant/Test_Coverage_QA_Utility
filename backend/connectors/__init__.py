"""
connectors/ — Input layer adapters.

Every connector returns test cases in the SAME dict shape that
file_parser._extract_tcs_from_df() produces:

    {"key", "summary", "description", "component", "priority",
     "label", "status", "source"}

That contract is what lets Agent 1 (coverage analysis) and Agent 2
(script generation) run unchanged whether the data came from an
Excel upload, the Jira REST API, or QMetry.
"""

from connectors.jira_client import JiraClient, JiraError
from connectors.qmetry_client import QMetryClient, QMetryError

__all__ = ["JiraClient", "JiraError", "QMetryClient", "QMetryError"]
