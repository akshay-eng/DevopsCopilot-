import aiosqlite
import json
import uuid
from datetime import datetime


class ConversationStore:
    """SQLite-backed conversation store. Used as fallback when AgentCore Memory
    is not configured, or as the primary conversation CRUD store alongside
    AgentCore Memory (which handles semantic/summary memory)."""

    def __init__(self, db_path: str = "./conversations.db"):
        self.db_path = db_path

    async def _init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT DEFAULT '',
                    model_provider TEXT DEFAULT 'anthropic',
                    cluster_id TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    tool_calls TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)"
            )
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id)"
            )
            await db.commit()

    async def create_conversation(self, user_id: str, title: str = "",
                                   model_provider: str = "anthropic",
                                   cluster_id: str = "") -> str:
        await self._init_db()
        conv_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO conversations (id, user_id, title, model_provider, cluster_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (conv_id, user_id, title, model_provider, cluster_id, now, now),
            )
            await db.commit()
        return conv_id

    async def save_message(self, conversation_id: str, role: str,
                           content, tool_calls: list = None):
        await self._init_db()
        msg_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        # Ensure content is a string (Gemini can return list of parts)
        if isinstance(content, list):
            content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
        if not isinstance(content, str):
            content = str(content)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO messages (id, conversation_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (msg_id, conversation_id, role, content, json.dumps(tool_calls or []), now),
            )
            await db.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id),
            )
            await db.commit()

    async def update_title(self, conversation_id: str, title: str):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE conversations SET title = ? WHERE id = ?",
                (title, conversation_id),
            )
            await db.commit()

    async def get_conversations(self, user_id: str, limit: int = 50) -> list:
        await self._init_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
                (user_id, limit),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def get_messages(self, conversation_id: str) -> list:
        await self._init_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
                (conversation_id,),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def delete_conversation(self, conversation_id: str, user_id: str) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "DELETE FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            )
            await db.execute(
                "DELETE FROM messages WHERE conversation_id = ?",
                (conversation_id,),
            )
            await db.commit()
            return cursor.rowcount > 0
