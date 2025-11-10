# Flask Authentication Service with MongoDB & JWT

A production-ready authentication service built with Flask, MongoDB, and JWT tokens. This boilerplate provides user registration, login, OAuth authentication (Google & GitHub), and token-based authentication endpoints.

## Features

- **Email/Password Authentication** - Traditional registration and login
- **OAuth Authentication** - Sign in with Google and GitHub
- **JWT Tokens** - Access & Refresh token support
- **Password Security** - Password hashing with Werkzeug
- **MongoDB Integration** - NoSQL database with indexes
- **CORS Enabled** - Ready for frontend integration
- **Input Validation** - Email, password strength, username rules
- **Environment Config** - Development vs production settings
- **Clean Architecture** - Following best practices

## Project Structure

```
AuthService/
├── app/
│   ├── __init__.py          # App factory with OAuth setup
│   ├── database.py          # MongoDB connection & indexes
│   ├── models/
│   │   ├── __init__.py
│   │   └── user_model.py    # User model with OAuth support
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth_routes.py   # Email/password auth endpoints
│   │   └── oauth_routes.py  # OAuth endpoints (Google/GitHub)
│   └── utils/
│       ├── __init__.py
│       ├── validators.py    # Input validation functions
│       └── oauth_utils.py   # OAuth initialization
├── config.py                # Configuration classes
├── server.py               # Application entry point
├── requirements.txt        # Python dependencies
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore rules
├── README.md             # Main documentation
└── OAUTH_SETUP.md        # Detailed OAuth setup guide
```

## Prerequisites

- Python 3.8+
- MongoDB (local or cloud instance like MongoDB Atlas)

## Setup Instructions

### 1. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and update the values:
```env
SECRET_KEY=your-secure-secret-key
JWT_SECRET_KEY=your-secure-jwt-secret-key
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB_NAME=auth_service_db
```

### 2. Set Up OAuth (Optional)

If you want to enable Google and GitHub login, follow the detailed guide in [OAUTH_SETUP.md](OAUTH_SETUP.md) to:
- Create Google OAuth credentials
- Create GitHub OAuth app
- Add credentials to your `.env` file

**Note**: The app will work without OAuth - users can still register/login with email/password.

### 3. Install Dependencies

```bash
# Activate your virtual environment first
source .venv/bin/activate  # On Linux/Mac
# or
.venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt
```

### 4. Start MongoDB

Make sure MongoDB is running:
```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud) - just update MONGODB_URI in .env
```

### 5. Run the Application

```bash
python server.py
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Authentication Endpoints

#### 1. Health Check
```http
GET /
```
Response:
```json
{
  "message": "Auth Service API is running",
  "status": "healthy"
}
```

### 2. Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123"
}
```

Response (201 Created):
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "username": "johndoe",
    "created_at": "2024-01-01T12:00:00",
    "updated_at": "2024-01-01T12:00:00"
  },
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

### 3. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

Response (200 OK):
```json
{
  "message": "Login successful",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "username": "johndoe"
  },
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

### 4. Get Current User (Protected)
```http
GET /api/auth/me
Authorization: Bearer <access_token>
```

Response (200 OK):
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "username": "johndoe"
  }
}
```

### 5. Refresh Token
```http
POST /api/auth/refresh
Authorization: Bearer <refresh_token>
```

Response (200 OK):
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

### 6. Validate Token
```http
GET /api/auth/validate
Authorization: Bearer <access_token>
```

Response (200 OK):
```json
{
  "valid": true,
  "user_id": "507f1f77bcf86cd799439011"
}
```

### OAuth Endpoints

#### 7. Login with Google
```http
GET /api/oauth/google
```
Redirects user to Google login. After authentication, user is redirected to:
```
http://localhost:3000/auth/callback?access_token=xxx&refresh_token=yyy
```

#### 8. Login with GitHub
```http
GET /api/oauth/github
```
Redirects user to GitHub login. After authentication, user is redirected to:
```
http://localhost:3000/auth/callback?access_token=xxx&refresh_token=yyy
```

**Note**: See [OAUTH_SETUP.md](OAUTH_SETUP.md) for detailed setup instructions.

## Validation Rules

### Email
- Must be valid email format

### Username
- 3-20 characters
- Start with a letter
- Only letters, numbers, and underscores

### Password
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit

## Security Features

- **Password Hashing** - Werkzeug's secure hash function
- **JWT Tokens** - Stateless authentication with access/refresh tokens
- **Unique Constraints** - Database indexes on email, username, and OAuth IDs
- **Input Validation** - Email, password strength, username format
- **OAuth Security** - Secure third-party authentication flow
- **CORS Enabled** - Configurable for frontend integration

## Testing

### Testing with cURL

```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"Test1234"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'

# Get user (replace TOKEN with actual token)
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

### Testing OAuth

Open in your browser:
```
http://localhost:8000/api/oauth/google
http://localhost:8000/api/oauth/github
```
You'll be redirected to the provider, then back to your frontend with tokens.

## Next Steps for Learning

Here are some areas you can explore and extend:

1. **Add email verification** - Send confirmation emails on registration
2. **Password reset** - Implement forgot password functionality
3. **User profiles** - Add profile update endpoints
4. **Rate limiting** - Prevent brute force attacks
5. **Logout/Token blacklist** - Invalidate tokens on logout
6. **Role-based access** - Add admin/user roles
7. **More OAuth providers** - Twitter, Facebook, Microsoft
8. **Testing** - Write unit and integration tests
9. **Logging** - Add proper logging for debugging
10. **Docker** - Containerize the application
11. **Account linking** - Link OAuth and email/password accounts
12. **Profile updates** - Allow users to update their information

## Common Issues

**MongoDB Connection Error:**
- Ensure MongoDB is running
- Check MONGODB_URI in .env file
- For MongoDB Atlas, whitelist your IP address

**Module Not Found:**
- Activate virtual environment
- Run `pip install -r requirements.txt`

**Port Already in Use:**
- Change PORT in .env file
- Or kill the process using port 8000

## License

MIT License - Feel free to use for learning and projects!
