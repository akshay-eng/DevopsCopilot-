# AgentOps Test Agent - Integration Guide

This folder contains a LangGraph agent configured to work with AgentOps monitoring.

## Current Status

Your test agent is running successfully! However, it's trying to connect to the **official AgentOps cloud** (app.agentops.ai) instead of your **local DevOps Copilot instance**.

## Two Options for Integration

### Option 1: Use Official AgentOps Cloud (Recommended for Testing)

To see your agent data in the official AgentOps dashboard:

1. **Sign up for AgentOps**:
   - Go to https://app.agentops.ai
   - Create a free account
   - Create a new project

2. **Get your API key**:
   - In the AgentOps dashboard, go to Settings → API Keys
   - Copy your API key (format: `ao_xxxxxxxxxxxxxx`)

3. **Update your .env file**:
   ```bash
   # Official AgentOps Cloud
   AGENTOPS_API_KEY=ao_your_actual_api_key_here
   OPENAI_API_KEY=your_openai_key
   ```

4. **Run your agent**:
   ```bash
   python test.py
   ```

5. **View in dashboard**:
   - Go to https://app.agentops.ai/sessions
   - You'll see all traces, LLM calls, tool usage, costs, and performance metrics

**Pros**:
- Full-featured AgentOps dashboard
- No local infrastructure needed
- Real-time updates
- Advanced analytics

**Cons**:
- Data goes to external service
- Requires internet connection

---

### Option 2: Use Your Local DevOps Copilot Instance

