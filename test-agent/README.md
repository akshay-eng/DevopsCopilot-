# Test Agent for AgentOps Integration

This directory contains a test LangChain agent to verify AgentOps monitoring integration with DevOps Copilot.

## Setup

1. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

4. **Get your AgentOps API key:**
   - Go to https://app.agentops.ai
   - Sign up or log in
   - Navigate to Settings → Projects
   - Copy your API key

5. **Get your OpenAI API key:**
   - Go to https://platform.openai.com/api-keys
   - Create a new API key
   - Copy it to your .env file

## Running the Test Agent

```bash
python test_langchain_agent.py
```

This will:
- Initialize AgentOps monitoring
- Create a LangChain agent with 3 tools (Calculator, Weather, Time)
- Run 4 test queries
- Generate traces visible in your DevOps Copilot UI

## Viewing Results

After running the agent, check:

1. **AgentOps Dashboard:** https://app.agentops.ai
2. **DevOps Copilot UI:** http://localhost:3000/dashboard/ai-workloads/sessions

You should see:
- Traces in the Sessions page
- Metrics in the Analytics page
- Cost and token usage statistics

## Tools Available

1. **Calculator** - Evaluates mathematical expressions
2. **Weather** - Gets weather for a location (mock)
3. **Time** - Returns current date/time

## Troubleshooting

- **No traces appearing?** Check that:
  - AgentOps API key is correct
  - authService is running on port 5001
  - Frontend is running on port 3000
  - Backend proxy routes are working

- **OpenAI errors?** Verify your OpenAI API key is valid and has credits

- **Import errors?** Make sure you activated the virtual environment and installed all dependencies
