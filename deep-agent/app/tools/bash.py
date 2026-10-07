import subprocess
from langchain_core.tools import tool


BLOCKED_PATTERNS = [
    "rm -rf /", "rm -rf ~", "rm -rf .",
    "shutdown", "reboot", "mkfs", "dd if=",
    "> /dev/sd", ":(){ :|:", "chmod -R 777 /",
    "curl | sh", "curl | bash", "wget | sh",
]


@tool
def bash_execute(command: str, timeout: int = 30) -> str:
    """Execute a shell command. Use for general-purpose operations like curl, jq, grep, awk, sort, wc, dig, nslookup, etc.

    Args:
        command: The shell command to execute
        timeout: Timeout in seconds (max 120, default 30)
    """
    for pattern in BLOCKED_PATTERNS:
        if pattern in command:
            return f"BLOCKED: Command contains dangerous pattern '{pattern}'"

    try:
        result = subprocess.run(
            ["bash", "-c", command],
            capture_output=True,
            text=True,
            timeout=min(timeout, 120),
        )
        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR: {result.stderr}"
        if len(output) > 10000:
            output = output[:10000] + "\n... (output truncated — use grep/tail to narrow)"
        return output.strip() or "(no output)"
    except subprocess.TimeoutExpired:
        return f"ERROR: Command timed out after {timeout}s"
    except Exception as e:
        return f"ERROR: {str(e)}"
