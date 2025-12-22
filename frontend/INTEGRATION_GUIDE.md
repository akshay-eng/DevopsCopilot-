# Frontend-Backend Integration Guide

Your React frontend has been successfully integrated with the Flask authentication backend!

## What's Been Integrated

### 1. **API Service Layer** (`/src/services/`)
- **api.js**: Centralized HTTP client with automatic token handling and refresh
- **authService.js**: All authentication-related API calls (register, login, OAuth)

### 2. **Authentication Context** (`/src/context/AuthContext.js`)
- Global authentication state management
- User data management
- Login, register, and logout functions
- OAuth handlers (Google & GitHub)

### 3. **Custom Hooks** (`/src/hooks/useAuth.js`)
- Easy access to authentication context
- Use `useAuth()` in any component to access auth state and functions

### 4. **Protected Routes** (`/src/components/ProtectedRoute.js`)
- Wrapper component to protect routes from unauthenticated access
- Automatically redirects to login if not authenticated

### 5. **OAuth Callback Handler** (`/src/components/OAuthCallback.js`)
- Handles OAuth redirects from Google/GitHub
- Extracts tokens from URL and authenticates user

### 6. **Updated Components**
- **Register.js**: Full backend integration with OAuth buttons
- **Login.js**: Full backend integration with OAuth buttons
- **DashboardLayout.js**: User profile display and logout functionality
- **App.js**: AuthProvider, protected routes, OAuth callback route

## Environment Setup

1. **Copy the environment file:**
   ```bash
   # Already created: frontend/.env.local
   ```

2. **Environment variables:**
   ```env
   REACT_APP_API_URL=http://localhost:5001
   REACT_APP_FRONTEND_URL=http://localhost:3000
   ```

## How to Run

### Backend (Flask Auth Service)

1. **Start MongoDB:**
   ```bash
   mongod
   ```

2. **Activate virtual environment and run:**
   ```bash
   cd AuthService
   source .venv/bin/activate  # or .venv\Scripts\activate on Windows
   python server.py
   ```

   Backend will run on: http://localhost:5001

### Frontend (React App)

1. **Install dependencies (if not already done):**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server:**
   ```bash
   npm start
   ```

   Frontend will run on: http://localhost:3000

## Testing the Integration

### 1. Email/Password Registration
1. Go to http://localhost:3000/register
2. Fill in the form:
   - Full Name: John Doe
   - Company: Acme Inc
   - Email: john@example.com
   - Password: Test1234
3. Click "Create Account"
4. You'll be redirected to onboarding/dashboard

### 2. Email/Password Login
1. Go to http://localhost:3000/login
2. Enter credentials:
   - Email: john@example.com
   - Password: Test1234
3. Click "Sign In"
4. You'll be redirected to dashboard

### 3. Google OAuth
1. **First, set up Google OAuth** (see `AuthService/OAUTH_SETUP.md`)
2. Click "Continue with Google" on login or register page
3. You'll be redirected to Google login
4. After authentication, you'll be redirected back and logged in

### 4. GitHub OAuth
1. **First, set up GitHub OAuth** (see `AuthService/OAUTH_SETUP.md`)
2. Click "Continue with GitHub" on login or register page
3. You'll be redirected to GitHub login
4. After authentication, you'll be redirected back and logged in

### 5. Protected Routes
1. Try accessing http://localhost:3000/dashboard without logging in
2. You'll be automatically redirected to login page
3. After logging in, you'll have access to protected routes

### 6. Logout
1. In the dashboard, click on your profile at the bottom of the sidebar
2. Click "Logout"
3. You'll be logged out and redirected to login page

## Features Implemented

✅ **User Registration** - Email/password with validation
✅ **User Login** - Email/password authentication
✅ **OAuth Integration** - Google and GitHub sign-in
✅ **JWT Token Management** - Automatic token refresh
✅ **Protected Routes** - Redirect unauthenticated users
✅ **User Profile Display** - Show user info in dashboard
✅ **Logout Functionality** - Clear tokens and redirect
✅ **Error Handling** - Display user-friendly error messages
✅ **Loading States** - Show loading spinners during API calls
✅ **Avatar Support** - Display OAuth profile pictures

## API Endpoints

Your frontend is now connected to these backend endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/me` | GET | Get current user info |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/validate` | GET | Validate current token |
| `/api/oauth/google` | GET | Initiate Google OAuth |
| `/api/oauth/google/callback` | GET | Google OAuth callback |
| `/api/oauth/github` | GET | Initiate GitHub OAuth |
| `/api/oauth/github/callback` | GET | GitHub OAuth callback |

## How It Works

