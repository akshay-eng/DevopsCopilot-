import os
import time
import psycopg2
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'bank-db'),
    'port': os.getenv('DB_PORT', '5432'),
    'dbname': os.getenv('DB_NAME', 'bankdb'),
    'user': os.getenv('DB_USER', 'bankuser'),
    'password': os.getenv('DB_PASS', 'bankpass'),
}

def get_db():
    """Get database connection with retry."""
    retries = 3
    for i in range(retries):
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            return conn
        except psycopg2.OperationalError as e:
            if i == retries - 1:
                raise
            time.sleep(1)


@app.route('/health')
def health():
    """Health check - fails when DB is unreachable."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT 1')
        cur.close()
        conn.close()
        return jsonify({'status': 'healthy', 'db': 'connected'}), 200
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'db': 'disconnected', 'error': str(e)}), 503


@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT id, name, balance, created_at FROM accounts ORDER BY id')
        rows = cur.fetchall()
        accounts = [
            {'id': r[0], 'name': r[1], 'balance': float(r[2]), 'created_at': str(r[3])}
            for r in rows
        ]
        cur.close()
        conn.close()
        return jsonify({'accounts': accounts})
    except Exception as e:
        return jsonify({'error': f'Database unavailable: {str(e)}'}), 503


@app.route('/api/accounts/<int:account_id>', methods=['GET'])
def get_account(account_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT id, name, balance, created_at FROM accounts WHERE id = %s', (account_id,))
        r = cur.fetchone()
        if not r:
            return jsonify({'error': 'Account not found'}), 404
        account = {'id': r[0], 'name': r[1], 'balance': float(r[2]), 'created_at': str(r[3])}
        cur.close()
        conn.close()
        return jsonify(account)
    except Exception as e:
        return jsonify({'error': f'Database unavailable: {str(e)}'}), 503


@app.route('/api/transfer', methods=['POST'])
def transfer():
    try:
        data = request.json
        from_id = data['from_account_id']
        to_id = data['to_account_id']
        amount = float(data['amount'])

        if amount <= 0:
            return jsonify({'error': 'Amount must be positive'}), 400

        conn = get_db()
        cur = conn.cursor()

        cur.execute('SELECT balance FROM accounts WHERE id = %s FOR UPDATE', (from_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'error': 'Source account not found'}), 404
        if float(row[0]) < amount:
            return jsonify({'error': 'Insufficient funds'}), 400

        cur.execute('UPDATE accounts SET balance = balance - %s WHERE id = %s', (amount, from_id))
        cur.execute('UPDATE accounts SET balance = balance + %s WHERE id = %s', (amount, to_id))
        cur.execute(
            'INSERT INTO transactions (from_account_id, to_account_id, amount, type) VALUES (%s, %s, %s, %s)',
            (from_id, to_id, amount, 'transfer')
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'status': 'success', 'message': f'Transferred ${amount:.2f}'})
    except Exception as e:
        return jsonify({'error': f'Database unavailable: {str(e)}'}), 503


@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('''
            SELECT t.id, t.from_account_id, t.to_account_id, t.amount, t.type, t.created_at,
                   a1.name as from_name, a2.name as to_name
            FROM transactions t
            LEFT JOIN accounts a1 ON t.from_account_id = a1.id
            LEFT JOIN accounts a2 ON t.to_account_id = a2.id
            ORDER BY t.created_at DESC
            LIMIT 50
        ''')
        rows = cur.fetchall()
        txns = [
            {
                'id': r[0], 'from_account_id': r[1], 'to_account_id': r[2],
                'amount': float(r[3]), 'type': r[4], 'created_at': str(r[5]),
                'from_name': r[6] or '-', 'to_name': r[7] or '-'
            }
            for r in rows
        ]
        cur.close()
        conn.close()
        return jsonify({'transactions': txns})
    except Exception as e:
        return jsonify({'error': f'Database unavailable: {str(e)}'}), 503


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
