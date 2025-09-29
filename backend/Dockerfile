# backend/Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

# Put everything under /app/backend so the package name is "backend"
WORKDIR /app

# Install deps
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend code into /app/backend
COPY backend/ /app/backend/

# Optional: if you need the setup data at runtime, copy it here too
# COPY backend/setup/ /app/backend/setup/

WORKDIR /app/backend
EXPOSE 8000

# Run via package path
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
