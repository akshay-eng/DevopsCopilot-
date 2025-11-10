from authlib.integrations.flask_client import OAuth
from flask import current_app


def init_oauth(app):
    """Initialize OAuth with Google and GitHub providers"""
    oauth = OAuth(app)

    # Google OAuth Configuration
    google = oauth.register(
        name='google',
        client_id=app.config['GOOGLE_CLIENT_ID'],
        client_secret=app.config['GOOGLE_CLIENT_SECRET'],
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={
            'scope': 'openid email profile'
        }
    )

    # GitHub OAuth Configuration
    github = oauth.register(
        name='github',
        client_id=app.config['GITHUB_CLIENT_ID'],
        client_secret=app.config['GITHUB_CLIENT_SECRET'],
        access_token_url='https://github.com/login/oauth/access_token',
        access_token_params=None,
        authorize_url='https://github.com/login/oauth/authorize',
        authorize_params=None,
        api_base_url='https://api.github.com/',
        client_kwargs={'scope': 'user:email'},
    )

    return oauth


def generate_username_from_email(email):
    """Generate a unique username from email"""
    base_username = email.split('@')[0]
    # Remove special characters and convert to lowercase
    username = ''.join(c for c in base_username if c.isalnum() or c == '_').lower()
    return username if username else 'user'
