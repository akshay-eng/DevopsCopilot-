/**
 * Minimal file-backed conversation store (JSONL per conversation).
 * Mirrors the endpoints the frontend expects from the agent backend.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CONV_DIR || path.join(__dirname, '..', '.conversations');
fs.mkdirSync(DATA_DIR, { recursive: true });

const file = (id) => path.join(DATA_DIR, `${id}.jsonl`);

export function newId() { return crypto.randomUUID(); }

export function appendMessage(conversationId, message) {
  const rec = { ...message, at: new Date().toISOString() };
  fs.appendFileSync(file(conversationId), JSON.stringify(rec) + '\n');
}

export function getMessages(conversationId) {
  try {
    return fs.readFileSync(file(conversationId), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

export function listConversations(userId, limit = 50) {
  try {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.jsonl'));
    const items = files.map((f) => {
      const id = f.replace('.jsonl', '');
      const msgs = getMessages(id);
      const first = msgs.find((m) => m.role === 'user');
      const owner = msgs[0]?.userId;
      return {
        id,
        userId: owner,
        title: (first?.content || 'Conversation').slice(0, 60),
        updatedAt: msgs[msgs.length - 1]?.at,
        messageCount: msgs.length,
      };
    }).filter((c) => !userId || c.userId === userId);
    items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return items.slice(0, limit);
  } catch { return []; }
}

export function deleteConversation(conversationId) {
  try { fs.unlinkSync(file(conversationId)); return true; } catch { return false; }
}
