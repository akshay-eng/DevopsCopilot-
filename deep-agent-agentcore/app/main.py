"""
DevOps Copilot Deep Agent — AWS Bedrock AgentCore Edition.

This is a dual-mode application:
1. **Standalone FastAPI mode** (default): Runs as a FastAPI server on port 8100,
   same interface as the original deep-agent. Compatible with the existing
   authService proxy and frontend.
2. **AgentCore Runtime mode**: When deployed via AWS Bedrock AgentCore Runtime,
   uses BedrockAgentCoreApp with @app.entrypoint for managed deployment,
   auto-scaling, and built-in identity/gateway features.

Set RUN_MODE=agentcore in .env to use AgentCore Runtime mode.
"""
import os
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RUN_MODE = os.getenv("RUN_MODE", "fastapi")


def create_fastapi_app():
    """Create the standard FastAPI application (default mode)."""
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from app.api.routes import router

    app = FastAPI(
        title="DevOps Copilot Deep Agent (AgentCore)",
        version="1.0.0",
        description="AI agent with AWS Bedrock AgentCore Memory integration",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    @app.get("/health")
    async def health():
        from app.config import settings
        return {
            "status": "ok",
            "service": "deep-agent-agentcore",
            "mode": "fastapi",
            "memory_enabled": bool(settings.agentcore_memory_id),
            "default_provider": settings.default_model_provider,
        }

    @app.on_event("startup")
    async def startup():
        from app.config import settings
        from app.memory.manager import AgentCoreMemoryManager

        if settings.agentcore_memory_id:
            memory_mgr = AgentCoreMemoryManager(
                memory_id=settings.agentcore_memory_id,
                region=settings.agentcore_memory_region,
            )
            await memory_mgr.setup_memory()
            logger.info("AgentCore Memory initialized")
        else:
            logger.info("Running without AgentCore Memory (SQLite-only mode)")

    return app


def create_agentcore_app():
    """Create the BedrockAgentCoreApp for managed runtime deployment.

    This mode provides:
    - Managed deployment on AWS
    - Built-in API Gateway with auth
    - Auto-scaling
    - Identity management
    - Direct integration with AgentCore services
    """
    try:
        from bedrock_agentcore import BedrockAgentCoreApp
    except ImportError:
        logger.error("bedrock-agentcore not installed. Install with: pip install bedrock-agentcore")
        raise

    from app.config import settings
    from app.agent.graph import create_agent_graph
    from app.agent.model_factory import create_llm
    from app.agent.system_prompt import get_system_prompt
    from app.tools import get_all_tools
    from app.memory.manager import AgentCoreMemoryManager

    agentcore_app = BedrockAgentCoreApp()
    memory_manager = AgentCoreMemoryManager(
        memory_id=settings.agentcore_memory_id,
        region=settings.agentcore_memory_region,
    )

    @agentcore_app.entrypoint
    async def handle_request(request, context):
        """Main AgentCore entrypoint.

        Receives requests from AgentCore Gateway, processes them through
        the LangGraph agent with memory, and returns the response.
        """
        message = request.get("message", "")
        model_provider = request.get("modelProvider", settings.default_model_provider)
        cluster_id = request.get("clusterId", "")
        conversation_id = request.get("conversationId", "")

        # Get user/session from AgentCore context
        user_id = getattr(context, "user_id", "anonymous")
        session_id = getattr(context, "session_id", memory_manager.generate_session_id(conversation_id))

        if not message.strip():
            return {"error": "Message cannot be empty"}

        # Retrieve memory context
        memory_context = await memory_manager.get_memory_context(
            user_id=user_id,
            session_id=session_id,
            query=message,
        )

        # Build agent
        llm = create_llm(model_provider, settings)
        tools = get_all_tools(enable_write=settings.enable_write_tools)
        graph = create_agent_graph(tools, llm)

        from langchain_core.messages import HumanMessage, SystemMessage
        system_prompt = get_system_prompt(cluster_id, memory_context)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=message),
        ]

        state = {
            "messages": messages,
            "user_id": user_id,
            "cluster_id": cluster_id,
            "model_provider": model_provider,
            "session_id": session_id,
            "memory_context": memory_context,
        }

        # Run graph
        result = await graph.ainvoke(state)
        final_messages = result.get("messages", [])
        response_content = ""
        tool_calls_log = []

        for msg in final_messages:
            if hasattr(msg, "content") and isinstance(msg.content, str):
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        tool_calls_log.append({"tool": tc.get("name", ""), "output": ""})
                elif msg.type == "ai":
                    response_content = msg.content

        # Store in memory
        await memory_manager.store_conversation(
            user_id=user_id,
            session_id=session_id,
            user_message=message,
            assistant_response=response_content,
            tool_calls=tool_calls_log,
        )

        return {
            "response": response_content,
            "toolCalls": tool_calls_log,
            "sessionId": session_id,
        }

    return agentcore_app


# Create the appropriate app based on RUN_MODE
if RUN_MODE == "agentcore":
    app = create_agentcore_app()
else:
    app = create_fastapi_app()
