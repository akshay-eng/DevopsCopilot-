from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # LLM Configuration
    default_model_provider: str = "anthropic"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o"

    # Google Gemini
    google_api_key: str = ""
    gemini_model: str = "gemini-2.5-pro"

    # vLLM (self-hosted, OpenAI-compatible) — replaces Gemini
    vllm_base_url: str = "http://172.17.65.184:8000/v1"
    vllm_model: str = "qwopus3.5-9b-v3"
    vllm_api_key: str = "EMPTY"

    # AWS Bedrock
    bedrock_model: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    bedrock_region: str = "us-east-1"

    # Infrastructure
    prometheus_url: str = "http://192.168.1.5:32738"
    kubeconfig_path: str = ""

    # AuthService integration
    auth_service_url: str = "http://localhost:5001"
    jwt_secret: str = ""

    # AWS AgentCore Memory
    agentcore_memory_id: str = ""
    agentcore_memory_region: str = "us-east-1"

    # Conversation store (fallback SQLite)
    db_path: str = "./conversations.db"

    # Milvus Vector DB
    milvus_host: str = "192.168.1.5"
    milvus_port: str = "19530"
    embedding_model: str = "all-MiniLM-L6-v2"

    # Safety
    enable_write_tools: bool = True
    bash_blocked_commands: List[str] = [
        "rm -rf /", "rm -rf ~", "rm -rf .",
        "shutdown", "reboot", "mkfs", "dd if=",
        "> /dev/sd", ":(){ :|:", "chmod -R 777 /",
    ]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
