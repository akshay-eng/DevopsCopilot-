import re


def validate_email(email):
    """
    Validate email format
    Returns True if valid, False otherwise
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password):
    """
    Validate password strength
    Returns None if valid, error message otherwise

    Requirements:
    - At least 8 characters
    - Contains at least one uppercase letter
    - Contains at least one lowercase letter
    - Contains at least one digit
    """
    if len(password) < 8:
        return "Password must be at least 8 characters long"

    if not re.search(r'[A-Z]', password):
        return "Password must contain at least one uppercase letter"

    if not re.search(r'[a-z]', password):
        return "Password must contain at least one lowercase letter"

    if not re.search(r'\d', password):
        return "Password must contain at least one digit"

    return None


def validate_username(username):
    """
    Validate username format
    Returns None if valid, error message otherwise

    Requirements:
    - 3-20 characters
    - Only alphanumeric characters and underscores
    - Must start with a letter
    """
    if len(username) < 3 or len(username) > 20:
        return "Username must be between 3 and 20 characters"

    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', username):
        return "Username must start with a letter and contain only letters, numbers, and underscores"

    return None
