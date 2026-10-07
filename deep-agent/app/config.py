from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # LLM Configuration
    default_model_provider: str = "anthropic"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o"

    # Infrastructure
    prometheus_url: str = "http://192.168.1.5:32738"
    kubeconfig_path: str = ""

    # AuthService integration
    auth_service_url: str = "http://localhost:5001"
    jwt_secret: str = ""

    # Conversation store
    db_path: str = "./conversations.db"

    # Safety
    enable_write_tools: bool = True
    bash_blocked_commands: List[str] = [
        "rm -rf /", "rm -rf ~", "rm -rf .",
        "shutdown", "reboot", "mkfs", "dd if=",
        "> /dev/sd", ":(){ :|:", "chmod -R 777 /",
    ]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
