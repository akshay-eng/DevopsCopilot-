"""
Email Routes - Email verification, password reset, and onboarding
"""

from flask import Blueprint, request, jsonify
from app.models.user_model import User
from app.utils.email_service import (
    verify_token,
    generate_token,
    send_verification_email,
    send_password_reset_email,
    send_welcome_email
)
from datetime import datetime, timedelta

email_bp = Blueprint('email', __name__)


@email_bp.route('/verify-email', methods=['POST'])
def verify_email():
    """Verify user email with token"""
    try:
        data = request.get_json()
        token = data.get('token')

        if not token:
            return jsonify({"error": "Token is required"}), 400

        # Verify token (24 hour expiry)
        email = verify_token(token, salt='email-verification', max_age=86400)

        if not email:
            return jsonify({"error": "Invalid or expired verification token"}), 400

        # Find user by email
        user = User.find_by_email(email)
        if not user:
            return jsonify({"error": "User not found"}), 404

        if user.email_verified:
            return jsonify({"message": "Email already verified"}), 200

        # Mark email as verified
        user.verify_email()

        # Send welcome email
        send_welcome_email(user.email, user.username)

        return jsonify({
            "message": "Email verified successfully",
            "user": {
                "id": str(user._id),
                "email": user.email,
                "username": user.username,
                "email_verified": user.email_verified
            }
        }), 200

    except Exception as e:
        print(f"Error verifying email: {e}")
        return jsonify({"error": "Failed to verify email"}), 500


@email_bp.route('/resend-verification', methods=['POST'])
def resend_verification():
    """Resend verification email"""
    try:
        data = request.get_json()
        email = data.get('email')

        if not email:
            return jsonify({"error": "Email is required"}), 400

        # Find user
        user = User.find_by_email(email)
        if not user:
            return jsonify({"error": "User not found"}), 404

        if user.email_verified:
            return jsonify({"message": "Email already verified"}), 200

        # Send verification email
        send_verification_email(user.email, user.username)

        return jsonify({"message": "Verification email sent successfully"}), 200

    except Exception as e:
        print(f"Error resending verification email: {e}")
        return jsonify({"error": "Failed to send verification email"}), 500


@email_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset"""
    try:
        data = request.get_json()
        email = data.get('email')

        if not email:
            return jsonify({"error": "Email is required"}), 400

        # Find user
        user = User.find_by_email(email)
        if not user:
            # Don't reveal if user exists or not (security best practice)
            return jsonify({"message": "If the email exists, a password reset link has been sent"}), 200

        # Only allow password reset for email/password users
        if user.oauth_provider:
            return jsonify({
                "error": f"This account uses {user.oauth_provider} sign-in. Please use {user.oauth_provider} to login."
            }), 400

        # Generate reset token (1 hour expiry)
        reset_token = generate_token(user.email, salt='password-reset')
        reset_token_expiry = datetime.utcnow() + timedelta(hours=1)

        # Save reset token to user
        user.set_reset_token(reset_token, reset_token_expiry)

        # Send password reset email
        send_password_reset_email(user.email, user.username, reset_token)

        return jsonify({"message": "If the email exists, a password reset link has been sent"}), 200

    except Exception as e:
        print(f"Error requesting password reset: {e}")
        return jsonify({"error": "Failed to process password reset request"}), 500


@email_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Reset password with token"""
    try:
        data = request.get_json()
        token = data.get('token')
        new_password = data.get('password')

        if not token or not new_password:
            return jsonify({"error": "Token and new password are required"}), 400

        # Validate password strength
        if len(new_password) < 8:
            return jsonify({"error": "Password must be at least 8 characters long"}), 400

        # Verify token (1 hour expiry)
        email = verify_token(token, salt='password-reset', max_age=3600)

        if not email:
            return jsonify({"error": "Invalid or expired reset token"}), 400

        # Find user
        user = User.find_by_email(email)
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Verify the token matches the stored token
        if user.reset_token != token:
            return jsonify({"error": "Invalid reset token"}), 400

        # Check token expiry
        if user.reset_token_expiry and user.reset_token_expiry < datetime.utcnow():
            return jsonify({"error": "Reset token has expired"}), 400

        # Update password
        user.update_password(new_password)

        return jsonify({"message": "Password reset successfully"}), 200

    except Exception as e:
        print(f"Error resetting password: {e}")
        return jsonify({"error": "Failed to reset password"}), 500


@email_bp.route('/complete-onboarding', methods=['POST'])
def complete_onboarding():
    """Mark user onboarding as completed"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({"error": "User ID is required"}), 400

        # Find user
        user = User.find_by_id(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Mark onboarding as completed
        user.update_onboarding_status(completed=True)

        return jsonify({
            "message": "Onboarding completed successfully",
            "user": {
                "id": str(user._id),
                "email": user.email,
                "username": user.username,
                "has_completed_onboarding": user.has_completed_onboarding
            }
        }), 200

    except Exception as e:
        print(f"Error completing onboarding: {e}")
        return jsonify({"error": "Failed to complete onboarding"}), 500
