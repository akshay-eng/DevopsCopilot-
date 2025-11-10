from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure


# Global database connection
db = None
client = None


def init_db(app):
    """Initialize MongoDB connection"""
    global db, client

    try:
        # Connect to MongoDB
        client = MongoClient(
            app.config['MONGODB_URI'],
            serverSelectionTimeoutMS=5000
        )

        # Test the connection
        client.admin.command('ping')

        # Get database
        db = client[app.config['MONGODB_DB_NAME']]

        # Create indexes for better performance
        db.users.create_index([('email', ASCENDING)], unique=True)
        db.users.create_index([('username', ASCENDING)], unique=True)
        # Index for OAuth users
        db.users.create_index([('oauth_provider', ASCENDING), ('oauth_id', ASCENDING)], unique=True, sparse=True)

        print(f"✓ Connected to MongoDB: {app.config['MONGODB_DB_NAME']}")

    except ConnectionFailure as e:
        print(f"✗ Failed to connect to MongoDB: {e}")
        raise


def get_db():
    """Get database instance"""
    return db


def close_db():
    """Close database connection"""
    global client
    if client:
        client.close()
        print("✓ MongoDB connection closed")
