# Infra

Docker Compose configurations for local development and production deployment.

---

## Directory layout

```
infra/
├── docker-compose.dev.yml   Hot-reload development stack
├── docker-compose.yml       Production stack
├── docker/nginx/
│   └── nginx.conf           Reverse-proxy config (production)
├── k8s/                     Kubernetes manifests (future)
└── terraform/               IaC modules & environments (future)
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [Docker](https://docs.docker.com/get-docker/) | 24 |
| [Docker Compose](https://docs.docker.com/compose/) | 2.20 (bundled with Docker Desktop) |

---

## Development stack

Mounts source directories as volumes so that code changes reload without rebuilding images.

```bash
# Start (from repo root)
make dev
# equivalent to: docker compose -f infra/docker-compose.dev.yml up

# Stop
make down
# equivalent to: docker compose -f infra/docker-compose.dev.yml down

# Tail logs
make logs
```

| Service | URL |
|---------|-----|
| Frontend | <http://localhost:3000> |
| Backend | <http://localhost:8000> |
| API docs | <http://localhost:8000/docs> |

### How it works

- **Frontend** container runs `bun run dev --host` and mounts `frontend/` — Vite HMR streams changes to the browser instantly.
- **Backend** container runs uvicorn with `--reload` and mounts both `optimizer/` and `backend/` — Python code changes restart the server automatically.

---

## Production stack

Builds optimised images and serves the frontend through nginx.

```bash
# Build images only
make build
# equivalent to: docker compose -f infra/docker-compose.yml build

# Build and start
make prod
# equivalent to: docker compose -f infra/docker-compose.yml up --build

# Stop
make down-prod
# equivalent to: docker compose -f infra/docker-compose.yml down
```

| Service | URL |
|---------|-----|
| Frontend (served by nginx) | <http://localhost:80> |
| Backend | <http://localhost:8000> |

### Volumes

`backend_data` is a named Docker volume that persists `backend/data/` (the JSON flat-file database) across container restarts.

---

## Environment variables

All variables are read from the `.env` file at the repo root. Copy `.env.example` and adjust before starting:

```bash
cp .env.example .env
```

| Variable | Dev default | Prod default | Description |
|----------|------------|-------------|-------------|
| `DATA_DIR` | `/app/backend/data` | `/app/backend/data` | Data directory inside the container |
| `DEBUG` | `true` | _(unset / false)_ | Enable debug mode |
| `CORS_ORIGINS` | `http://localhost:3000` | `http://localhost` | Allowed CORS origins |
| `VITE_API_URL` | `http://localhost:8000` | _(baked into image at build time)_ | Backend URL used by the browser |

---

## Future

- **k8s/** — Kubernetes manifests and a Helm chart are planned.
- **terraform/** — Cloud provisioning modules are planned.
