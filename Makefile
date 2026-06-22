.PHONY: dev prod down down-prod logs build \
        sync install-backend install-frontend \
        run-backend run-frontend \
        test test-optimizer test-api \
        lint-backend lint-frontend \
        clean

COMPOSE     = docker compose
DEV_FILE    = -f infra/docker-compose.dev.yml
PROD_FILE   = -f infra/docker-compose.yml

# ── Docker ────────────────────────────────────────────────────────────────────

dev:              ## Start the full stack in development mode (hot-reload)
	$(COMPOSE) $(DEV_FILE) up

build:            ## Build production images without starting
	$(COMPOSE) $(PROD_FILE) build

prod:             ## Build and start the full stack in production mode
	$(COMPOSE) $(PROD_FILE) up --build

down:             ## Stop and remove dev containers
	$(COMPOSE) $(DEV_FILE) down

down-prod:        ## Stop and remove production containers
	$(COMPOSE) $(PROD_FILE) down

logs:             ## Tail logs from all dev containers
	$(COMPOSE) $(DEV_FILE) logs -f

# ── Local development (without Docker) ───────────────────────────────────────

sync:             ## Sync Python workspace dependencies from lockfile (incl. dev)
	uv sync --all-groups

install-frontend: ## Install frontend dependencies
	cd frontend && bun install

run-backend:      ## Run the API server locally with hot-reload
	cd backend && uv run uvicorn api.main:app --reload --port 8000

run-frontend:     ## Run the frontend dev server locally
	cd frontend && bun run dev

# ── Tests ─────────────────────────────────────────────────────────────────────

test:             ## Run all tests
	$(MAKE) test-optimizer test-api

test-optimizer:   ## Run optimizer unit tests
	cd optimizer && uv run pytest tests/ -v

test-api:         ## Run backend API tests
	cd backend && uv run pytest tests/ -v

# ── Linting ───────────────────────────────────────────────────────────────────

lint-backend:     ## Lint optimizer + backend with ruff
	uv run ruff check optimizer/src backend/src

lint-frontend:    ## Lint frontend with eslint
	cd frontend && bun run lint

# ── Help ──────────────────────────────────────────────────────────────────────

help:             ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

clean:            ## Remove cache, build artifacts, and venv
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
