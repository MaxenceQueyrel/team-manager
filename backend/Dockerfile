FROM python:3.12-slim AS base
WORKDIR /app
RUN pip install uv

# ── Development ───────────────────────────────────────────────────────────────
FROM base AS dev
COPY pyproject.toml ./
COPY optimizer/ ./optimizer/
COPY backend/ ./backend/
WORKDIR /app/backend
RUN uv sync --group dev
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "api.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]

# ── Production ────────────────────────────────────────────────────────────────
FROM base AS production
COPY pyproject.toml ./
COPY optimizer/ ./optimizer/
COPY backend/ ./backend/
WORKDIR /app/backend
RUN uv sync --no-dev
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
