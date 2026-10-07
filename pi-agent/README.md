# AIOps Pi Agent

The AI assistant runtime for AIOps DevOps Copilot, built on the open-source
[Pi toolkit](https://github.com/earendil-works/pi) (`@mariozechner/pi-ai` +
`pi-agent-core`). It **replaces the LangGraph `deep-agent`** and speaks the exact
same HTTP + SSE contract, so switching is a one-line config change.

## Why Pi

- **Modular models — bring your own.** One unified LLM interface across on-prem
  (vLLM, Ollama, any OpenAI-compatible endpoint) and cloud (Anthropic, OpenAI,
  Bedrock, Google, Mistral, Groq, …). Models are declared in `models.json` and
  can be added/updated at runtime via `POST /api/models` — no code changes.
- **Same UI, zero frontend changes.** Streams `token` / `reasoning` / `tool_start`
  / `tool_end` / `done` SSE events — exactly what HolmesGPT already renders,
  including the "thinking" stream.
- **Real tools.** Each tool is an authenticated call into the existing platform
  API (clusters, logs, metrics, Trivy vulnerabilities, and agentic remediation),
  so it reuses all the working backend logic.

## Run

```bash
cd pi-agent
cp .env.example .env      # fill in only the keys for models you enable
npm install
npm start                 # listens on :8100
```

Then point the platform at it (instead of the Python deep-agent):

```bash
# in authService's environment
DEEP_AGENT_URL=http://localhost:8100
```

Restart `authService`. The HolmesGPT chat now runs on Pi. Nothing else changes.

## Modular models (`models.json`)

```jsonc
{
  "default": "vllm-onprem",
  "models": [
    { "id": "vllm-onprem", "provider": "custom", "api": "openai-completions",
      "baseUrl": "http://172.17.65.184:8000/v1", "model": "qwopus3.5-9b-v3",
      "apiKeyEnv": "VLLM_API_KEY", "onPrem": true },
    { "id": "anthropic-opus", "provider": "anthropic", "model": "claude-opus-4-5",
      "apiKeyEnv": "ANTHROPIC_API_KEY", "thinkingLevel": "medium" }
  ]
}
```

- **On-prem / OpenAI-compatible:** set `provider: "custom"`, `api: "openai-completions"`,
  a `baseUrl`, and the served `model` name. Key optional.
- **Cloud:** set `provider` + `model` from the pi-ai catalog and an `apiKeyEnv`.
- The selector in the chat composer lists everything from `GET /api/models`; the
  frontend sends the chosen `id` as `modelProvider`.

Add a model without restarting:

```bash
curl -X POST http://localhost:8100/api/models -H 'Content-Type: application/json' \
  -d '{"id":"my-vllm","provider":"custom","api":"openai-completions",
       "baseUrl":"http://10.0.0.5:8000/v1","model":"my-model","makeDefault":true}'
```

## Endpoints (deep-agent compatible)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agent/chat` | Chat (SSE stream) |
| POST | `/api/agent/ops` | Enterprise/ops chat (SSE) |
| POST | `/api/agent/alert-generate` | Generate a Prometheus alert rule (SSE) |
| GET/DELETE | `/api/agent/conversations[/:id]` | History |
| GET/POST | `/api/models` | List / add models |
| GET | `/health` | Health |

## Tools

`list_clusters`, `list_resources`, `get_pod_logs`, `get_pod_metrics`,
`get_resource_vulnerabilities`, `get_cluster_vulnerability_summary`,
`remediate_vulnerability`, `get_alerts`. Each runs as the calling user (their JWT
is forwarded from the chat request), against `PLATFORM_API_URL`.