To see agent data in **your own** DevOps Copilot web app (http://localhost:3000):

#### Step 1: Configure Agent for Local Instance

Update your `.env`:
```bash
# Local DevOps Copilot Instance
AGENTOPS_API_KEY=ao_10c830c6524940c3f7fcc0f6792e015a
AGENTOPS_ENDPOINT=http://localhost:8000/api/v1/events
OPENAI_API_KEY=your_openai_key
```

#### Step 2: Modify Agent Code

The AgentOps Python SDK doesn't fully support custom endpoints in the latest version. You need to either:

**Option A: Use an older version of agentops**
```bash
pip install agentops==0.2.5
```

**Option B: Send data directly to your API**

Create a custom integration:

```python
import requests
import json
from datetime import datetime

class LocalAgentOpsClient:
    def __init__(self, endpoint, api_key):
        self.endpoint = endpoint
        self.api_key = api_key
        self.session_id = None

    def start_session(self, tags=None):
        """Start a new session"""
        self.session_id = str(uuid.uuid4())
        data = {
            "session_id": self.session_id,
            "init_timestamp": datetime.utcnow().isoformat(),
            "tags": tags or []
        }
        requests.post(f"{self.endpoint}/sessions", json=data)
        return self.session_id

    def record_llm_event(self, model, prompt, response, cost):
        """Record an LLM call"""
        data = {
            "session_id": self.session_id,
            "event_type": "llm",
            "model": model,
            "prompt": prompt,
            "response": response,
            "cost": cost,
            "timestamp": datetime.utcnow().isoformat()
        }
        requests.post(f"{self.endpoint}/events", json=data)

    def end_session(self, end_state="Success"):
        """End the session"""
        data = {
            "session_id": self.session_id,
            "end_timestamp": datetime.utcnow().isoformat(),
            "end_state": end_state
        }
        requests.post(f"{self.endpoint}/sessions/end", json=data)

# Usage in your agent:
local_agentops = LocalAgentOpsClient(
    endpoint="http://localhost:8000/api/v1",
    api_key="ao_10c830c6524940c3f7fcc0f6792e015a"
)

local_agentops.start_session(tags=["langgraph", "devops-copilot"])
# ... run your agent ...
local_agentops.record_llm_event(...)
local_agentops.end_session()
```

#### Step 3: View in Your Dashboard

1. Start your DevOps Copilot:
   ```bash
   # Make sure Docker containers are running
   docker ps | grep agentops

   # Start frontend if needed
   cd frontend && npm start
   ```

2. Open your browser:
   - Go to http://localhost:3000
   - Navigate to "AI Workloads" → "Sessions"
   - You'll see your agent sessions with full traces

**Pros**:
- Data stays local
- Full control over infrastructure
- Can customize the dashboard
- No external dependencies

**Cons**:
- Requires local infrastructure
- Need to implement custom integration for latest AgentOps SDK

---

## Current Issues in Your Test Run

From your output:
```
🖇 AgentOps: Failed to get JWT token: Cannot connect to host api.agentops.ai:443 ssl:True
[SSLCertVerificationError: (1, '[SSL: CERTIFICATE_VERIFY_FAILED]')]
```

This happens because:
1. The AgentOps SDK is trying to connect to the official cloud
2. SSL certificate verification is failing (common on corporate networks/VPNs)
3. Your API key might not be valid for the official service

### Quick Fix for SSL Issue

If you want to use the official AgentOps cloud, you can bypass SSL verification (not recommended for production):

```python
import ssl
import certifi
import os

# Set SSL cert file
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# Then initialize agentops
import agentops
agentops.init(api_key="your_key")
```

Or install certificates:
```bash
# On macOS
/Applications/Python\ 3.x/Install\ Certificates.command

# Or install certifi
pip install --upgrade certifi
```

---

## Recommended Next Steps

1. **For Quick Demo**: Use Option 1 (Official AgentOps Cloud)
   - Sign up at https://app.agentops.ai
   - Get a real API key
   - Update your `.env`
   - See your agent in their dashboard

2. **For Production Use**: Use Option 2 (Local Instance)
   - Implement custom integration
   - Keep data local
   - Full control

3. **Best of Both Worlds**: Use both!
   - Test with official cloud for features
   - Deploy with local instance for production

---

## What You'll See in AgentOps Dashboard

Once connected properly, you'll see:

### 1. **Sessions/Traces**
- List of all agent runs
- Start/end times
- Success/failure status
- Tags for filtering

### 2. **Events Timeline**
- Every LLM call with prompts and responses
- Tool executions (weather, calculator)
- Timestamps and durations
- Error events

### 3. **Analytics**
- Total cost per session
- Token usage (prompt + completion)
- Average latency
- Success/failure rates
- Cost over time
- Duration distribution

### 4. **Performance Metrics**
- Spans per trace (LLM + tool calls)
- Duration metrics (min/max/avg)
- Cost breakdown
- Failed traces analysis

### 5. **Agent Insights**
- Which tools are used most
- LLM model usage
- Response times
- Cost per tool/model

---

## Example: What Your Test Agent Does

From your `test.py` output:

```python
Query: What's the weather in New York and Tokyo?
# → Calls get_weather tool twice
# → AgentOps records: 2 tool calls, 1 LLM call, tokens used, cost

Query: Calculate 25 * 4 + 10
# → Calls calculator tool once
# → AgentOps records: 1 tool call, 1 LLM call, result

Query: What's the weather in Paris? Also calculate 100/5
# → Calls both tools
# → AgentOps records: 2 tool calls, 2 LLM calls, combined cost
```

All of this creates a **complete trace** that you can:
- Debug (see exact prompts/responses)
- Analyze (costs, latency)
- Optimize (slow tools, expensive calls)
- Monitor (success rates, errors)

---

## Need Help?

Check these resources:
- AgentOps Docs: https://docs.agentops.ai
- LangGraph Docs: https://langchain-ai.github.io/langgraph/
- Your local DevOps Copilot: http://localhost:3000

## Files in This Folder

- `test.py` - Your LangGraph agent with AgentOps integration
- `.env` - Environment variables (API keys)
- `README.md` - This file

---

**Current Project ID** (from your local DB): `<your-agentops-api-key>`
**Current API Key** (for local instance): `ao_10c830c6524940c3f7fcc0f6792e015a`
