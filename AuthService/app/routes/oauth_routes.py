from flask import Blueprint, redirect, url_for, current_app, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token
from app.models.user_model import User
from app.utils.oauth_utils import generate_username_from_email
import secrets

oauth_bp = Blueprint('oauth', __name__)


@oauth_bp.route('/google')
def google_login():
    """Initiate Google OAuth flow"""
    from app import oauth
    redirect_uri = current_app.config['GOOGLE_REDIRECT_URI']
    return oauth.google.authorize_redirect(redirect_uri)


@oauth_bp.route('/google/callback')
def google_callback():
    """Handle Google OAuth callback"""
    try:
        from app import oauth

        # Get access token from Google
        token = oauth.google.authorize_access_token()

        # Get user info from Google
        user_info = token.get('userinfo')

        if not user_info:
            return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=oauth_failed")

        email = user_info.get('email')
        oauth_id = user_info.get('sub')
        full_name = user_info.get('name')
        avatar_url = user_info.get('picture')

        if not email or not oauth_id:
            return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=missing_info")

        # Check if user exists with this OAuth provider
        user = User.find_by_oauth('google', oauth_id)

        if not user:
            # Check if email is already registered
            existing_user = User.find_by_email(email)
            if existing_user:
                # Email exists but with different auth method
                return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=email_exists")

            # Generate username from email
            base_username = generate_username_from_email(email)
            username = base_username

            # Ensure username is unique
            counter = 1
            while User.username_exists(username):
                username = f"{base_username}{counter}"
                counter += 1

            # Create new user
            user = User.create_oauth_user(
                email=email,
                username=username,
                provider='google',
                oauth_id=oauth_id,
                avatar_url=avatar_url,
                full_name=full_name
            )

        # Generate JWT tokens
        access_token = create_access_token(identity=str(user._id))
        refresh_token = create_refresh_token(identity=str(user._id))

        # Redirect to frontend with tokens
        frontend_url = current_app.config['FRONTEND_URL']
        return redirect(f"{frontend_url}/auth/callback?access_token={access_token}&refresh_token={refresh_token}")

    except Exception as e:
        print(f"Google OAuth error: {e}")
        return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=oauth_error")


@oauth_bp.route('/github')
def github_login():
    """Initiate GitHub OAuth flow"""
    from app import oauth
    redirect_uri = current_app.config['GITHUB_REDIRECT_URI']
    return oauth.github.authorize_redirect(redirect_uri)


@oauth_bp.route('/github/callback')
def github_callback():
    """Handle GitHub OAuth callback"""
    try:
        from app import oauth

        # Get access token from GitHub
        token = oauth.github.authorize_access_token()

        # Get user info from GitHub
        resp = oauth.github.get('user')
        user_info = resp.json()

        # Get user's primary email
        email_resp = oauth.github.get('user/emails')
        emails = email_resp.json()

        # Find primary email
        primary_email = None
        for email_obj in emails:
            if email_obj.get('primary') and email_obj.get('verified'):
                primary_email = email_obj.get('email')
                break

        if not primary_email and emails:
            # Fallback to first verified email
            for email_obj in emails:
                if email_obj.get('verified'):
                    primary_email = email_obj.get('email')
                    break

        if not primary_email:
            return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=no_email")

        oauth_id = str(user_info.get('id'))
        full_name = user_info.get('name')
        avatar_url = user_info.get('avatar_url')
        github_username = user_info.get('login')

        if not oauth_id:
            return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=missing_info")

        # Check if user exists with this OAuth provider
        user = User.find_by_oauth('github', oauth_id)

        if not user:
            # Check if email is already registered
            existing_user = User.find_by_email(primary_email)
            if existing_user:
                # Email exists but with different auth method
                return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=email_exists")

            # Use GitHub username or generate from email
            username = github_username or generate_username_from_email(primary_email)

            # Ensure username is unique
            counter = 1
            base_username = username
            while User.username_exists(username):
                username = f"{base_username}{counter}"
                counter += 1

            # Create new user
            user = User.create_oauth_user(
                email=primary_email,
                username=username,
                provider='github',
                oauth_id=oauth_id,
                avatar_url=avatar_url,
                full_name=full_name
            )

        # Generate JWT tokens
        access_token = create_access_token(identity=str(user._id))
        refresh_token = create_refresh_token(identity=str(user._id))

        # Redirect to frontend with tokens
        frontend_url = current_app.config['FRONTEND_URL']
        return redirect(f"{frontend_url}/auth/callback?access_token={access_token}&refresh_token={refresh_token}")

    except Exception as e:
        print(f"GitHub OAuth error: {e}")
        return redirect(f"{current_app.config['FRONTEND_URL']}/login?error=oauth_error")
