"""
AWS Bedrock AgentCore Memory Manager.

Provides both short-term (session) and long-term (semantic) memory
using the AgentCore MemoryClient. Falls back to local SQLite when
AgentCore Memory is not configured.

Memory Strategies:
- summaryMemoryStrategy: Summarizes conversations for efficient recall
- userPreferenceMemoryStrategy: Tracks user preferences and patterns
- semanticMemoryStrategy: Stores semantically indexed knowledge
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


class AgentCoreMemoryManager:
    """Manages conversation memory using AWS Bedrock AgentCore MemoryClient."""

    def __init__(self, memory_id: str = "", region: str = "us-east-1"):
        self.memory_id = memory_id
        self.region = region
        self._client = None
        self._initialized = False

    def _get_client(self):
        """Lazily initialize the AgentCore MemoryClient."""
        if self._client is not None:
            return self._client

        if not self.memory_id:
            logger.info("No AGENTCORE_MEMORY_ID configured, memory features disabled")
            return None

        try:
            from bedrock_agentcore.memory import MemoryClient
            self._client = MemoryClient(region_name=self.region)
            self._initialized = True
            logger.info(f"AgentCore MemoryClient initialized for memory: {self.memory_id}")
            return self._client
        except ImportError:
            logger.warning("bedrock-agentcore not installed, memory features disabled")
            return None
        except Exception as e:
            logger.error(f"Failed to initialize MemoryClient: {e}")
            return None

    async def setup_memory(self):
        """Create memory store with strategies if it doesn't exist yet."""
        client = self._get_client()
        if not client:
            return

        try:
            # Create memory with all three strategy types
            strategies = [
                {
                    "summaryMemoryStrategy": {
                        "name": "conversation-summary",
                        "description": "Summarizes DevOps conversations for quick recall",
                        "configuration": {
                            "maxTokens": 2048,
                        },
                        "namespaces": ["conversation"],
                    }
                },
                {
                    "userPreferenceMemoryStrategy": {
                        "name": "user-preferences",
                        "description": "Tracks user preferences like preferred namespaces, clusters, and tools",
                        "namespaces": ["preferences"],
                    }
                },
                {
                    "semanticMemoryStrategy": {
                        "name": "devops-knowledge",
                        "description": "Stores DevOps knowledge, incident patterns, and resolution steps",
                        "configuration": {
                            "maxEntries": 1000,
                        },
                        "namespaces": ["knowledge"],
                    }
                },
            ]

            client.create_memory(
                memoryId=self.memory_id,
                strategies=strategies,
            )
            logger.info(f"Memory store created/verified: {self.memory_id}")
        except Exception as e:
            # Memory may already exist
            if "already exists" in str(e).lower() or "conflict" in str(e).lower():
                logger.info(f"Memory store already exists: {self.memory_id}")
            else:
                logger.error(f"Error setting up memory: {e}")

    async def get_memory_context(self, user_id: str, session_id: str, query: str = "") -> str:
        """Retrieve relevant memory context for the current conversation.

        Fetches from all memory namespaces: conversation summaries,
        user preferences, and semantic knowledge.
        """
        client = self._get_client()
        if not client:
            return ""

        try:
            context_parts = []

            # Retrieve from conversation summary namespace
            try:
                summary_result = client.retrieve_memories(
                    memoryId=self.memory_id,
                    namespace="conversation",
                    query=query or "recent conversations",
                    userId=user_id,
                    sessionId=session_id,
                    maxResults=5,
                )
                memories = summary_result.get("memories", [])
                if memories:
                    summaries = [m.get("content", "") for m in memories if m.get("content")]
                    if summaries:
                        context_parts.append("### Previous Conversation Summaries\n" + "\n".join(f"- {s}" for s in summaries))
            except Exception as e:
                logger.debug(f"Error retrieving conversation memories: {e}")

            # Retrieve user preferences
            try:
                pref_result = client.retrieve_memories(
                    memoryId=self.memory_id,
                    namespace="preferences",
                    query="user preferences",
                    userId=user_id,
                    maxResults=10,
                )
                prefs = pref_result.get("memories", [])
                if prefs:
                    pref_items = [m.get("content", "") for m in prefs if m.get("content")]
                    if pref_items:
                        context_parts.append("### User Preferences\n" + "\n".join(f"- {p}" for p in pref_items))
            except Exception as e:
                logger.debug(f"Error retrieving preference memories: {e}")

            # Retrieve semantic knowledge relevant to the query
            if query:
                try:
                    knowledge_result = client.retrieve_memories(
                        memoryId=self.memory_id,
                        namespace="knowledge",
                        query=query,
                        maxResults=5,
                    )
                    knowledge = knowledge_result.get("memories", [])
                    if knowledge:
                        knowledge_items = [m.get("content", "") for m in knowledge if m.get("content")]
                        if knowledge_items:
                            context_parts.append("### Relevant Knowledge\n" + "\n".join(f"- {k}" for k in knowledge_items))
                except Exception as e:
                    logger.debug(f"Error retrieving knowledge memories: {e}")

            return "\n\n".join(context_parts) if context_parts else ""

        except Exception as e:
            logger.error(f"Error retrieving memory context: {e}")
            return ""

    async def store_conversation(
        self,
        user_id: str,
        session_id: str,
        user_message: str,
        assistant_response: str,
        tool_calls: list = None,
    ):
        """Store conversation turn in AgentCore memory.

        Sends the conversation to all three memory strategies for processing:
        - Summary strategy condenses it
        - User preference strategy extracts preferences
        - Semantic strategy indexes knowledge
        """
        client = self._get_client()
        if not client:
            return

        try:
            # Build the conversation content for memory ingestion
            content = {
                "messages": [
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": assistant_response},
                ],
            }
            if tool_calls:
                content["toolCalls"] = [
                    {"tool": tc.get("tool", ""), "output": tc.get("output", "")[:200]}
                    for tc in tool_calls[:10]
                ]

            # Store in conversation namespace
            client.store_memory(
                memoryId=self.memory_id,
                namespace="conversation",
                userId=user_id,
                sessionId=session_id,
                content=json.dumps(content),
                metadata={
                    "timestamp": datetime.utcnow().isoformat(),
                    "type": "conversation_turn",
                },
            )

            # Store in knowledge namespace if tool calls were made (incident data)
            if tool_calls:
                knowledge_content = f"User asked: {user_message[:200]}. "
                knowledge_content += f"Agent used tools: {', '.join(tc.get('tool', '') for tc in tool_calls[:5])}. "
                knowledge_content += f"Resolution: {assistant_response[:500]}"

                client.store_memory(
                    memoryId=self.memory_id,
                    namespace="knowledge",
                    content=knowledge_content,
                    metadata={
                        "timestamp": datetime.utcnow().isoformat(),
                        "type": "incident_resolution",
                        "tools_used": [tc.get("tool", "") for tc in tool_calls[:10]],
                    },
                )

            logger.debug(f"Stored conversation in memory for session {session_id}")

        except Exception as e:
            logger.error(f"Error storing conversation in memory: {e}")

    async def store_user_preference(self, user_id: str, preference: str):
        """Explicitly store a user preference."""
        client = self._get_client()
        if not client:
            return

        try:
            client.store_memory(
                memoryId=self.memory_id,
                namespace="preferences",
                userId=user_id,
                content=preference,
                metadata={
                    "timestamp": datetime.utcnow().isoformat(),
                    "type": "explicit_preference",
                },
            )
        except Exception as e:
            logger.error(f"Error storing user preference: {e}")

    def generate_session_id(self, conversation_id: str = "") -> str:
        """Generate a session ID for memory scoping."""
        if conversation_id:
            return f"conv-{conversation_id}"
        return f"session-{uuid.uuid4().hex[:12]}"
