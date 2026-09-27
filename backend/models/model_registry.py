from models.base_model import BaseAIModel
from models.claude_model import ClaudeModel
from models.gemini_model import GeminiModel

SUPPORTED_MODELS = ["claude", "gemini"]


def get_model(model_name: str, api_key: str) -> BaseAIModel:
    """
    Return an instantiated AI model by name.

    Usage:
        model = get_model("claude", "sk-ant-...")
        result = model.analyze_coverage(jira_tcs, feature_scenarios)

    To add a new model:
        1. Create models/your_model.py subclassing BaseAIModel
        2. Add it to the dict below
    """
    registry = {
        "claude": ClaudeModel,
        "gemini": GeminiModel,
    }

    model_cls = registry.get(model_name.lower())
    if not model_cls:
        raise ValueError(f"Unknown model '{model_name}'. Supported: {SUPPORTED_MODELS}")

    return model_cls(api_key=api_key)


def list_models() -> list:
    return [
        {"id": "claude",  "name": "Claude (Anthropic)", "description": "Recommended — best for code generation and BDD script writing"},
        {"id": "gemini",  "name": "Gemini (Google)",    "description": "Alternative — strong at structured analysis"},
    ]
