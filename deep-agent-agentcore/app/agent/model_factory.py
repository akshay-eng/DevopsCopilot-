from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from app.config import Settings


class ChatOpenAIWithReasoning(ChatOpenAI):
    """ChatOpenAI variant that preserves the OpenAI-compatible ``reasoning`` field.

    vLLM (run with ``--reasoning-parser``) returns the model's chain-of-thought in a
    separate ``reasoning`` field rather than inside ``content``. The stock ChatOpenAI
    drops provider reasoning fields, so we copy it into ``additional_kwargs['reasoning']``
    so the API layer can stream it to the UI as a collapsible "Thinking" block.
    """

    def _create_chat_result(self, response, generation_info=None):
        # Non-streaming path.
        result = super()._create_chat_result(response, generation_info)
        try:
            if isinstance(response, dict):
                choices = response.get("choices") or []
            else:
                choices = (response.model_dump(warnings=False) or {}).get("choices") or []
            for gen, choice in zip(result.generations, choices):
                msg = (choice or {}).get("message") or {}
                reasoning = msg.get("reasoning") or msg.get("reasoning_content")
                if reasoning:
                    gen.message.additional_kwargs["reasoning"] = reasoning
        except Exception:
            # Reasoning is best-effort; never fail the response over it.
            pass
        return result

    def _convert_chunk_to_generation_chunk(self, chunk, default_chunk_class, base_generation_info):
        # Streaming path (used when streaming=True, incl. .invoke() which streams
        # internally). Each delta's `reasoning` is stashed into additional_kwargs;
        # langchain concatenates these string values as chunks are aggregated.
        gen_chunk = super()._convert_chunk_to_generation_chunk(
            chunk, default_chunk_class, base_generation_info
        )
        try:
            choices = chunk.get("choices") or chunk.get("chunk", {}).get("choices", [])
            if gen_chunk is not None and choices:
                delta = choices[0].get("delta") or {}
                reasoning = delta.get("reasoning") or delta.get("reasoning_content")
                if reasoning:
                    gen_chunk.message.additional_kwargs["reasoning"] = reasoning
        except Exception:
            pass
        return gen_chunk


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
    elif provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.google_api_key,
            streaming=True,
            temperature=0.1,
        )
    elif provider == "vllm":
        # Self-hosted vLLM exposes an OpenAI-compatible API, so we reuse the
        # ChatOpenAI client and just point it at the vLLM base_url. Temperature
        # 0.6 follows the model's recommended sampling for reasoning output.
        # ChatOpenAIWithReasoning also surfaces the model's <think> reasoning.
        return ChatOpenAIWithReasoning(
            model=settings.vllm_model,
            api_key=settings.vllm_api_key,
            base_url=settings.vllm_base_url,
            streaming=True,
            temperature=0.6,
        )
    elif provider == "bedrock":
        from langchain_aws import ChatBedrockConverse
        return ChatBedrockConverse(
            model=settings.bedrock_model,
            region_name=settings.bedrock_region,
            max_tokens=8192,
            temperature=0.1,
        )
    else:
        raise ValueError(f"Unknown provider: {provider}. Use 'anthropic', 'openai', 'gemini', 'vllm', or 'bedrock'.")
