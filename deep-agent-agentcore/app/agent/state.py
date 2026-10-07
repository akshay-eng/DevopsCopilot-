from typing import TypedDict, Annotated, Sequence
from contextvars import ContextVar
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

# Context variables for tool access — set before graph invocation,
# readable by any tool during execution without passing as args.
auth_token_var: ContextVar[str] = ContextVar("auth_token", default="")
cluster_id_var: ContextVar[str] = ContextVar("cluster_id", default="")


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    user_id: str
    cluster_id: str
    model_provider: str
    session_id: str
    memory_context: str
    auth_token: str
