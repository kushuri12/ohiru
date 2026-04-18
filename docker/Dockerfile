# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /app

# Copy root configurations
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy all packages
COPY packages ./packages
COPY shared ./shared

# Install dependencies and build
RUN npm install
RUN npm run build --workspaces

# Production Stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy built assets
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/shared ./shared

# Expose Gateway, WebChat, Canvas, Dashboard ports
EXPOSE 18790 3790 3791 3792

# Default command
CMD ["node", "packages/cli/dist/index.js"]
