# syntax=docker/dockerfile:1.4
# SENTINEX-CAT — Vite dashboard (build) + nginx (serve + API proxy)
# Build context: dashboard/ (see scripts/ecr-build-push.*)
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

COPY . ./

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" \
    || (echo "ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time (from root .env)" && exit 1)

RUN npm run build

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache wget

COPY --from=nginxconf nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
