# AuthService Integration Guide

## Overview

Your DevOps Copilot platform uses a **microservices architecture** with separate authentication and business logic services:

```
┌─────────────────────────────────────────────────────────┐
│              Your SaaS Platform                          │
│                                                           │
│  ┌────────────────┐              ┌──────────────────┐   │
│  │  AuthService   │              │    Backend       │   │
│  │  (Flask:8000)  │◄─────────────┤   (Node:5000)    │   │
│  │                │  Validates   │                  │   │
│  │ • Register     │     JWT      │ • Clusters       │   │
│  │ • Login        │              │ • Alerts         │   │
│  │ • OAuth        │              │ • Metrics        │   │
│  │ • JWT Tokens   │              │ • Kafka Consumer │   │
│  │ • Email        │              │ • WebSocket      │   │
│  └────────────────┘              └──────────────────┘   │
│         │                                 │              │
│         ▼                                 ▼              │
│  ┌────────────────┐              ┌──────────────────┐   │
│  │  MongoDB       │              │   MongoDB        │   │
│  │ auth_service_db│              │ devops_copilot   │   │
│  │                │              │                  │   │
│  │ • users        │              │ • clusters       │   │
│  │                │              │ • alerts         │   │
│  │                │              │ • metrics        │   │
│  │                │              │ • events         │   │
│  │                │              │ • resources      │   │
│  └────────────────┘              └──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Architecture Decisions

### ✅ What AuthService Does (Port 8000)
- User registration and login
- OAuth (Google, GitHub)
- JWT token generation and validation
- Email verification
- Password reset
- User management
- **Database**: `auth_service_db.users`

### ✅ What Backend Does (Port 5000)
- Cluster management
- Kafka message consumption
- Alert/metric/event processing
- WebSocket real-time updates
- Agent API key management
- **Database**: `devops_copilot.{clusters,alerts,metrics,events,resources}`

## Changes Made

### 1. **Removed Duplicate Authentication**

**Deleted**:
- `backend/src/models/User.js` ❌
- `backend/src/middleware/auth.js` ❌

**Created**:
- `backend/src/middleware/authServiceIntegration.js` ✅

### 2. **Updated Models**

All models now use `String` for `userId` instead of `ObjectId` reference:

```javascript
// Before (WRONG)
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: true,
}

// After (CORRECT)
userId: {
  type: String, // User ID from AuthService
  required: true,
  index: true,
}
```

**Updated Models**:
- `Cluster.js`
- `Alert.js`
- `Metric.js`
- `Event.js`
- `Resource.js`

### 3. **New Authentication Middleware**

[authServiceIntegration.js](backend/src/middleware/authServiceIntegration.js)

```javascript
const authenticate = async (req, res, next) => {
  // 1. Extract JWT token from Authorization header
  // 2. Call AuthService API: GET /api/auth/validate
  // 3. If valid, attach userId and user to req object
  // 4. If invalid, return 401
};
```

## How It Works

### User Registration & Login Flow

```
┌─────────┐       ┌─────────────┐       ┌──────────────┐
│ Frontend│       │ AuthService │       │   Backend    │
└────┬────┘       └──────┬──────┘       └──────┬───────┘
     │                   │                      │
     │ POST /register    │                      │
     ├──────────────────►│                      │
     │                   │                      │
     │ ◄─────────────────┤                      │
     │ {access_token,    │                      │
     │  user: {...}}     │                      │
     │                   │                      │
     │                   │  POST /clusters/register
     │                   │  Authorization: Bearer <token>
     │                   │                      │
     ├──────────────────────────────────────────►
     │                   │                      │
     │                   │  GET /auth/validate  │
     │                   │ ◄────────────────────┤
     │                   │                      │
     │                   │  {valid: true,       │
     │                   │   user_id: "..."}    │
     │                   ├─────────────────────►│
     │                   │                      │
     │                   │               ✓ Create cluster
     │                   │               with userId
     │                   │                      │
     │ ◄────────────────────────────────────────┤
     │ {cluster, credentials, helmCommand}     │
     │                   │                      │
```

## API Endpoints

### AuthService (Flask - Port 8000)

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/auth/register` | POST | Register new user | `{access_token, refresh_token, user}` |
| `/api/auth/login` | POST | Login user | `{access_token, refresh_token, user}` |
| `/api/auth/refresh` | POST | Refresh access token | `{access_token}` |
| `/api/auth/validate` | GET | Validate JWT token | `{valid: true, user_id}` |
| `/api/auth/me` | GET | Get current user | `{user: {...}}` |
| `/api/oauth/google` | GET | Google OAuth | Redirect to Google |
| `/api/oauth/github` | GET | GitHub OAuth | Redirect to GitHub |

### Backend (Node - Port 5000)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/clusters` | GET | User | List user's clusters |
| `/api/clusters/:id` | GET | User | Get cluster details |
| `/api/clusters/register` | POST | User | Register new cluster |
| `/api/clusters/:id` | PUT | User | Update cluster |
| `/api/clusters/:id` | DELETE | User | Delete cluster |
| `/api/clusters/agent/register` | POST | Agent | Agent registration |
| `/api/clusters/agent/deregister` | POST | Agent | Agent deregistration |

## Environment Variables

### AuthService (.env)