### Registration Flow
```
User fills form → authService.register() → API POST /api/auth/register
                                        ↓
                              Store tokens in localStorage
                                        ↓
                              Update AuthContext with user data
                                        ↓
                              Redirect to /onboarding
```

### Login Flow
```
User submits credentials → authService.login() → API POST /api/auth/login
                                              ↓
                                Store tokens in localStorage
                                              ↓
                                Update AuthContext with user data
                                              ↓
                                Redirect to /dashboard
```

### OAuth Flow
```
User clicks OAuth button → Redirect to /api/oauth/google or /github
                                        ↓
                        User authorizes on Google/GitHub
                                        ↓
                    Redirect to /auth/callback?access_token=xxx&refresh_token=yyy
                                        ↓
                              OAuthCallback component extracts tokens
                                        ↓
                              Store tokens in localStorage
                                        ↓
                              Fetch user data from /api/auth/me
                                        ↓
                              Update AuthContext with user data
                                        ↓
                              Redirect to /dashboard
```

### Protected Route Flow
```
User navigates to /dashboard → ProtectedRoute checks isAuthenticated
                                        ↓
                        Is authenticated? ─── NO ──→ Redirect to /login
                            │
                          YES
                            ↓
                    Render Dashboard
```

### Token Refresh Flow
```
API request fails with 401 → api.js attempts token refresh
                                        ↓
                        POST /api/auth/refresh with refresh_token
                                        ↓
                        Success? ─── NO ──→ Logout and redirect to /login
                            │
                          YES
                            ↓
                    Store new access token
                            ↓
                    Retry original request
```

## User Data Available

After authentication, the following user data is available via `useAuth()`:

```javascript
const { user } = useAuth();

// user object contains:
{
  id: "507f1f77bcf86cd799439011",
  email: "user@example.com",
  username: "johndoe",
  full_name: "John Doe",           // From OAuth or null
  avatar_url: "https://...",       // From OAuth or null
  oauth_provider: "google",        // "google", "github", or null
  created_at: "2024-01-01T12:00:00",
  updated_at: "2024-01-01T12:00:00"
}
```

## Common Issues & Solutions

### Issue: CORS Error
**Solution**: Make sure Flask backend has CORS enabled (already configured)

### Issue: API calls return 404
**Solution**: Check that backend is running on port 8000 and frontend .env.local has correct API_URL

### Issue: OAuth redirect doesn't work
**Solution**:
1. Check that OAuth credentials are set up in backend `.env`
2. Verify redirect URIs match in OAuth app settings
3. Check that FRONTEND_URL in backend `.env` matches your frontend URL

### Issue: Token expired
**Solution**: Token refresh is automatic, but if it fails, you'll be logged out automatically

### Issue: User data not showing
**Solution**: Check browser console for errors, ensure `/api/auth/me` endpoint is working

## Next Steps

You can now:

1. **Customize the onboarding flow** - Add your own steps after registration
2. **Add more user fields** - Extend the user model for additional data
3. **Implement password reset** - Add forgot password functionality
4. **Add email verification** - Verify user emails after registration
5. **Implement roles** - Add role-based access control
6. **Add more OAuth providers** - Twitter, Microsoft, etc.
7. **Connect real backend APIs** - Integrate with your Kubernetes/DevOps services

## File Structure

```
frontend/
├── src/
│   ├── services/
│   │   ├── api.js                    # HTTP client
│   │   └── authService.js            # Auth API calls
│   ├── context/
│   │   ├── AuthContext.js            # Auth state management
│   │   └── ThemeContext.js           # Theme state
│   ├── hooks/
│   │   └── useAuth.js                # Auth hook
│   ├── components/
│   │   ├── Login.js                  # ✅ Updated
│   │   ├── Register.js               # ✅ Updated
│   │   ├── DashboardLayout.js        # ✅ Updated
│   │   ├── OAuthCallback.js          # ✅ New
│   │   ├── ProtectedRoute.js         # ✅ New
│   │   └── ...
│   └── App.js                        # ✅ Updated
├── .env.local                        # ✅ New
└── INTEGRATION_GUIDE.md             # This file

AuthService/
├── app/
│   ├── routes/
│   │   ├── auth_routes.py           # Email/password auth
│   │   └── oauth_routes.py          # OAuth (Google/GitHub)
│   ├── models/
│   │   └── user_model.py            # User model with OAuth
│   └── ...
├── .env                             # Backend config
└── OAUTH_SETUP.md                   # OAuth setup guide
```

## Support

If you encounter any issues:

1. Check browser console for errors
2. Check backend terminal for errors
3. Verify MongoDB is running
4. Ensure all environment variables are set correctly
5. Check that OAuth credentials are configured (if using OAuth)

Happy coding! 🚀
