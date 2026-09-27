from abc import ABC, abstractmethod
from typing import Optional


class BaseAIModel(ABC):
    """
    Base interface every AI model must implement.
    Add a new model by subclassing this and registering it in model_registry.py.
    """

    @abstractmethod
    def analyze_coverage(self, jira_tcs: list, feature_scenarios: list) -> dict:
        """
        Given a list of Jira TCs and existing feature file scenarios,
        perform flow-wise gap analysis and return structured result.
        """
        pass

    @abstractmethod
    def generate_feature_file(self, flow_name: str, tcs: list, existing_patterns: str = "") -> str:
        """
        Generate a complete BDD .feature file for the given uncovered flow and TCs.
        existing_patterns: sample from the team's existing feature files for style reference.
        """
        pass

    @abstractmethod
    def generate_stepdef_file(self, flow_name: str, tcs: list, existing_patterns: str = "") -> str:
        """
        Generate a complete pytest-bdd step definition .py file.
        existing_patterns: sample from the team's existing step definition files.
        """
        pass

    @abstractmethod
    def generate_test_data(self, tcs: list, existing_json_sample: str = "") -> dict:
        """
        Generate JSON test data entries for each uncovered TC.
        existing_json_sample: a sample of the team's existing testData.json for key/format reference.
        """
        pass

    @abstractmethod
    def model_name(self) -> str:
        """Human-readable model name shown in the UI."""
        pass
