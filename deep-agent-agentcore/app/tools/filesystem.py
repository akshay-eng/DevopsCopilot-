import os
from langchain_core.tools import tool


@tool
def read_file(file_path: str, max_lines: int = 500) -> str:
    """Read a file from the filesystem. Useful for reading YAML manifests, configs, scripts.

    Args:
        file_path: Absolute or relative path to the file
        max_lines: Maximum number of lines to read (default 500)
    """
    try:
        path = os.path.expanduser(file_path)
        if not os.path.exists(path):
            return f"ERROR: File not found: {path}"
        if not os.path.isfile(path):
            return f"ERROR: Not a file: {path}"
        if os.path.getsize(path) > 1_000_000:
            return f"ERROR: File too large ({os.path.getsize(path)} bytes). Use bash_execute with head/tail."

        with open(path, "r") as f:
            lines = []
            for i, line in enumerate(f):
                if i >= max_lines:
                    lines.append(f"\n... (truncated at {max_lines} lines)")
                    break
                lines.append(line.rstrip())
        return "\n".join(lines)
    except UnicodeDecodeError:
        return f"ERROR: File appears to be binary: {file_path}"
    except Exception as e:
        return f"ERROR reading file: {str(e)}"


@tool
def write_file(file_path: str, content: str) -> str:
    """Write content to a file. Creates parent directories if needed. Use for generating YAML manifests, scripts, configs.

    Args:
        file_path: Path to write the file
        content: Content to write
    """
    try:
        path = os.path.expanduser(file_path)
        blocked_prefixes = ["/etc/", "/usr/", "/bin/", "/sbin/", "/boot/", "/proc/", "/sys/"]
        for prefix in blocked_prefixes:
            if path.startswith(prefix):
                return f"BLOCKED: Cannot write to system directory '{prefix}'"

        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            f.write(content)
        return f"Successfully wrote {len(content)} bytes to {path}"
    except Exception as e:
        return f"ERROR writing file: {str(e)}"
