# Allowance — self-contained production image (Next.js standalone output).
# Build:  docker build -t allowance .
# Run:    see DEPLOY.md (mount a volume for /app/.data and pass env).

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 ALLOWANCE_DATA_DIR=/app/.data
# Standalone server + static assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Persisted JSON store (mount a named volume here in production)
RUN mkdir -p /app/.data
VOLUME ["/app/.data"]
EXPOSE 3000
CMD ["node", "server.js"]
