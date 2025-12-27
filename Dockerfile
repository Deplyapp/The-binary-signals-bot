# Telegram Trading Signal Bot Dockerfile
# Multi-stage build for optimized production image

# ============================================
# Stage 1: Build stage
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ============================================
# Stage 2: Production stage
# ============================================
FROM node:20-slim AS production

# Install system dependencies for Puppeteer, Canvas, and PostgreSQL
RUN apt-get update && apt-get install -y \
    # PostgreSQL dependencies
    libpq5 \
    # Chromium dependencies
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
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    # Canvas dependencies
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    uuid-runtime \
    libuuid1 \
    # Build dependencies for canvas (if rebuild needed)
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chromium (we use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy other necessary files
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle.config.ts ./

# Create a non-root user for security
RUN groupadd -r botuser && useradd -r -g botuser botuser
RUN chown -R botuser:botuser /app

# Switch to non-root user
USER botuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))" || exit 1

# Start the application
CMD ["node", "dist/index.cjs"]
