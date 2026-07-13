# Frontend

React 19 + TypeScript + Vite single-page application, managed with **bun**.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [bun](https://bun.sh/) | 1.1 |

---

## Install dependencies

```bash
make install-frontend   # from repo root; runs: cd frontend && bun install
```

---

## Development server

```bash
make run-frontend       # from repo root; runs: cd frontend && bun run dev
```

Opens at <http://localhost:3000> with HMR. The dev server proxies `/api` to the backend — make sure the backend is running too (see [backend/README.md](../backend/README.md)).

---

## Available scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server with HMR |
| `bun run build` | Type-check + build for production (output in `dist/`) |
| `bun run preview` | Serve the production build locally |
| `bun run lint` | Run ESLint over `src/` |
| `bun run test:e2e` | Run the Playwright end-to-end suite (see below) |

---

## End-to-end tests

[Playwright](https://playwright.dev/) drives the real app through a handful of core user flows: creating a person, creating a project, running an optimization, and viewing the availability calendar. Specs live in `e2e/`.

One-time setup:

```bash
cd frontend && bunx playwright install chromium
```

Run the whole suite, including an isolated backend so tests never touch `backend/data/*.json`:

```bash
make test-e2e            # from repo root; runs scripts/test-e2e.sh
```

Alternatively, run `bun run test:e2e` directly from `frontend/` against a backend you're already running (e.g. via `make run-backend`) — Playwright starts the frontend dev server itself.

---

## Environment variables

Create a `.env` file at the repo root (or `frontend/.env.local`) and set:

```dotenv
VITE_API_URL=http://localhost:8000
```

Variables prefixed with `VITE_` are inlined into the browser bundle at build time.

---

## Project structure

```
frontend/
├── src/
│   ├── main.tsx            Entry point
│   ├── App.tsx             Router + layout shell
│   ├── components/
│   │   └── common/
│   │       └── Layout.tsx  Sidebar + nav wrapper
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── PeoplePage.tsx
│   │   ├── ProjectsPage.tsx
│   │   ├── TeamsPage.tsx
│   │   └── OptimizationPage.tsx
│   ├── services/
│   │   └── api.ts          Axios client pointed at VITE_API_URL
│   ├── store/
│   │   └── index.ts        Zustand global store
│   └── types/
│       └── index.ts        Shared TypeScript types
├── index.html
├── vite.config.ts
└── tsconfig.json
```

---

## Key dependencies

| Package | Role |
|---------|------|
| React 19 | UI framework |
| React Router 7 | Client-side routing |
| Zustand 5 | Lightweight state management |
| Axios | HTTP client |
| Vite 6 | Build tool + dev server |
| TypeScript 5.6 | Type safety |

---

## Production build (Docker)

The production Dockerfile builds a static bundle and serves it with nginx. See [infra/README.md](../infra/README.md).
