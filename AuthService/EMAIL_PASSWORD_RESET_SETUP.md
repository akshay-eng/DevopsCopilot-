# Email Verification & Password Reset Setup Guide

## ✅ What's Been Implemented (Backend)

### 1. User Model Updates ([user_model.py](app/models/user_model.py))
- Added `email_verified` field
- Added `has_completed_onboarding` field
- Added `reset_token` and `reset_token_expiry` fields
- Added methods:
  - `verify_email()` - Mark email as verified
  - `update_onboarding_status()` - Track onboarding completion
  - `set_reset_token()` - Store password reset token
  - `clear_reset_token()` - Clear reset token after use
  - `update_password()` - Update user password
  - `find_by_reset_token()` - Find user by reset token

### 2. Email Service ([email_service.py](app/utils/email_service.py))
- Flask-Mail integration
- Beautiful HTML email templates
- Functions:
  - `send_verification_email()` - Welcome email with verification link
  - `send_password_reset_email()` - Password reset instructions
  - `send_welcome_email()` - After email verification
  - `generate_token()` - Secure token generation
  - `verify_token()` - Token validation

### 3. Configuration Updates
- Added Flask-Mail to requirements.txt
- Added email config to config.py
- Added email env variables to .env

## 📋 Remaining Implementation Steps

### Backend Routes to Add

Create `app/routes/email_routes.py`:

```python
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.user_model import User
from app.utils.email_service import (
    send_verification_email,
    send_password_reset_email,
    send_welcome_email,
    verify_token,
    generate_token
)
from datetime import datetime, timedelta

email_bp = Blueprint('email', __name__)


@email_bp.route('/verify-email', methods=['POST'])
def verify_email():
    """Verify email with token"""
    try:
        data = request.get_json()
        token = data.get('token')

        if not token:
            return jsonify({"error": "Token is required"}), 400

        # Verify token (24 hour expiry)
        email = verify_token(token, salt='email-verification', max_age=86400)

        if not email:
            return jsonify({"error": "Invalid or expired token"}), 400

        # Find and verify user
        user = User.find_by_email(email)

        if not user:
            return jsonify({"error": "User not found"}), 404

        if user.email_verified:
            return jsonify({"message": "Email already verified"}), 200

        # Verify email
        user.verify_email()

        # Send welcome email
        send_welcome_email(user.email, user.username)

        return jsonify({
            "message": "Email verified successfully!",
            "user": user.to_dict()
        }), 200

    except Exception as e:
        return jsonify({"error": f"Verification failed: {str(e)}"}), 500


@email_bp.route('/resend-verification', methods=['POST'])
@jwt_required()
def resend_verification():
    """Resend verification email"""
    try:
        current_user_id = get_jwt_identity()
        user = User.find_by_id(current_user_id)

        if not user:
            return jsonify({"error": "User not found"}), 404

        if user.email_verified:
            return jsonify({"message": "Email already verified"}), 200

        # Send verification email
        send_verification_email(user.email, user.username)

        return jsonify({"message": "Verification email sent"}), 200

    except Exception as e:
        return jsonify({"error": f"Failed to send email: {str(e)}"}), 500


@email_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip()

        if not email:
            return jsonify({"error": "Email is required"}), 400

        user = User.find_by_email(email)

        # Always return success (security best practice)
        if not user:
            return jsonify({"message": "If the email exists, a reset link has been sent"}), 200

        # OAuth users can't reset password
        if user.oauth_provider:
            return jsonify({"error": "OAuth users cannot reset password. Please use your OAuth provider to sign in."}), 400

        # Generate reset token (1 hour expiry)
        token = generate_token(user.email, salt='password-reset')
        expiry = datetime.utcnow() + timedelta(hours=1)

        # Save token to database
        user.set_reset_token(token, expiry)

        # Send reset email
        send_password_reset_email(user.email, user.username, token)

        return jsonify({"message": "If the email exists, a reset link has been sent"}), 200

    except Exception as e:
        return jsonify({"error": f"Request failed: {str(e)}"}), 500


@email_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Reset password with token"""
    try:
        data = request.get_json()
        token = data.get('token')
        new_password = data.get('password')

        if not token or not new_password:
            return jsonify({"error": "Token and new password are required"}), 400

        # Verify token (1 hour expiry)
        email = verify_token(token, salt='password-reset', max_age=3600)

        if not email:
            return jsonify({"error": "Invalid or expired token"}), 400

        # Find user by reset token
        user = User.find_by_reset_token(token)

        if not user:
            return jsonify({"error": "Invalid or expired token"}), 400

        # Update password
        user.update_password(new_password)

        # Clear reset token
        user.clear_reset_token()

        return jsonify({"message": "Password reset successfully"}), 200

    except Exception as e:
        return jsonify({"error": f"Reset failed: {str(e)}"}), 500


@email_bp.route('/complete-onboarding', methods=['POST'])
@jwt_required()
def complete_onboarding():
    """Mark onboarding as completed"""
    try:
        current_user_id = get_jwt_identity()
        user = User.find_by_id(current_user_id)

        if not user:
            return jsonify({"error": "User not found"}), 404

        user.update_onboarding_status(completed=True)

        return jsonify({
            "message": "Onboarding completed",
            "user": user.to_dict()
        }), 200

    except Exception as e:
        return jsonify({"error": f"Failed to complete onboarding: {str(e)}"}), 500
```

