# Quick Start Guide - Test Agent

## Current Status

✅ AgentOps SDK is working and creating traces
✅ Traces are being sent to AgentOps: https://app.agentops.ai
⚠️ OpenAI API key needs to be configured

## Fix the API Keys

Your `.env` file currently has the AgentOps key in the OPENAI_API_KEY field. Here's how to fix it:

### Step 1: Get Your Keys

1. **AgentOps API Key**:
   - Go to http://localhost:3000/dashboard/ai-workloads/get-started
   - Create a new project
   - Copy the API key that starts with `ao_`

2. **OpenAI API Key**:
   - Go to https://platform.openai.com/api-keys
   - Create a new key
   - Copy the key that starts with `sk-`

### Step 2: Update `.env`

Edit your `.env` file to have:

```bash
# AgentOps Configuration
AGENTOPS_API_KEY=ao_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Your AgentOps key
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx    # Your OpenAI key
USER_ID=your-user-id-from-devops-copilot

# Optional: Backend URL (if using local backend)
# AGENTOPS_ENDPOINT=http://localhost:5001/api/agentops
```

### Step 3: Run the Test

```bash
# Make sure you're in the test-agent directory
cd /Users/akshay/Documents/DevopsCopilot-/test-agent

# Activate virtual environment
source venv/bin/activate

# Run the simple test (no LangChain complexity)
python test_simple_agent.py
```

## What to Expect

When you run the test with valid keys, you should see:

```
🚀 Initializing AgentOps...
✅ AgentOps initialized successfully!

============================================================
🧪 Running Simple Test Queries
============================================================

📝 Query 1: What is 25 * 4 + 10?
------------------------------------------------------------
✅ Response: The result of 25 * 4 + 10 is 110.
------------------------------------------------------------

📝 Query 2: Tell me a fun fact about Python programming.
------------------------------------------------------------
✅ Response: Python was named after the British comedy group...
------------------------------------------------------------

...
```

## View Traces

After running successfully, you can view traces in two places:

### Option 1: AgentOps Cloud Dashboard
Go to: https://app.agentops.ai/sessions

### Option 2: DevOps Copilot UI (Coming Soon)
Go to: http://localhost:3000/dashboard/ai-workloads/traces

**Note**: Currently, traces are sent directly to AgentOps cloud. To see them in your DevOps Copilot UI, you'll need to configure the AgentOps SDK to use your local backend endpoint.

## Troubleshooting

### "Incorrect API key provided"
- Make sure your OPENAI_API_KEY starts with `sk-`
- Make sure your AGENTOPS_API_KEY starts with `ao_`
- Don't mix them up!

### "AGENTOPS_API_KEY not found"
- Make sure you created the `.env` file
- Make sure it's in the `/test-agent` directory
- Make sure the keys don't have quotes around them

### No traces appearing in UI
This is expected! The AgentOps SDK sends traces to `app.agentops.ai` by default. To send traces to your local backend:

1. Add this to your `.env`:
   ```bash
   AGENTOPS_ENDPOINT=http://localhost:5001/api/agentops
   ```

2. Update the test script to use this endpoint (see main README)

## Next Steps

1. **Get valid OpenAI API key** from https://platform.openai.com/api-keys
2. **Update `.env` file** with correct keys
3. **Run test again**: `python test_simple_agent.py`
4. **View traces** at https://app.agentops.ai
5. **Test UI integration** by creating projects in DevOps Copilot

## Files Reference

- `test_simple_agent.py` - Simple test without LangChain complexity (RECOMMENDED)
- `test_langchain_agent.py` - Full LangChain agent with tools (needs fixing)
- `.env` - Your API keys configuration
- `requirements.txt` - Python dependencies
