#!/bin/bash

echo "=================================================="
echo "🔍 Verifying Kafka Alerts to Timeline Flow"
echo "=================================================="
echo ""

# Check backend is running
echo "1. Checking backend status..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "   ✅ Backend is running (PID: $(pgrep -f 'node.*server.js'))"
else
    echo "   ❌ Backend is NOT running!"
    echo "   Start it with: cd authService && npm start"
    exit 1
fi
echo ""

# Check backend logs for alert processing
echo "2. Checking backend alert processing..."
ALERT_COUNT=$(grep -c "\[ALERT\]" /tmp/backend-restart.log 2>/dev/null || echo "0")
if [ "$ALERT_COUNT" -gt 0 ]; then
    echo "   ✅ Backend has processed $ALERT_COUNT alerts"
    echo ""
    echo "   Recent alerts:"
    grep "\[ALERT\]" /tmp/backend-restart.log 2>/dev/null | tail -5 | sed 's/^/   /'
else
    echo "   ⚠️  No alerts processed yet (might take a few seconds)"
fi
echo ""

# Check frontend is running
echo "3. Checking frontend status..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Frontend is running (http://localhost:3000)"
else
    echo "   ⚠️  Frontend might not be running"
    echo "   Start it with: cd frontend && npm start"
fi
echo ""

# Check Kafka connectivity
echo "4. Checking Kafka connectivity..."
KAFKA_BROKER="192.168.1.246:9092"
if timeout 2 bash -c "</dev/tcp/192.168.1.246/9092" 2>/dev/null; then
    echo "   ✅ Kafka broker reachable ($KAFKA_BROKER)"
else
    echo "   ❌ Cannot reach Kafka broker ($KAFKA_BROKER)"
fi
echo ""

echo "=================================================="
echo "📋 What to check in browser:"
echo "=================================================="
echo ""
echo "1. Open http://localhost:3000 and login"
echo "2. Navigate to Timeline page"
echo "3. Open browser console (F12)"
echo ""
echo "Expected console output:"
echo "   ✅✅✅ Socket.IO connected: <socket-id>"
echo "   ✅✅✅ Socket.IO authenticated: { userId: '...', ... }"
echo "   🚨 RECEIVED ALERT FROM SOCKET.IO: { ... }"
echo "   ✅ Alert dispatched to Redux store"
echo ""
echo "Expected Timeline UI:"
echo "   • Timeline chart with horizontal bars"
echo "   • Grouped Events table with alert names"
echo "   • Event counts and latest timestamps"
echo ""
echo "=================================================="
echo "🎯 Alert Types You Should See:"
echo "=================================================="
echo ""
grep "\[ALERT\]" /tmp/backend-restart.log 2>/dev/null | \
    awk -F' - ' '{print $2}' | \
    awk '{print $1}' | \
    sort | uniq -c | \
    sed 's/^/   /'
echo ""
echo "=================================================="
echo "✅ If you see alerts in browser console and Timeline,"
echo "   the integration is working correctly!"
echo "=================================================="
