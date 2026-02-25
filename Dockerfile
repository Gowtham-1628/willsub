# ============================================
# Stage 1: Build TypeScript
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDependencies for build)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ============================================
# Stage 2: Production image with Chromium
# ============================================
FROM node:20-slim

# Install Chromium dependencies for Puppeteer + timezone data
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    tzdata \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set default timezone to CST
ENV TZ=America/Chicago

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy environment-specific config files (credentials come from env vars)
COPY config/ ./config/

# Set default environment
ARG NODE_ENV=prod
ENV NODE_ENV=${NODE_ENV}

# Run as non-root user for security (UID 1000 matches host 'ubuntu' user for bind mounts)
RUN groupadd -r appuser -g 1000 && useradd -r -g appuser -u 1000 -d /app appuser \
    && mkdir -p logs \
    && chown -R appuser:appuser /app
USER appuser

# # Run as non-root user for security (node user is UID 1000, matches host 'ubuntu' user for bind mounts)
# RUN mkdir -p logs \
#     && chown -R node:node /app
# USER node

# Health check - verify the node process is running
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

CMD ["node", "dist/index.js"]
