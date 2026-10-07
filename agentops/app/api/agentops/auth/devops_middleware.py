"""
DevOps Copilot JWT Authentication Middleware for AgentOps
Replaces AgentOps cookie-based auth with JWT validation from DevOps Copilot
"""

import jwt
import os
from fastapi import Request, HTTPException, status
from fastapi.routing import APIRoute
from typing import Callable
from agentops.api.log_config import logger

# Get JWT secret from environment (should match DevOps Copilot)
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key-change-in-production')
DEVOPS_COPILOT_MODE = os.getenv('DEVOPS_COPILOT_MODE', 'false').lower() == 'true'


class DevOpsCopilotAuthRoute(APIRoute):
    """
    Route class that validates DevOps Copilot JWT tokens.
    
    Replaces AgentOps cookie-based authentication when DEVOPS_COPILOT_MODE=true.
    Populates request.state.user_id with the authenticated user's ID from JWT.
    
    Usage:
        from fastapi import FastAPI, APIRouter
        from agentops.auth.devops_middleware import DevOpsCopilotAuthRoute
        
        app = FastAPI()
        router = APIRouter(route_class=DevOpsCopilotAuthRoute)
        app.include_router(router)
    """
    
    def _get_user_id_from_jwt(self, request: Request) -> str:
        """
        Extract and validate JWT token from Authorization header.
        
        Returns:
            user_id (str): The user ID from the JWT payload
            
        Raises:
            HTTPException: If token is missing, expired, or invalid
        """
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            logger.warning("No Authorization header provided")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No authentication token provided",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not auth_header.startswith('Bearer '):
            logger.warning(f"Invalid Authorization header format: {auth_header[:20]}...")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication header format. Expected 'Bearer <token>'",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        token = auth_header.split(' ')[1]
        
        try:
            # Decode and validate JWT
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get('id')
            
            if not user_id:
                logger.error("JWT payload missing 'id' field")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token payload: missing user ID"
                )
            
            logger.debug(f"Authenticated user: {user_id}")
            return user_id
            
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidTokenError as e:
            logger.error(f"Invalid JWT token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            logger.error(f"Unexpected error validating JWT: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication error"
            )
    
    def get_route_handler(self) -> Callable:
        """
        Override the default route handler to inject JWT authentication logic.
        
        This method wraps the original route handler to ensure that the user_id
        is populated in request.state.user_id before calling the handler.
        
        If the endpoint is marked as public (is_public=True), it will not raise
        an exception when authentication fails.
        """
        original_route_handler = super().get_route_handler()
        
        async def custom_route_handler(request: Request):
            # Check if endpoint is public
            is_public = getattr(self.endpoint, 'is_public', False)
            
            if not is_public:
                try:
                    # Validate JWT and extract user_id
                    request.state.user_id = self._get_user_id_from_jwt(request)
                    
                    # Also set session-like object for compatibility
                    # Some AgentOps code might expect request.state.session
                    class DevOpsSession:
                        def __init__(self, user_id):
                            self.user_id = user_id
                    
                    request.state.session = DevOpsSession(request.state.user_id)
                    
                except HTTPException as e:
                    # Re-raise authentication errors for protected endpoints
                    raise e
            else:
                # For public endpoints, set user_id to None
                request.state.user_id = None
                request.state.session = None
            
            # Call the original route handler
            response = await original_route_handler(request)
            return response
        
        return custom_route_handler


# Helper function to mark endpoints as public
def public_endpoint(func):
    """
    Decorator to mark an endpoint as public (no authentication required).
    
    Usage:
        @router.get("/health")
        @public_endpoint
        async def health_check():
            return {"status": "healthy"}
    """
    func.is_public = True
    return func
