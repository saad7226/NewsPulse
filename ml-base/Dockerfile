# NewsPulse — Shared ML Base Image
# Contains PyTorch CPU, Transformers, and Web Frameworks for classification services

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libssl-dev \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU and Transformers shared dependencies
RUN python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.1.0+cpu \
    torchvision==0.16.0+cpu \
    torchaudio==2.1.0+cpu

# Install Web and ML dependencies (Common across all services)
RUN python -m pip install --no-cache-dir \
    fastapi==0.110.0 \
    uvicorn[standard]==0.27.1 \
    pydantic==2.6.1 \
    pydantic-settings==2.1.0 \
    httpx==0.27.0 \
    transformers>=4.30.0 \
    scipy>=1.10.0 \
    numpy>=1.24.0 \
    huggingface_hub \
    tokenizers>=0.15.0 \
    sentencepiece \
    python-dotenv \
    prometheus_client \
    redis \
    sqlalchemy \
    cachetools \
    newsapi-python

# Create appuser for security
RUN useradd --create-home appuser
WORKDIR /app
RUN chown appuser:appuser /app
