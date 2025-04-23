###
# Multi-stage Dockerfile for production build
###
# Stage 1: build server and client assets
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY . .

# Build server (TypeScript) and client (Vite)
RUN npm run build:server \
    && npm run build

# Stage 2: create production image
FROM node:20-alpine AS runner

# Working directory for running the app
WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built application code and assets
COPY --from=builder /app/dist ./dist

# Expose application port
EXPOSE 3000

# Use non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Set production environment
ENV NODE_ENV=production

# Default command to run the server
CMD ["node", "dist/server.js"]