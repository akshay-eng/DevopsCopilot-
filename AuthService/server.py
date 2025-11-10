import os
from app import create_app
from config import config

# Determine environment
env = os.getenv('FLASK_ENV', 'development')
app = create_app(env)

if __name__ == '__main__':
    port = app.config.get('PORT', 8000)
    debug = app.config.get('DEBUG', True)

    print(f"\n{'='*50}")
    print(f"Starting Auth Service")
    print(f"Environment: {env}")
    print(f"Port: {port}")
    print(f"Debug: {debug}")
    print(f"{'='*50}\n")

    app.run(debug=debug, port=port, host='0.0.0.0')