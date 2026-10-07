FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 correlation && \
    chown -R correlation:correlation /app

USER correlation

# Expose API port
EXPOSE 9000

# Set Python path
ENV PYTHONPATH=/app

# Run the correlation engine
CMD ["python", "engine.py"]
