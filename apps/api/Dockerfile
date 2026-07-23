# Build from the MONOREPO ROOT:
#   docker build -f apps/api/Dockerfile -t junaidi-api .
#
# We deliberately do NOT use Next's "standalone" output here. Standalone relies
# on file-tracing to copy runtime dependencies, and it does not pick up
# Puppeteer (it is marked external) - so the traced image launches fine and
# then dies the first time it tries to print. Shipping the full node_modules
# and running `next start` is heavier but cannot miss Chromium.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# --- install + build -------------------------------------------------------
FROM base AS build
WORKDIR /app

# Puppeteer downloads Chromium as a zip and needs an extractor; the slim image
# ships neither unzip nor tar-with-zip support, so its postinstall fails without this.
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/pdf/package.json ./packages/pdf/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
# Chromium is downloaded here by Puppeteer's postinstall, into ~/.cache/puppeteer.
RUN pnpm install --frozen-lockfile

COPY . .
# A placeholder secret just so build-time module imports that read it succeed;
# the real one is injected at runtime.
ENV JWT_SECRET=build-time-placeholder-secret-key-32chars
RUN pnpm --filter @junaidi/api build

# --- runtime ---------------------------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Chromium's shared libraries. Missing these is the classic "works locally,
# exits silently in the container" failure, so they are not optional.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 libx11-6 \
      libxcb1 libxext6 libxi6 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Everything: source, node_modules (incl. Puppeteer) and the .next build.
COPY --from=build /app /app
# The downloaded Chromium binary.
COPY --from=build /root/.cache/puppeteer /root/.cache/puppeteer

ENV PORT=10000
EXPOSE 10000

# Prove Mongo is reachable AND Chromium can print before taking traffic.
HEALTHCHECK --interval=30s --timeout=70s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@junaidi/api", "start"]
