#!/usr/bin/env python3
"""
Direct Database Test Agent
This script bypasses AgentOps SDK and writes traces directly to PostgreSQL.
"""

import os
import sys
import json
import psycopg2
from psycopg2.extras import Json
from datetime import datetime
from uuid import uuid4
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# Load environment variables
load_dotenv()

# Configuration
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
USER_ID = os.getenv('USER_ID', 'test-user')

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'agentops',
    'user': 'agentops',
    'password': 'agentops_secret'
}

if not OPENAI_API_KEY:
    print("❌ Error: OPENAI_API_KEY not found in .env file")
    sys.exit(1)

# Create LLM
llm = ChatOpenAI(
    model="gpt-3.5-turbo",
    temperature=0,
    openai_api_key=OPENAI_API_KEY
)

def get_or_create_project(conn):
    """Get or create a default project."""
    with conn.cursor() as cur:
        # Check if default project exists
        cur.execute("SELECT id, api_key FROM projects WHERE name = 'Default Project' LIMIT 1")
        result = cur.fetchone()

        if result:
            print(f"✅ Using existing project: {result[0]}")
            return result[0], result[1]

        # Create new project
        project_id = str(uuid4())
        api_key = f"ao_{uuid4().hex[:32]}"

        cur.execute(
            "INSERT INTO projects (id, name, api_key) VALUES (%s, %s, %s)",
            (project_id, 'Default Project', api_key)
        )
        conn.commit()

        print(f"✅ Created new project: {project_id}")
        return project_id, api_key

def create_session(conn, project_id):
    """Create a new session in the database."""
    session_id = str(uuid4())
    init_timestamp = datetime.now()

    with conn.cursor() as cur:
        # Insert session
        cur.execute(
            """
            INSERT INTO sessions (id, project_id, init_timestamp, tags, host_env)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                session_id,
                project_id,
                init_timestamp,
                ['simple-agent', f'user:{USER_ID}', 'environment:test'],
                Json({'platform': 'python', 'sdk': 'direct-db'})
            )
        )

        # Initialize stats
        cur.execute(
            """
            INSERT INTO stats (session_id, cost, llm_calls, tool_calls, errors)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (session_id, 0.0, 0, 0, 0)
        )

        conn.commit()

    print(f"✅ Created session: {session_id}")
    return session_id, init_timestamp

def record_llm_event(conn, session_id, query, response, start_time, end_time, cost=0.001):
    """Record an LLM event in the database."""
    event_id = str(uuid4())

    with conn.cursor() as cur:
        # Insert event
        cur.execute(
            """
            INSERT INTO events (id, session_id, event_type, init_timestamp, end_timestamp, params)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                event_id,
                session_id,
                'llm',
                start_time,
                end_time,
                Json({
                    'model': 'gpt-3.5-turbo',
                    'prompt': query,
                    'completion': response,
                    'cost': cost
                })
            )
        )

        # Update stats
        cur.execute(
            """
            UPDATE stats
            SET llm_calls = llm_calls + 1,
                cost = cost + %s
            WHERE session_id = %s
            """,
            (cost, session_id)
        )

        conn.commit()

def end_session(conn, session_id, init_timestamp, end_state='Success', end_state_reason=None):
    """End a session."""
    end_timestamp = datetime.now()
    duration = (end_timestamp - init_timestamp).total_seconds()

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE sessions
            SET end_timestamp = %s,
                end_state = %s,
                end_state_reason = %s
            WHERE id = %s
            """,
            (end_timestamp, end_state, end_state_reason, session_id)
        )
        conn.commit()

    print(f"✅ Ended session: {session_id} (duration: {duration:.2f}s, status: {end_state})")

def run_test():
    """Run simple LLM queries and record traces directly to database."""

    test_queries = [
        "What is 25 * 4 + 10?",
        "Tell me a fun fact about Python programming.",
        "What is the capital of France?",
        "Explain what machine learning is in one sentence.",
    ]

    print("\n" + "="*60)
    print("🧪 Running Direct Database Test Queries")
    print("="*60 + "\n")

    # Connect to database
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("✅ Connected to PostgreSQL database\n")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        sys.exit(1)

    try:
        # Get or create project
        project_id, api_key = get_or_create_project(conn)

        # Create session
        session_id, init_timestamp = create_session(conn, project_id)

        # Run queries
        for i, query in enumerate(test_queries, 1):
            print(f"\n📝 Query {i}: {query}")
            print("-" * 60)

            try:
                # Call the LLM and measure duration
                start_time = datetime.now()
                response = llm.invoke(query)
                end_time = datetime.now()
                response_text = response.content

                print(f"✅ Response: {response_text}")

                # Record event in database
                record_llm_event(conn, session_id, query, response_text, start_time, end_time)

            except Exception as e:
                print(f"❌ Error: {str(e)}")
                # Update error count
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE stats SET errors = errors + 1 WHERE session_id = %s",
                        (session_id,)
                    )
                    conn.commit()

            print("-" * 60)

        # End session
        end_session(conn, session_id, init_timestamp)

        print("\n" + "="*60)
        print("✅ All test queries completed!")
        print("="*60)
        print(f"\n📊 Session ID: {session_id}")
        print(f"📊 Project ID: {project_id}")
        print("\n📊 Check your DevOps Copilot UI to see the traces:")
        print("   http://localhost:3000/dashboard/ai-workloads/traces")
        print("\n")

    except Exception as e:
        print(f"\n❌ Fatal error: {str(e)}")
        if 'session_id' in locals():
            end_session(conn, session_id, init_timestamp, 'Fail', str(e))
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    try:
        run_test()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Fatal error: {str(e)}")
        raise
