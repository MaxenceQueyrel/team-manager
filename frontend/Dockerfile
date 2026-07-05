FROM oven/bun:1 AS base
WORKDIR /app

# ── Development ──────────────────────────────────────────────────────────────
FROM base AS dev
COPY package.json bun.lockb* ./
RUN bun install
COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev", "--host"]

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ── Production (nginx) ────────────────────────────────────────────────────────
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
