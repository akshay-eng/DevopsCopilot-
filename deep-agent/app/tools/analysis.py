import re
from langchain_core.tools import tool


@tool
def grep_text(pattern: str, text: str, ignore_case: bool = True, context_lines: int = 2) -> str:
    """Search through text using regex pattern. Useful for finding specific errors, IPs, or patterns in logs or command output.

    Args:
        pattern: Regex pattern to search for (e.g. 'error|fail|crash', 'OOMKilled', '5[0-9]{2}')
        text: The text content to search through
        ignore_case: Whether to ignore case (default True)
        context_lines: Number of surrounding lines to include (default 2)
    """
    flags = re.IGNORECASE if ignore_case else 0
    lines = text.split("\n")
    matches = []
    matched_indices = set()

    for i, line in enumerate(lines):
        if re.search(pattern, line, flags):
            start = max(0, i - context_lines)
            end = min(len(lines), i + context_lines + 1)
            for j in range(start, end):
                matched_indices.add(j)

    if not matched_indices:
        return f"No matches found for pattern '{pattern}'"

    result_lines = []
    sorted_indices = sorted(matched_indices)
    prev_idx = -2
    for idx in sorted_indices:
        if idx > prev_idx + 1:
            result_lines.append("---")
        result_lines.append(f"{idx + 1}: {lines[idx]}")
        prev_idx = idx

    return f"Found {len([i for i, l in enumerate(lines) if re.search(pattern, l, flags)])} matches:\n" + "\n".join(result_lines)


@tool
def analyze_metrics(metric_name: str, values_text: str) -> str:
    """Analyze a series of metric values to detect trends, anomalies, and provide summary statistics.

    Args:
        metric_name: Name of the metric being analyzed
        values_text: Space or newline separated numeric values
    """
    try:
        numbers = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+", values_text)]
        if not numbers:
            return "No numeric values found in input"

        count = len(numbers)
        avg = sum(numbers) / count
        min_val = min(numbers)
        max_val = max(numbers)
        sorted_nums = sorted(numbers)
        median = sorted_nums[count // 2]

        # Detect trend
        if count >= 3:
            first_half = sum(numbers[:count // 2]) / (count // 2)
            second_half = sum(numbers[count // 2:]) / (count - count // 2)
            if second_half > first_half * 1.1:
                trend = "INCREASING"
            elif second_half < first_half * 0.9:
                trend = "DECREASING"
            else:
                trend = "STABLE"
        else:
            trend = "INSUFFICIENT DATA"

        # Detect outliers (simple: > 2 std devs from mean)
        if count >= 5:
            variance = sum((x - avg) ** 2 for x in numbers) / count
            std_dev = variance ** 0.5
            outliers = [x for x in numbers if abs(x - avg) > 2 * std_dev]
        else:
            std_dev = 0
            outliers = []

        lines = [
            f"Metric: {metric_name}",
            f"Count: {count} data points",
            f"Min: {min_val:.4f}",
            f"Max: {max_val:.4f}",
            f"Avg: {avg:.4f}",
            f"Median: {median:.4f}",
            f"Std Dev: {std_dev:.4f}",
            f"Trend: {trend}",
        ]
        if outliers:
            lines.append(f"Outliers ({len(outliers)}): {outliers}")

        return "\n".join(lines)
    except Exception as e:
        return f"ERROR analyzing metrics: {str(e)}"
