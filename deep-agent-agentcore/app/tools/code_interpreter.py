"""
AWS Bedrock AgentCore Code Interpreter tool.

Uses the AgentCore Code Interpreter for sandboxed Python execution —
ideal for data analysis, visualization, and computation.
Falls back to local subprocess execution when AgentCore is not available.
"""
import subprocess
import tempfile
import os
from langchain_core.tools import tool


def _try_agentcore_code_interpreter(code: str) -> tuple[bool, str]:
    """Attempt to use AgentCore Code Interpreter. Returns (success, result)."""
    try:
        from bedrock_agentcore.tools.code_interpreter_client import code_session

        with code_session() as session:
            result = session.execute(code)
            output_parts = []
            if result.get("stdout"):
                output_parts.append(result["stdout"])
            if result.get("stderr"):
                output_parts.append(f"STDERR: {result['stderr']}")
            if result.get("error"):
                output_parts.append(f"ERROR: {result['error']}")
            return True, "\n".join(output_parts) if output_parts else "(no output)"
    except ImportError:
        return False, ""
    except Exception as e:
        return False, f"AgentCore Code Interpreter error: {str(e)}"


def _local_python_execute(code: str, timeout: int = 60) -> str:
    """Local fallback: execute Python code in a subprocess."""
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(code)
            tmp_path = f.name

        result = subprocess.run(
            ["python3", tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        os.unlink(tmp_path)

        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR: {result.stderr}"
        if len(output) > 10000:
            output = output[:10000] + "\n... (output truncated)"
        return output.strip() or "(no output)"
    except subprocess.TimeoutExpired:
        os.unlink(tmp_path)
        return f"ERROR: Code execution timed out after {timeout}s"
    except Exception as e:
        return f"ERROR: {str(e)}"


@tool
def execute_code(code: str, language: str = "python") -> str:
    """Execute code using the Code Interpreter. Supports Python for data analysis, computation, and visualization.
    Uses AWS AgentCore Code Interpreter when available, falls back to local execution.

    Args:
        code: The Python code to execute
        language: Programming language (currently only 'python' supported)
    """
    if language != "python":
        return f"ERROR: Only 'python' is supported, got '{language}'"

    # Try AgentCore first
    success, result = _try_agentcore_code_interpreter(code)
    if success:
        return result
    if result and "error" in result.lower():
        return result

    # Fall back to local execution
    return _local_python_execute(code)
