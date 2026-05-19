ARG REGISTRY=ghcr.io/YOUR_GITHUB_USERNAME
FROM ${REGISTRY}/newspulse-ml-base:latest

# Bake dhruvpal/fake-news-bert
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('dhruvpal/fake-news-bert', local_dir='/models/fake_news_models', ignore_patterns=['*.msgpack', '*.ot', 'flax_model*', 'tf_model*'])"

ENV HF_LOCAL_DIR=/models/fake_news_models \
    FAKE_MODEL=dhruvpal/fake-news-bert \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_OFFLINE=1 \
    PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus_multiproc

WORKDIR /app
COPY --chown=appuser:appuser . /app

RUN mkdir -p /tmp/prometheus_multiproc && \
    chown -R appuser:appuser /app /tmp/prometheus_multiproc

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]