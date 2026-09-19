# Academy Guinéenne — Backend Production Dockerfile
# Multi-stage build: deps → runtime (slim image, non-root)
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# --- Runtime stage ---
FROM python:3.11-slim

WORKDIR /app

# libmagic1: runtime shared lib for python-magic (upload MIME/magic-byte
# validation in storage.py). Without it, python-magic's import fails and
# that check silently degrades to trusting the client Content-Type header —
# see requirements.txt for the matching python-magic dependency.
#
# libpango-1.0-0/libpangocairo-1.0-0/libcairo2/libgdk-pixbuf-2.0-0/
# libffi8/shared-mime-info/fonts-liberation: WeasyPrint's runtime rendering
# stack (national-readiness audit, 2026-09, P1-1 — server-side bulletin
# PDFs, see requirements.txt). Without these, WeasyPrint's import fails at
# request time (only exercised the first time a PDF is generated), not at
# container startup — same silent-until-used-at-runtime risk the libmagic1
# comment above already warns about.
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client curl libmagic1 \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi8 shared-mime-info fonts-liberation && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

COPY . .

RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/uploads && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; r=urllib.request.urlopen('http://localhost:8000/health/ready'); sys.exit(0 if r.status==200 else 1)" 2>/dev/null || exit 1

CMD ["bash", "start.sh"]
