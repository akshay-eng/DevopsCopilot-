from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from app.config import Settings


def create_llm(provider: str, settings: Settings):
    """Create a chat model based on the selected provider."""
    if provider == "anthropic":
        return ChatAnthropic(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
            streaming=True,
            max_tokens=8192,
            temperature=0.1,
        )
    elif provider == "openai":
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            streaming=True,
            temperature=0.1,
        )
    else:
        raise ValueError(f"Unknown provider: {provider}. Use 'anthropic' or 'openai'.")