```env
# Flask
PORT=8000
DEBUG=True
SECRET_KEY=your-secret-key
FRONTEND_URL=http://localhost:3000

# JWT
JWT_SECRET_KEY=your-jwt-secret
JWT_ACCESS_TOKEN_EXPIRES=3600
JWT_REFRESH_TOKEN_EXPIRES=2592000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB_NAME=auth_service_db

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Email
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=...
MAIL_PASSWORD=...
```

### Backend (.env)

```env
# Server
NODE_ENV=development
PORT=5000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/devops-copilot

# AuthService Integration
AUTH_SERVICE_URL=http://localhost:8000

# Kafka
KAFKA_BROKERS=192.168.1.242:9092
KAFKA_SECURITY_PROTOCOL=PLAINTEXT

# Features
ENABLE_WEBSOCKET=true
ENABLE_KAFKA_CONSUMER=true

# Frontend
FRONTEND_URL=http://localhost:3000
```

## Frontend Integration

### Login Flow

```javascript
// 1. User logs in via AuthService
const response = await fetch('http://localhost:8000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { access_token, user } = await response.json();

// 2. Store token in localStorage
localStorage.setItem('access_token', access_token);

// 3. Use token for Backend API calls
const clustersResponse = await fetch('http://localhost:5000/api/clusters', {
  headers: {
    'Authorization': `Bearer ${access_token}`
  }
});
```

### Using Both Services

```javascript
// AuthService endpoints
const AUTH_API = 'http://localhost:8000/api';

// Backend endpoints
const BACKEND_API = 'http://localhost:5000/api';

// Login (AuthService)
POST ${AUTH_API}/auth/login

// Register cluster (Backend, validated by AuthService)
POST ${BACKEND_API}/clusters/register
Headers: { Authorization: Bearer <token> }
```

## Running Both Services

### Development

```bash
# Terminal 1: Start MongoDB
docker run -d -p 27017:27017 --name mongo mongo:7

# Terminal 2: Start AuthService
cd AuthService
pip install -r requirements.txt
python server.py
# Running on http://localhost:8000

# Terminal 3: Start Backend
cd backend
npm install
npm run dev
# Running on http://localhost:5000

# Terminal 4: Start Frontend
cd frontend
npm install
npm start
# Running on http://localhost:3000
```

### Production

Both services should run independently:

**AuthService** (Port 8000):
```bash
cd AuthService
gunicorn -w 4 -b 0.0.0.0:8000 server:app
```

**Backend** (Port 5000):
```bash
cd backend
npm install --production
NODE_ENV=production node src/server.js
```

Or use PM2:
```bash
pm2 start src/server.js --name devops-copilot-backend
```

## Security Considerations

### JWT Token Validation

The Backend validates every user request by calling AuthService's `/api/auth/validate` endpoint. This ensures:

1. **Centralized Auth**: Only AuthService manages user sessions
2. **Token Revocation**: If AuthService invalidates a token, Backend immediately rejects it
3. **No Token Duplication**: Backend doesn't store or validate JWT secrets

### API Key vs JWT

- **JWT Tokens**: For user-facing API calls (frontend → backend)
- **API Keys**: For agent-facing API calls (agents → backend)

Agents don't use JWT - they use cluster-specific API keys managed by the Backend.

## Testing the Integration

### 1. Test AuthService

```bash
# Register user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"Test123!@#"}'

# Response: {access_token, refresh_token, user}
```

### 2. Test Backend with AuthService Token

```bash
# Register cluster (using token from AuthService)
curl -X POST http://localhost:5000/api/clusters/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token_from_authservice>" \
  -d '{"name":"test-cluster","clusterType":"kubernetes"}'

# Should return: {cluster, credentials, helmCommand}
```

### 3. Test Agent Authentication

```bash
# Agent registers (using API key from cluster registration)
curl -X POST http://localhost:5000/api/clusters/agent/register \
  -H "X-API-Key: <api_key_from_registration>" \
  -H "X-Agent-ID: <agent_id_from_registration>" \
  -H "Content-Type: application/json" \
  -d '{"version":"1.0.0","kubernetes_version":"1.28.0"}'
```

## Troubleshooting

### "Authentication service unavailable"

**Problem**: Backend can't reach AuthService

**Solutions**:
1. Verify AuthService is running: `curl http://localhost:8000/health`
2. Check `AUTH_SERVICE_URL` in backend `.env`
3. Check firewall/network between services

### "Invalid or expired token"

**Problem**: JWT token is invalid

**Solutions**:
1. Check token hasn't expired (default: 1 hour)
2. Use `/api/auth/refresh` to get new token
3. Ensure `JWT_SECRET_KEY` is same across requests

### "User not found in AuthService"

**Problem**: userId from token doesn't exist

**Solutions**:
1. Check MongoDB `auth_service_db.users` collection
2. Verify user registration was successful
3. Check AuthService logs

## Migration Notes

If you have existing users in the Node backend's User collection:

1. **Export users** from `devops_copilot.users`
2. **Import into** `auth_service_db.users`
3. **Update clusters** to use correct userId strings
4. **Test authentication** flow

## Summary

✅ **No duplicate authentication** - AuthService handles all user auth
✅ **Microservices** - Separate concerns, independent scaling
✅ **Centralized JWT validation** - Backend validates with AuthService
✅ **Two databases** - auth_service_db (users) + devops_copilot (clusters/alerts)
✅ **Two auth methods** - JWT (users) + API keys (agents)

Your setup is now clean with proper separation of concerns!
