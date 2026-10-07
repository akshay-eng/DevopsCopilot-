CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    from_account_id INT REFERENCES accounts(id),
    to_account_id INT REFERENCES accounts(id),
    amount DECIMAL(12,2) NOT NULL,
    type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed data
INSERT INTO accounts (name, balance) VALUES
    ('Alice Johnson', 5000.00),
    ('Bob Smith', 3200.00),
    ('Charlie Brown', 1500.00),
    ('Diana Prince', 8700.00),
    ('Eve Wilson', 4100.00);

INSERT INTO transactions (from_account_id, to_account_id, amount, type) VALUES
    (1, 2, 500.00, 'transfer'),
    (3, 1, 200.00, 'transfer'),
    (NULL, 4, 1000.00, 'deposit'),
    (2, NULL, 150.00, 'withdrawal');
