from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity
)
from app.models.user_model import User
from app.utils.validators import validate_email, validate_password, validate_username
from app.utils.email_service import send_verification_email

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user
    Expected JSON: {"email": "user@example.com", "username": "username", "password": "password"}
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        email = data.get('email', '').strip()
        username = data.get('username', '').strip()
        password = data.get('password', '')

        # Validation
        if not email or not username or not password:
            return jsonify({"error": "Email, username, and password are required"}), 400

        # Validate email format
        if not validate_email(email):
            return jsonify({"error": "Invalid email format"}), 400

        # Validate username
        username_error = validate_username(username)
        if username_error:
            return jsonify({"error": username_error}), 400

        # Validate password strength
        password_error = validate_password(password)
        if password_error:
            return jsonify({"error": password_error}), 400

        # Check if user already exists
        if User.email_exists(email):
            return jsonify({"error": "Email already registered"}), 409

        if User.username_exists(username):
            return jsonify({"error": "Username already taken"}), 409

        # Create user
        user = User.create_user(email, username, password)

        # Send verification email
        send_verification_email(user.email, user.username)

        # Generate tokens
        access_token = create_access_token(identity=str(user._id))
        refresh_token = create_refresh_token(identity=str(user._id))

        return jsonify({
            "message": "User registered successfully. Please check your email to verify your account.",
            "user": user.to_dict(),
            "access_token": access_token,
            "refresh_token": refresh_token
        }), 201

    except Exception as e:
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login user
    Expected JSON: {"email": "user@example.com", "password": "password"}
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        # Find user
        user = User.find_by_email(email)

        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        # Verify password
        if not User.verify_password(user.password, password):
            return jsonify({"error": "Invalid email or password"}), 401

        # Generate tokens
        access_token = create_access_token(identity=str(user._id))
        refresh_token = create_refresh_token(identity=str(user._id))

        return jsonify({
            "message": "Login successful",
            "user": user.to_dict(),
            "access_token": access_token,
            "refresh_token": refresh_token
        }), 200

    except Exception as e:
        return jsonify({"error": f"Login failed: {str(e)}"}), 500


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """
    Refresh access token
    Requires: Valid refresh token in Authorization header
    """
    try:
        current_user_id = get_jwt_identity()
        new_access_token = create_access_token(identity=current_user_id)

        return jsonify({
            "access_token": new_access_token
        }), 200

    except Exception as e:
        return jsonify({"error": f"Token refresh failed: {str(e)}"}), 500


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """
    Get current user profile
    Requires: Valid access token in Authorization header
    """
    try:
        current_user_id = get_jwt_identity()
        user = User.find_by_id(current_user_id)

        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "user": user.to_dict()
        }), 200

    except Exception as e:
        return jsonify({"error": f"Failed to get user: {str(e)}"}), 500


@auth_bp.route('/validate', methods=['GET'])
@jwt_required()
def validate_token():
    """
    Validate access token
    Requires: Valid access token in Authorization header
    """
    try:
        current_user_id = get_jwt_identity()
        return jsonify({
            "valid": True,
            "user_id": current_user_id
        }), 200

    except Exception as e:
        return jsonify({"error": f"Token validation failed: {str(e)}"}), 500
