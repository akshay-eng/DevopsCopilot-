#!/bin/bash
# Start Backend Server with Socket.IO and Kafka

echo "🚀 Starting DevOps Copilot Backend with WebSocket & Kafka"
echo "==========================================================="

# Check if server-with-socketio.js exists
if [ ! -f "server-with-socketio.js" ]; then
  echo "❌ server-with-socketio.js not found!"
  exit 1
fi

# Backup original server.js if it exists
if [ -f "server.js" ] && [ ! -f "server-old.js" ]; then
  echo "📁 Backing up original server.js to server-old.js..."
  cp server.js server-old.js
fi

# Copy new server
echo "📝 Using server-with-socketio.js..."
cp server-with-socketio.js server.js

# Start server
echo "🎯 Starting server on port ${PORT:-5001}..."
echo ""

node server.js
