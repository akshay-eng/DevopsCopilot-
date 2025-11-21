## DevOps Copilot Backend

Node.js/Express backend service with Kafka consumers for the DevOps Copilot AIOps platform.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           DevOps Copilot Backend                     │
│                                                       │
│  ┌──────────────┐         ┌──────────────┐          │
│  │  Express API │         │    Kafka     │          │
│  │   Server     │         │  Consumers   │          │
│  │              │         │              │          │
│  │  • REST API  │         │  • Alerts    │          │
│  │  • WebSocket │         │  • Metrics   │          │
│  │  • Auth      │         │  • Events    │          │
│  └──────────────┘         │  • Resources │          │
│         │                 └──────────────┘          │
│         │                        │                   │
│         ▼                        ▼                   │
│  ┌─────────────────────────────────────┐            │
│  │          MongoDB Database            │            │
│  │                                      │            │
│  │  • Users      • Metrics              │            │
│  │  • Clusters   • Events               │            │
│  │  • Alerts     • Resources            │            │
│  └─────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

## Features

- **REST API**: Cluster management, authentication, data queries
- **Kafka Consumers**: Real-time data ingestion from agents
- **WebSocket**: Real-time updates to frontend
- **MongoDB**: Scalable data storage with time-series optimization
- **JWT Authentication**: Secure user and agent authentication
- **Rate Limiting**: API protection
- **Error Tracking**: Structured logging with Winston

## Prerequisites

- Node.js 18+
- MongoDB 7+
- Kafka (running on your SaaS server)
- npm or yarn

## Installation

### Local Development

1. **Clone and install dependencies:**
```bash
cd backend
npm install
```

2. **Create `.env` file:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start MongoDB (if not running):**
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongo mongo:7
```

4. **Start the server:**
```bash
npm run dev
```

The server will start on `http://localhost:5000`

### Docker Development

```bash
# Build and run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop
docker-compose down
```

## Configuration

All configuration is done via environment variables. See [.env.example](.env.example) for the full list.

### Required Variables

```env
# Database
MONGODB_URI=mongodb://localhost:27017/devops-copilot

# JWT
JWT_SECRET=your-super-secret-key

# Kafka
KAFKA_BROKERS=stallion:9092

# Frontend
FRONTEND_URL=http://localhost:3000
```

## API Endpoints

### Cluster Management

#### Register New Cluster
```http
POST /api/clusters/register
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "production-cluster",
  "clusterType": "kubernetes",
  "metadata": {
    "environment": "production",
    "region": "us-west-2"
  }
}
```

**Response:**
```json
{
  "success": true,
  "cluster": {
    "id": "...",
    "agentId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "production-cluster",
    "status": "pending"
  },
  "credentials": {
    "agentId": "550e8400-e29b-41d4-a716-446655440000",
    "apiKey": "generated-api-key",
    "userId": "user-id"
  },
  "helmCommand": "helm install devops-copilot..."
}
```

#### List Clusters
```http
GET /api/clusters
Authorization: Bearer <jwt-token>
```

#### Get Cluster Details
```http
GET /api/clusters/:id
Authorization: Bearer <jwt-token>
```

#### Update Cluster
```http
PUT /api/clusters/:id
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "new-name",
  "features": {
    "metricsCollection": true,
    "alertWatching": false
  }
}
```

#### Delete Cluster
```http
DELETE /api/clusters/:id
Authorization: Bearer <jwt-token>
```

### Agent Endpoints

#### Agent Registration
```http
POST /api/clusters/agent/register
X-API-Key: <agent-api-key>
X-Agent-ID: <agent-id>
Content-Type: application/json

{
  "version": "1.0.0",
  "kubernetes_version": "1.28.0",
  "features": {
    "metricsCollection": true,
    "logCollection": true
  }
}
```

#### Agent Deregistration
```http
POST /api/clusters/agent/deregister
X-API-Key: <agent-api-key>
X-Agent-ID: <agent-id>
```

## Kafka Topics

The backend consumes from the following Kafka topics:

| Topic | Purpose | Data Model |
|-------|---------|------------|
| `alerts` | Alert events from Prometheus/Grafana | Alert |
| `metrics` | Cluster metrics from Prometheus | Metric |
| `k8s-events` | Kubernetes events | Event |
| `resources` | K8s resource changes | Resource |
| `heartbeats` | Agent heartbeat signals | - |

