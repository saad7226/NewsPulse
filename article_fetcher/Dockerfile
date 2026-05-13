FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    DEBIAN_FRONTEND=noninteractive \
    PATH=/usr/local/bin:$PATH

RUN apt-get update -o Acquire::Retries=10 -o Acquire::http::Timeout=20 \
    && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    zlib1g-dev \
    libssl-dev \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./

RUN python -m pip install --upgrade pip setuptools wheel && \
    set -e; \
    for i in 1 2 3; do \
    echo "pip install attempt $i"; \
    if python -m pip install --disable-pip-version-check --no-cache-dir -r requirements.txt --timeout 120; then \
    break; \
    fi; \
    if [ "$i" -lt 3 ]; then echo "pip failed, retrying in 5s..."; sleep 5; fi; \
    done

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/usr/local/bin:$PATH \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update -o Acquire::Retries=10 -o Acquire::http::Timeout=20 \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /usr/local /usr/local

COPY requirements.txt ./

RUN python -m pip install --disable-pip-version-check --no-cache-dir -r requirements.txt

RUN useradd --create-home --shell /bin/bash appuser
COPY --chown=appuser:appuser . /app

RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "asyncio", "--timeout-keep-alive", "120"]