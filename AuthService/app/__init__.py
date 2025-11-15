from flask import Flask
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from config import config
from app.database import init_db
from app.utils.oauth_utils import init_oauth
from app.utils.email_service import init_mail

# Global OAuth instance
oauth = None


def create_app(config_name='default'):
    """Application factory pattern"""
    global oauth
    app = Flask(__name__)

    # Load configuration
    app.config.from_object(config[config_name])

    # Initialize extensions
    CORS(app)  # Enable CORS for frontend integration
    jwt = JWTManager(app)

    # Initialize Email
    init_mail(app)

    # Initialize OAuth
    oauth = init_oauth(app)

    # Initialize database
    init_db(app)

    # Register blueprints
    from app.routes.auth_routes import auth_bp
    from app.routes.oauth_routes import oauth_bp
    from app.routes.email_routes import email_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(oauth_bp, url_prefix='/api/oauth')
    app.register_blueprint(email_bp, url_prefix='/api/email')

    # Health check endpoint
    @app.route('/')
    def home():
        return {"message": "Auth Service API is running", "status": "healthy"}, 200

    # JWT error handlers
    @jwt.unauthorized_loader
    def unauthorized_callback(callback):
        return {"error": "Missing or invalid token"}, 401

    @jwt.invalid_token_loader
    def invalid_token_callback(callback):
        return {"error": "Invalid token"}, 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {"error": "Token has expired"}, 401

    return app
