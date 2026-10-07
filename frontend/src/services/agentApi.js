import { backendApi } from './api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/**
 * Send a message to the deep agent and return an SSE reader.
 * The caller should read from the reader and parse SSE events.
 */
export async function sendAgentMessage({ message, conversationId, modelProvider, clusterId }) {
  const token = localStorage.getItem('token');

  const response = await fetch(`${API_URL}/api/agent/ops`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      conversationId,
      modelProvider: modelProvider || 'bedrock',
      clusterId: clusterId || '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent request failed: ${response.status}`);
  }

  return response.body.getReader();
}

/**
 * Parse SSE events from a ReadableStream chunk.
 */
export function parseSSEEvents(text) {
  const events = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        events.push(data);
      } catch {
        // Skip malformed JSON
      }
    }
  }
  return events;
}

/**
 * Get all conversations for the current user.
 */
export async function getConversations(limit = 50) {
  const response = await backendApi.get(`/api/agent/conversations?limit=${limit}`);
  return response.data;
}

/**
 * Get messages for a specific conversation.
 */
export async function getConversation(conversationId) {
  const response = await backendApi.get(`/api/agent/conversations/${conversationId}`);
  return response.data;
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(conversationId) {
  const response = await backendApi.delete(`/api/agent/conversations/${conversationId}`);
  return response.data;
}
