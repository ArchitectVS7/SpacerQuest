FROM node:20-alpine AS builder

# Prisma needs OpenSSL to detect the correct binary variant at generate time
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files (paths relative to repo root — Railway build context)
COPY spacerquest-web/package.json spacerquest-web/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY spacerquest-web/ .

# Generate Prisma client
RUN npm run db:generate

# Build application (backend + frontend)
RUN npm run build

# Production image
FROM node:20-alpine

# Prisma requires OpenSSL at runtime
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files and install production deps only
COPY spacerquest-web/package.json spacerquest-web/package-lock.json ./
RUN npm ci --omit=dev

# Copy built application, Prisma artifacts, schema, and startup script
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY spacerquest-web/scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node dist/app/healthcheck.js

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "./scripts/start.sh"]
