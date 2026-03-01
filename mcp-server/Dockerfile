FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --production --ignore-scripts

COPY --from=builder /app/build ./build

EXPOSE 3001

ENV MCP_HTTP_HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001', (res) => process.exit(res.statusCode === 404 ? 0 : 1))"

CMD ["node", "build/http-server.js"]
