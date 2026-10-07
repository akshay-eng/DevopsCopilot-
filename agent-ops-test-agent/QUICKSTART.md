# AgentOps Integration - Quick Start Guide

## Your Setup

✅ **API Key**: `<your-agentops-api-key>` (from app.agentops.ai)  
✅ **LangGraph Agent**: Ready to test  
✅ **Tools**: 4 Kubernetes/DevOps tools defined  

## Run in 3 Steps

### 1. Setup Environment

```bash
cd agent-ops-test-agent
./setup_and_run.sh
```

This will:
- Create Python virtual environment
- Install all dependencies
- Fix SSL certificate issues

### 2. Run the Agent

```bash
source .venv/bin/activate
python test_official_agentops.py
```

The agent will:
- Connect to AgentOps cloud (app.agentops.ai)
- Run 4 different DevOps scenarios
- Use LangGraph for multi-step reasoning
- Call tools: cluster status, log analysis, metrics, deployment health

### 3. View in AgentOps Dashboard

Open https://app.agentops.ai/sessions

You'll see:
- **Session List**: All your agent runs
- **Trace Timeline**: Step-by-step execution
- **LLM Calls**: Every prompt and response
- **Tool Executions**: All tool calls with parameters and results
- **Metrics**: Token usage, costs, latency
- **Analytics**: Success rates, performance trends

## What You'll See

### In the Terminal

```
🚀 LangGraph Agent with Official AgentOps Cloud Integration
================================================================================

──────────────────────────────────────────────────────────────────────────────
Scenario 1/4: Simple cluster health check
──────────────────────────────────────────────────────────────────────────────
👤 User: Check the status of my production-cluster

🤖 Agent: Your production-cluster is healthy with 5 nodes and 42 pods running...

✅ Demo Complete!
```

### In AgentOps Dashboard

1. **Sessions Page**:
   - Session ID
   - Start/end time
   - Status (Success/Fail)
   - Tags: [langgraph, kubernetes, devops-copilot]
   - Duration
   - Cost

2. **Session Details** (click any session):
   - **Timeline**: Visual flow of all events
   - **Events**: 
     - LLM calls (model: gpt-4o-mini, tokens, cost)
     - Tool calls (get_cluster_status, analyze_logs, etc.)
     - Actions (scenario_1, scenario_2, etc.)
   - **Metrics**:
     - Total tokens: ~1,500
     - Total cost: ~$0.002
     - Duration: ~8 seconds
     - Tool calls: 6-8

3. **Analytics** (across all sessions):
   - Cost over time
   - Token usage trends
   - Success/failure rates
   - Average latency
   - Tool usage frequency

## Files in This Folder

- **test_official_agentops.py** ← Main agent (connects to AgentOps cloud)
- **test_local_integration.py** - Alternative: connects to your local DevOps Copilot
- **test.py** - Your original working test
- **.env** - Your API keys (keep secret!)
- **.env.example** - Template for API keys
- **setup_and_run.sh** - Automated setup script
- **README.md** - Full documentation
- **QUICKSTART.md** - This file

## Troubleshooting

### SSL Certificate Error

If you see: `[SSL: CERTIFICATE_VERIFY_FAILED]`

The `test_official_agentops.py` script automatically fixes this by:
```python
import certifi
os.environ['SSL_CERT_FILE'] = certifi.where()
```

If it still fails, manually install certificates:
```bash
# macOS
/Applications/Python\ 3.x/Install\ Certificates.command

# Or upgrade certifi
pip install --upgrade certifi
```

### 401 Unauthorized

Make sure your `.env` has the correct API key:
```bash
AGENTOPS_API_KEY=<your-agentops-api-key>
```

### No Data in Dashboard

1. Check the agent output for the session URL
2. Wait 10-30 seconds for data to sync
3. Refresh the AgentOps dashboard page
4. Check the "All Sessions" view (not filtered)

## What This Demonstrates

### 1. LangGraph Multi-Step Workflow
- Agent reasons about user query
- Decides which tools to call
- Executes tools
- Synthesizes results
- Provides final answer

### 2. AgentOps Tracking
- Every LLM call is logged
- Tool executions are tracked
- Costs are calculated
- Performance is measured
- Errors are captured

### 3. DevOps Use Case
- Cluster health checks
- Log analysis
- Metrics collection
- Deployment monitoring

### 4. Observable AI Agent
- Complete transparency into agent behavior
- Debug agent decisions
- Optimize costs
- Monitor performance
- Analyze tool usage patterns

## Next Steps

### See It in Your Local DevOps Copilot

The data is going to the official AgentOps cloud. To see it in your local DevOps Copilot at http://localhost:3000:

1. Run the local version:
   ```bash
   python test_local_integration.py
   ```

2. Open: http://localhost:3000/ai-workloads/sessions

3. Find your session in the Sessions page

4. Click to see full trace with Analytics tab showing:
   - Cost over time (the charts you just implemented!)
   - Duration distribution
   - Spans per trace
   - Failed traces timeline

### Integrate with Your Own Agents

Use this as a template for your production agents:

```python
import agentops

# Start tracking
agentops.init(api_key="your-key")

# Your agent code here
# AgentOps automatically tracks:
# - LangChain/LangGraph calls
# - OpenAI API calls
# - Tool executions

# End tracking
agentops.end_session("Success")
```

### Explore AgentOps Features

In the dashboard, explore:
- **Analytics**: Cost trends, token usage, success rates
- **Filters**: By date, tags, status
- **Search**: Find specific sessions
- **Comparison**: Compare different agent runs
- **Export**: Download data for analysis

## Support

- AgentOps Docs: https://docs.agentops.ai
- LangGraph Docs: https://langchain-ai.github.io/langgraph/
- Your local dashboard: http://localhost:3000

---

**Ready to see your agent in action?**

```bash
source .venv/bin/activate && python test_official_agentops.py
```

Then open: https://app.agentops.ai/sessions
