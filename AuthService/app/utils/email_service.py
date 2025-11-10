"""
Email Service - Send verification and password reset emails
"""

from flask_mail import Mail, Message
from flask import current_app, render_template_string
from itsdangerous import URLSafeTimedSerializer
from datetime import datetime, timedelta

mail = None


def init_mail(app):
    """Initialize Flask-Mail"""
    global mail
    mail = Mail(app)
    return mail


def generate_token(email, salt='email-verification'):
    """Generate a secure token for email verification or password reset"""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    return serializer.dumps(email, salt=salt)


def verify_token(token, salt='email-verification', max_age=3600):
    """Verify a token (default expiry: 1 hour)"""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        email = serializer.loads(token, salt=salt, max_age=max_age)
        return email
    except Exception:
        return None


def send_verification_email(user_email, username):
    """Send email verification email"""
    if not mail:
        print(f"Mail not configured. Would send verification email to {user_email}")
        return False

    try:
        # Generate verification token (valid for 24 hours)
        token = generate_token(user_email, salt='email-verification')
        verification_url = f"{current_app.config['FRONTEND_URL']}/verify-email?token={token}"

        # Email template
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .container {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 10px;
                    padding: 40px;
                    text-align: center;
                }}
                .content {{
                    background: white;
                    border-radius: 8px;
                    padding: 30px;
                    margin-top: 20px;
                }}
                .button {{
                    display: inline-block;
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    margin: 20px 0;
                }}
                .footer {{
                    margin-top: 30px;
                    font-size: 12px;
                    color: #666;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1 style="color: white; margin: 0;">Welcome to DevOps Copilot!</h1>
            </div>
            <div class="content">
                <h2>Hi {username}!</h2>
                <p>Thanks for signing up! We're excited to have you on board.</p>
                <p>Please verify your email address by clicking the button below:</p>
                <a href="{verification_url}" class="button">Verify Email Address</a>
                <p style="margin-top: 30px; font-size: 14px; color: #666;">
                    Or copy and paste this link into your browser:<br>
                    <a href="{verification_url}">{verification_url}</a>
                </p>
                <p style="margin-top: 30px; font-size: 12px; color: #999;">
                    This link will expire in 24 hours. If you didn't create an account, please ignore this email.
                </p>
            </div>
            <div class="footer">
                <p>© 2024 DevOps Copilot. All rights reserved.</p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
        Hi {username}!

        Thanks for signing up for DevOps Copilot! We're excited to have you on board.

        Please verify your email address by clicking the link below:
        {verification_url}

        This link will expire in 24 hours.

        If you didn't create an account, please ignore this email.

        © 2024 DevOps Copilot
        """

        msg = Message(
            subject='Verify Your Email - DevOps Copilot',
            recipients=[user_email],
            body=text_body,
            html=html_body
        )

        mail.send(msg)
        print(f"✓ Verification email sent to {user_email}")
        return True

    except Exception as e:
        print(f"✗ Failed to send verification email: {e}")
        return False


def send_password_reset_email(user_email, username, reset_token):
    """Send password reset email"""
    if not mail:
        print(f"Mail not configured. Would send password reset email to {user_email}")
        return False

    try:
        reset_url = f"{current_app.config['FRONTEND_URL']}/reset-password?token={reset_token}"

        # Email template
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .container {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 10px;
                    padding: 40px;
                    text-align: center;
                }}
                .content {{
                    background: white;
                    border-radius: 8px;
                    padding: 30px;
                    margin-top: 20px;
                }}
                .button {{
                    display: inline-block;
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    margin: 20px 0;
                }}
                .warning {{
                    background: #fff3cd;
                    border-left: 4px solid #ffc107;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }}
                .footer {{
                    margin-top: 30px;
                    font-size: 12px;
                    color: #666;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1 style="color: white; margin: 0;">Password Reset Request</h1>
            </div>
            <div class="content">
                <h2>Hi {username}!</h2>
                <p>We received a request to reset your password for your DevOps Copilot account.</p>
                <p>Click the button below to reset your password:</p>
                <a href="{reset_url}" class="button">Reset Password</a>
                <p style="margin-top: 30px; font-size: 14px; color: #666;">
                    Or copy and paste this link into your browser:<br>
                    <a href="{reset_url}">{reset_url}</a>
                </p>
                <div class="warning">
                    <strong>⚠️ Security Notice:</strong><br>
                    This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
                </div>
            </div>
            <div class="footer">
                <p>© 2024 DevOps Copilot. All rights reserved.</p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
        Hi {username}!

        We received a request to reset your password for your DevOps Copilot account.

        Click the link below to reset your password:
        {reset_url}

        This link will expire in 1 hour.

        If you didn't request a password reset, please ignore this email and your password will remain unchanged.

        © 2024 DevOps Copilot
        """

        msg = Message(
            subject='Reset Your Password - DevOps Copilot',
            recipients=[user_email],
            body=text_body,
            html=html_body
        )

        mail.send(msg)
        print(f"✓ Password reset email sent to {user_email}")
        return True

    except Exception as e:
        print(f"✗ Failed to send password reset email: {e}")
        return False


def send_welcome_email(user_email, username):
    """Send welcome email after email verification"""
    if not mail:
        print(f"Mail not configured. Would send welcome email to {user_email}")
        return False

    try:
        dashboard_url = f"{current_app.config['FRONTEND_URL']}/dashboard"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .container {{
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border-radius: 10px;
                    padding: 40px;
                    text-align: center;
                }}
                .content {{
                    background: white;
                    border-radius: 8px;
                    padding: 30px;
                    margin-top: 20px;
                }}
                .button {{
                    display: inline-block;
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    margin: 20px 0;
                }}
                .feature {{
                    text-align: left;
                    padding: 15px;
                    margin: 10px 0;
                    background: #f3f4f6;
                    border-radius: 5px;
                }}
                .footer {{
                    margin-top: 30px;
                    font-size: 12px;
                    color: #666;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1 style="color: white; margin: 0;">🎉 Welcome Aboard!</h1>
            </div>
            <div class="content">
                <h2>Hi {username}!</h2>
                <p>Your email has been verified successfully! You're all set to start using DevOps Copilot.</p>

                <h3>What's Next?</h3>
                <div class="feature">
                    <strong>✨ Complete Your Onboarding</strong><br>
                    Set up your first cluster and connect your services
                </div>
                <div class="feature">
                    <strong>🔍 Explore AI-Powered Monitoring</strong><br>
                    Get intelligent insights into your infrastructure
                </div>
                <div class="feature">
                    <strong>⚡ Automate DevOps Tasks</strong><br>
                    Let AI handle routine operations
                </div>

                <a href="{dashboard_url}" class="button">Go to Dashboard</a>

                <p style="margin-top: 30px; font-size: 14px; color: #666;">
                    Need help getting started? Check out our <a href="#">documentation</a> or <a href="#">contact support</a>.
                </p>
            </div>
            <div class="footer">
                <p>© 2024 DevOps Copilot. All rights reserved.</p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
        Hi {username}!

        Your email has been verified successfully! You're all set to start using DevOps Copilot.

        What's Next?
        • Complete Your Onboarding - Set up your first cluster
        • Explore AI-Powered Monitoring - Get intelligent insights
        • Automate DevOps Tasks - Let AI handle routine operations

        Get started: {dashboard_url}

        © 2024 DevOps Copilot
        """

        msg = Message(
            subject='Welcome to DevOps Copilot! 🎉',
            recipients=[user_email],
            body=text_body,
            html=html_body
        )

        mail.send(msg)
        print(f"✓ Welcome email sent to {user_email}")
        return True

    except Exception as e:
        print(f"✗ Failed to send welcome email: {e}")
        return False
