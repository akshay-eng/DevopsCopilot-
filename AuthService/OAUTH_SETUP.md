# OAuth Setup Guide - Google & GitHub

This guide will walk you through setting up Google and GitHub OAuth authentication for your Flask app.

## Table of Contents
- [Google OAuth Setup](#google-oauth-setup)
- [GitHub OAuth Setup](#github-oauth-setup)
- [Testing OAuth Flow](#testing-oauth-flow)

---

## Google OAuth Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top and select **"New Project"**
3. Enter a project name (e.g., "Auth Service") and click **Create**
4. Wait for the project to be created and select it

### Step 2: Enable Google+ API

1. In your project, go to **APIs & Services** > **Library**
2. Search for **"Google+ API"** or **"Google Identity"**
3. Click on it and press **Enable**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** (unless you have a Google Workspace)
3. Click **Create**
4. Fill in the required fields:
   - **App name**: Your app name
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click **Save and Continue**
6. On the Scopes screen, click **Add or Remove Scopes**
7. Add these scopes:
   - `userinfo.email`
   - `userinfo.profile`
   - `openid`
8. Click **Save and Continue**
9. Add test users (your email) if in testing mode
10. Click **Save and Continue** and then **Back to Dashboard**

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application** as the application type
4. Enter a name (e.g., "Flask Auth Service")
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:8000/api/oauth/google/callback
   ```
   - For production, add your production URL:
   ```
   https://yourdomain.com/api/oauth/google/callback
   ```
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### Step 5: Add to Environment Variables

Add to your `.env` file:
```env
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:8000/api/oauth/google/callback
```

---

## GitHub OAuth Setup

### Step 1: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** in the left sidebar
3. Click **New OAuth App**

### Step 2: Fill in OAuth App Details

1. **Application name**: Your app name (e.g., "Auth Service")
2. **Homepage URL**:
   ```
   http://localhost:8000
   ```
   - For production: `https://yourdomain.com`
3. **Application description**: (optional)
4. **Authorization callback URL**:
   ```
   http://localhost:8000/api/oauth/github/callback
   ```
   - For production: `https://yourdomain.com/api/oauth/github/callback`
5. Click **Register application**

### Step 3: Generate Client Secret

1. After creating the app, you'll see your **Client ID**
2. Click **Generate a new client secret**
3. Copy both the **Client ID** and **Client Secret** immediately (you won't be able to see the secret again)

### Step 4: Add to Environment Variables

Add to your `.env` file:
```env
GITHUB_CLIENT_ID=your-github-client-id-here
GITHUB_CLIENT_SECRET=your-github-client-secret-here
GITHUB_REDIRECT_URI=http://localhost:8000/api/oauth/github/callback
```

---

## Testing OAuth Flow

### Complete .env File Example

```env
# Flask Configuration
FLASK_ENV=development
SECRET_KEY=your-secret-key-change-this
JWT_SECRET_KEY=your-jwt-secret-key-change-this

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB_NAME=auth_service_db

# JWT Configuration
JWT_ACCESS_TOKEN_EXPIRES=3600
JWT_REFRESH_TOKEN_EXPIRES=2592000

# OAuth - Google
GOOGLE_CLIENT_ID=123456789-abcdefghijk.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnop
GOOGLE_REDIRECT_URI=http://localhost:8000/api/oauth/google/callback

# OAuth - GitHub
GITHUB_CLIENT_ID=Iv1.abcdefghijklmnop
GITHUB_CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz1234567890abcd
GITHUB_REDIRECT_URI=http://localhost:8000/api/oauth/github/callback

# Server Configuration
PORT=8000
DEBUG=True
FRONTEND_URL=http://localhost:3000
```

### Testing Without Frontend

#### 1. Test Google OAuth
Open in your browser:
```
http://localhost:8000/api/oauth/google
```
You'll be redirected to Google login, and after authentication, redirected back with tokens.

#### 2. Test GitHub OAuth
Open in your browser:
```
http://localhost:8000/api/oauth/github
```
You'll be redirected to GitHub login, and after authentication, redirected back with tokens.

### OAuth Flow Explanation

1. **User clicks "Login with Google/GitHub"** on your frontend
2. Frontend redirects to: `http://localhost:8000/api/oauth/google` or `/github`
3. User is redirected to Google/GitHub login page
4. User authorizes your app
5. User is redirected back to callback URL with authorization code
6. Backend exchanges code for access token
7. Backend fetches user info from provider
8. Backend creates/finds user in database
9. Backend generates JWT tokens
10. Backend redirects to frontend with tokens: `http://localhost:3000/auth/callback?access_token=xxx&refresh_token=yyy`

### Frontend Integration Example

```javascript
// Initiate OAuth login
const loginWithGoogle = () => {
  window.location.href = 'http://localhost:8000/api/oauth/google';
};

const loginWithGitHub = () => {
  window.location.href = 'http://localhost:8000/api/oauth/github';
};

// Handle callback in your frontend route (e.g., /auth/callback)
const handleOAuthCallback = () => {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken && refreshToken) {
    // Store tokens
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);

    // Redirect to dashboard
    window.location.href = '/dashboard';
  } else {
    // Handle error
    const error = params.get('error');
    console.error('OAuth error:', error);
  }
};
```

### Common Issues

**1. Redirect URI Mismatch**
- Error: `redirect_uri_mismatch`
- Solution: Ensure the redirect URI in your OAuth app settings exactly matches the one in your `.env` file

**2. Invalid Client Error**
- Error: `invalid_client`
- Solution: Double-check your client ID and secret in `.env`

**3. Email Already Exists**
- If a user registered with email/password tries to login with OAuth using the same email, they'll get an error
- You can modify the code to link accounts instead

**4. Missing OAuth Credentials**
- Error: `None` client ID
- Solution: Make sure you copied the `.env.example` to `.env` and filled in all OAuth credentials

### Production Considerations

1. **Use HTTPS**: OAuth providers require HTTPS in production
2. **Update Redirect URIs**: Add production URLs to both OAuth app settings and `.env`
3. **Secure Secrets**: Never commit `.env` to version control
4. **CORS Configuration**: Configure CORS to only allow your frontend domain
5. **Frontend URL**: Update `FRONTEND_URL` to your production frontend URL

### API Endpoints Added

- `GET /api/oauth/google` - Initiate Google login
- `GET /api/oauth/google/callback` - Google callback handler
- `GET /api/oauth/github` - Initiate GitHub login
- `GET /api/oauth/github/callback` - GitHub callback handler

All existing auth endpoints still work:
- `POST /api/auth/register` - Email/password registration
- `POST /api/auth/login` - Email/password login
- `GET /api/auth/me` - Get current user (works for all auth methods)
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/validate` - Validate token
