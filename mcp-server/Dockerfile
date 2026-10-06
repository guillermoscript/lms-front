# Node >=22 required: supabase-js Realtime needs native WebSocket at runtime
FROM node:22-alpine AS builder

WORKDIR /app

# @lms/core (#849) is a `file:../packages/core` devDependency: `mcp-use build`
# inlines its source into .mcp-use/build, so only the builder needs it, at the
# path the lockfile names. It arrives as the `core` named build context
# (`--build-context core=packages/core`) so this image's context stays
# mcp-server/ — the root .dockerignore excludes mcp-server for the web image.
COPY --from=core . /packages/core

COPY package*.json ./
# npm links @lms/core to /packages/core. Imports from that real path must
# resolve against the same locked dependencies installed for the MCP server.
RUN npm ci && ln -s /app/node_modules /packages/node_modules

COPY tsconfig.json index.ts ./
COPY src ./src
COPY views ./views
COPY skills ./skills
COPY public ./public
# A Supabase URL must be importable at build time (the server module is loaded
# during view/skill snapshot generation). A dummy value is fine for the build.
RUN SUPABASE_URL=http://localhost:54321 SUPABASE_PUBLISHABLE_KEY=sb_publishable_build_only npm run build

FROM node:22-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# `mcp-use start` serves the production build from .mcp-use/build.
COPY --from=builder /app/.mcp-use ./.mcp-use
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
# mcp-use binds "localhost" by default — unreachable from outside the
# container. HOST is read by MCPServer.listen().
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/.well-known/oauth-protected-resource/mcp', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "start"]
