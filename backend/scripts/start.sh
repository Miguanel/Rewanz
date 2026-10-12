#!/usr/bin/env bash
# Start na Render (darmowy plan nie ma preDeployCommand, więc migracje idą tutaj).
# Na planie płatnym przenieś "alembic upgrade head" do preDeployCommand w render.yaml.
set -euo pipefail

alembic upgrade head

if [ "${SEED_DEMO:-false}" = "true" ]; then
  python -m scripts.seed
fi

# --proxy-headers: poprawny schemat/IP klienta za proxy Render
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips="*" --timeout-keep-alive 30
