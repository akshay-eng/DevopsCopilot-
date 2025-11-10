from datetime import datetime
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from app.database import get_db


class User:
    """User model for MongoDB"""

    def __init__(self, email, username, password=None, _id=None, created_at=None, updated_at=None,
                 oauth_provider=None, oauth_id=None, avatar_url=None, full_name=None,
                 email_verified=False, reset_token=None, reset_token_expiry=None, has_completed_onboarding=False):
        self._id = _id
        self.email = email.lower()
        self.username = username
        self.password = password  # None for OAuth users
        self.oauth_provider = oauth_provider  # 'google' or 'github'
        self.oauth_id = oauth_id  # Provider's user ID
        self.avatar_url = avatar_url
        self.full_name = full_name
        self.email_verified = email_verified  # Email verification status
        self.reset_token = reset_token  # Password reset token
        self.reset_token_expiry = reset_token_expiry  # Token expiry time
        self.has_completed_onboarding = has_completed_onboarding  # Onboarding status
        self.created_at = created_at or datetime.utcnow()
        self.updated_at = updated_at or datetime.utcnow()

    def to_dict(self):
        """Convert user object to dictionary (excludes password and tokens)"""
        return {
            'id': str(self._id),
            'email': self.email,
            'username': self.username,
            'full_name': self.full_name,
            'avatar_url': self.avatar_url,
            'oauth_provider': self.oauth_provider,
            'email_verified': self.email_verified,
            'has_completed_onboarding': self.has_completed_onboarding,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def hash_password(password):
        """Hash a password"""
        return generate_password_hash(password)

    @staticmethod
    def verify_password(password_hash, password):
        """Verify a password against its hash"""
        return check_password_hash(password_hash, password)

    @staticmethod
    def create_user(email, username, password):
        """Create a new user in the database"""
        db = get_db()

        # Hash the password
        hashed_password = User.hash_password(password)

        user_data = {
            'email': email.lower(),
            'username': username,
            'password': hashed_password,
            'email_verified': False,
            'has_completed_onboarding': False,
            'reset_token': None,
            'reset_token_expiry': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = db.users.insert_one(user_data)
        user_data['_id'] = result.inserted_id

        return User(**user_data)

    @staticmethod
    def find_by_email(email):
        """Find user by email"""
        db = get_db()
        user_data = db.users.find_one({'email': email.lower()})

        if user_data:
            return User(**user_data)
        return None

    @staticmethod
    def find_by_username(username):
        """Find user by username"""
        db = get_db()
        user_data = db.users.find_one({'username': username})

        if user_data:
            return User(**user_data)
        return None

    @staticmethod
    def find_by_id(user_id):
        """Find user by ID"""
        db = get_db()
        try:
            user_data = db.users.find_one({'_id': ObjectId(user_id)})
            if user_data:
                return User(**user_data)
        except Exception:
            pass
        return None

    @staticmethod
    def email_exists(email):
        """Check if email already exists"""
        return User.find_by_email(email) is not None

    @staticmethod
    def username_exists(username):
        """Check if username already exists"""
        return User.find_by_username(username) is not None

    @staticmethod
    def find_by_oauth(provider, oauth_id):
        """Find user by OAuth provider and ID"""
        db = get_db()
        user_data = db.users.find_one({
            'oauth_provider': provider,
            'oauth_id': oauth_id
        })

        if user_data:
            return User(**user_data)
        return None

    @staticmethod
    def create_oauth_user(email, username, provider, oauth_id, avatar_url=None, full_name=None):
        """Create a new OAuth user in the database"""
        db = get_db()

        user_data = {
            'email': email.lower(),
            'username': username,
            'password': None,  # OAuth users don't have passwords
            'oauth_provider': provider,
            'oauth_id': oauth_id,
            'avatar_url': avatar_url,
            'full_name': full_name,
            'email_verified': True,  # OAuth emails are pre-verified
            'has_completed_onboarding': False,
            'reset_token': None,
            'reset_token_expiry': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = db.users.insert_one(user_data)
        user_data['_id'] = result.inserted_id

        return User(**user_data)

    def update_onboarding_status(self, completed=True):
        """Mark onboarding as completed"""
        db = get_db()
        db.users.update_one(
            {'_id': self._id},
            {'$set': {
                'has_completed_onboarding': completed,
                'updated_at': datetime.utcnow()
            }}
        )
        self.has_completed_onboarding = completed

    def verify_email(self):
        """Mark email as verified"""
        db = get_db()
        db.users.update_one(
            {'_id': self._id},
            {'$set': {
                'email_verified': True,
                'updated_at': datetime.utcnow()
            }}
        )
        self.email_verified = True

    def set_reset_token(self, token, expiry):
        """Set password reset token"""
        db = get_db()
        db.users.update_one(
            {'_id': self._id},
            {'$set': {
                'reset_token': token,
                'reset_token_expiry': expiry,
                'updated_at': datetime.utcnow()
            }}
        )
        self.reset_token = token
        self.reset_token_expiry = expiry

    def clear_reset_token(self):
        """Clear password reset token"""
        db = get_db()
        db.users.update_one(
            {'_id': self._id},
            {'$set': {
                'reset_token': None,
                'reset_token_expiry': None,
                'updated_at': datetime.utcnow()
            }}
        )
        self.reset_token = None
        self.reset_token_expiry = None

    def update_password(self, new_password):
        """Update user password"""
        db = get_db()
        hashed_password = User.hash_password(new_password)
        db.users.update_one(
            {'_id': self._id},
            {'$set': {
                'password': hashed_password,
                'updated_at': datetime.utcnow()
            }}
        )
        self.password = hashed_password

    @staticmethod
    def find_by_reset_token(token):
        """Find user by reset token"""
        db = get_db()
        user_data = db.users.find_one({
            'reset_token': token,
            'reset_token_expiry': {'$gt': datetime.utcnow()}
        })

        if user_data:
            return User(**user_data)
        return None
