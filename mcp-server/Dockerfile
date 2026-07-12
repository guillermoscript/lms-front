# Node >=22 required: supabase-js Realtime needs native WebSocket at runtime
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json index.ts ./
COPY src ./src
COPY resources ./resources
COPY public ./public
# A Supabase URL must be importable at build time (the server module is loaded
# during widget/type-registry generation). A dummy value is fine for the build.
RUN SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=build npm run build

FROM node:22-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
# mcp-use binds "localhost" by default — unreachable from outside the
# container. HOST is read by MCPServer.listen().
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/.well-known/oauth-protected-resource', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "start"]