## WebSocket Events

### Client → Server

```javascript
// Connect with authentication
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to cluster updates
socket.emit('subscribe:cluster', clusterId);

// Unsubscribe
socket.emit('unsubscribe:cluster', clusterId);
```

### Server → Client

```javascript
// New alert
socket.on('alert', (data) => {
  console.log('New alert:', data.alert);
  console.log('From cluster:', data.clusterName);
});

// Metrics update
socket.on('metrics', (data) => {
  console.log('Metrics:', data.metrics);
});

// New event
socket.on('event', (data) => {
  console.log('Event:', data.event);
});

// Resource change
socket.on('resource', (data) => {
  console.log('Resource updated:', data.resource);
  console.log('Event type:', data.eventType); // ADDED, MODIFIED, DELETED
});
```

## Database Models

### User
- Email, password, OAuth providers
- Role-based access control
- Email verification
- Password reset

### Cluster
- Agent ID and API key
- Status (pending, connected, disconnected)
- Configuration and features
- Heartbeat tracking

### Alert
- Alert details from Prometheus
- Status (firing, resolved, acknowledged)
- Severity (critical, warning, info)
- Deduplication by fingerprint

### Metric
- Time-series metrics data
- Cluster, pod, and node metrics
- TTL: 30 days

### Event
- Kubernetes events
- Type (Normal, Warning, Error)
- TTL: 7 days

### Resource
- Kubernetes resources (pods, services, etc.)
- Event type (ADDED, MODIFIED, DELETED)
- Soft delete for DELETED events

## Development

### Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.js   # MongoDB connection
│   │   └── kafka.js      # Kafka configuration
│   ├── middleware/       # Express middleware
│   │   ├── auth.js       # Authentication
│   │   └── errorHandler.js
│   ├── models/           # MongoDB models
│   │   ├── User.js
│   │   ├── Cluster.js
│   │   ├── Alert.js
│   │   ├── Metric.js
│   │   ├── Event.js
│   │   └── Resource.js
│   ├── routes/           # API routes
│   │   └── clusters.js
│   ├── services/         # Business logic
│   │   ├── kafkaConsumer.js
│   │   └── websocket.js
│   ├── utils/            # Utilities
│   │   └── logger.js
│   └── server.js         # Main entry point
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Deployment

### Docker

```bash
# Build image
docker build -t devopscopilot/backend:latest .

# Run container
docker run -d \
  --name devops-copilot-backend \
  -p 5000:5000 \
  -e MONGODB_URI=mongodb://mongo:27017/devops-copilot \
  -e KAFKA_BROKERS=kafka:9092 \
  devopscopilot/backend:latest
```

### Production Considerations

1. **MongoDB**:
   - Use replica set for high availability
   - Enable authentication
   - Set up indexes properly

2. **Kafka**:
   - Enable SASL authentication
   - Use SSL/TLS
   - Monitor consumer lag

3. **Application**:
   - Set `NODE_ENV=production`
   - Use process manager (PM2, systemd)
   - Enable logging to files
   - Set up monitoring (Sentry)
   - Configure proper CORS origins

4. **Security**:
   - Use strong JWT secrets
   - Enable rate limiting
   - Use HTTPS
   - Implement API key rotation

## Monitoring

### Health Check

```bash
curl http://localhost:5000/health
```

### Logs

```bash
# Development
npm run dev

# Production (JSON logs)
tail -f logs/combined.log | jq
```

## Troubleshooting

### Kafka Consumer Not Receiving Messages

1. Check Kafka connectivity:
```bash
docker exec -it broker kafka-topics --bootstrap-server localhost:9092 --list
```

2. Verify topics exist:
```bash
docker exec -it broker kafka-topics --bootstrap-server localhost:9092 --describe --topic alerts
```

3. Check consumer group:
```bash
docker exec -it broker kafka-consumer-groups --bootstrap-server localhost:9092 --group devops-copilot-consumers --describe
```

### MongoDB Connection Issues

1. Check MongoDB is running:
```bash
docker ps | grep mongo
```

2. Test connection:
```bash
mongosh mongodb://localhost:27017/devops-copilot
```

### WebSocket Not Connecting

1. Verify CORS settings in `.env`
2. Check JWT token is valid
3. Ensure `ENABLE_WEBSOCKET=true`

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/devopscopilot/backend
- Email: support@devopscopilot.com
