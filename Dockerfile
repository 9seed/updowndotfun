# Stage 1: Build React frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY server.js ./
COPY lib/ ./lib/
EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001
CMD ["node", "server.js"]
