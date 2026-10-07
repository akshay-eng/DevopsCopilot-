FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy MCP server source
COPY mcp_server_servicenow/ ./mcp_server_servicenow/
COPY pyproject.toml .

# Install the package
RUN pip install --no-cache-dir -e .

# Credentials injected at deploy time via env vars:
#   SERVICENOW_INSTANCE_URL
#   SERVICENOW_USERNAME
#   SERVICENOW_PASSWORD

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/sse')" || exit 1

CMD ["python", "-m", "mcp_server_servicenow.cli", "--transport", "sse", "--host", "0.0.0.0"]
