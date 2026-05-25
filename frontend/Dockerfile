# ── Stage 1: deps — install node_modules ─────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: dev — vite hot-reload server (used with volume mount) ────────
FROM node:20-slim AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── Stage 3: build — compile TypeScript + bundle ─────────────────────────
FROM deps AS build
COPY . .
RUN npm run build

# ── Stage 4: prod — nginx serving compiled dist/ ─────────────────────────
FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