### Register Blueprint in `app/__init__.py`:

```python
# Add after other blueprint registrations
from app.routes.email_routes import email_bp
app.register_blueprint(email_bp, url_prefix='/api/email')
```

### Update `auth_routes.py` Registration:

Add email sending after user creation:

```python
# In register() function, after user creation:
from app.utils.email_service import send_verification_email

# Create user
user = User.create_user(email, username, password)

# Send verification email
send_verification_email(user.email, user.username)

# Generate tokens...
```

## 🎨 Frontend Implementation

### 1. Add Email Verification Page

Create `frontend/src/components/VerifyEmail.js`:

```javascript
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        return;
      }

      try {
        const response = await api.post('/api/email/verify-email', { token }, { skipAuth: true });
        setStatus('success');
        setMessage(response.message);

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } catch (error) {
        setStatus('error');
        setMessage(error.message || 'Verification failed');
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700 p-8 text-center">
        {status === 'verifying' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-white mb-2">Verifying Your Email...</h2>
            <p className="text-slate-400">Please wait while we verify your email address</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-white mb-2">Email Verified!</h2>
            <p className="text-slate-400 mb-4">{message}</p>
            <p className="text-sm text-slate-500">Redirecting to dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-white mb-2">Verification Failed</h2>
            <p className="text-red-400 mb-4">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
```

### 2. Add Forgot Password Page

Create `frontend/src/components/ForgotPassword.js`:

```javascript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/api/email/forgot-password', { email }, { skipAuth: true });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700 p-8 text-center">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-2xl font-bold text-white mb-2">Check Your Email</h2>
          <p className="text-slate-400 mb-6">
            If an account exists with <strong>{email}</strong>, you'll receive a password reset link shortly.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700 p-8">
        <h2 className="text-3xl font-bold text-white mb-2 text-center">Forgot Password?</h2>
        <p className="text-slate-400 text-center mb-6">
          Enter your email and we'll send you a reset link
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/login')}
            className="text-indigo-400 hover:text-indigo-300"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
```

### 3. Add Reset Password Page

Create `frontend/src/components/ResetPassword.js`:

```javascript
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const token = searchParams.get('token');
      await api.post('/api/email/reset-password', { token, password }, { skipAuth: true });

      // Show success and redirect
      alert('Password reset successfully!');
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700 p-8">
        <h2 className="text-3xl font-bold text-white mb-2 text-center">Reset Password</h2>
        <p className="text-slate-400 text-center mb-6">
          Enter your new password
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
```

### 4. Update App.js Routes

```javascript
import VerifyEmail from './components/VerifyEmail';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';

// Add these routes
<Route path="/verify-email" element={<VerifyEmail />} />
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
```

### 5. Update Login.js - Add Forgot Password Link

```javascript
<a
  href="/forgot-password"
  className="text-sm text-indigo-400 hover:text-indigo-300"
>
  Forgot password?
</a>
```

## 🔧 Email Configuration

### Gmail Setup

1. Enable 2-Factor Authentication on your Gmail account
2. Generate App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password

3. Update `.env`:
```env
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-16-char-app-password
MAIL_DEFAULT_SENDER=your-email@gmail.com
```

### Other Email Providers

**SendGrid, Mailgun, etc.** - Update MAIL_SERVER and credentials accordingly.

## 🚀 Testing

1. **Register** → Receive verification email
2. **Click verification link** → Email verified + welcome email
3. **Forgot Password** → Receive reset email
4. **Reset Password** → Password updated
5. **OAuth Login** → Skip email verification (pre-verified)

## ✅ Onboarding Flow

All authentication methods now redirect correctly:
- Email/Password → Onboarding (if not completed)
- Google OAuth → Onboarding (if not completed)
- GitHub OAuth → Onboarding (if not completed)

Track completion with `has_completed_onboarding` field!
