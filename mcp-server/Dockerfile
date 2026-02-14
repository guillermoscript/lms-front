FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production --ignore-scripts

# Copy built files
COPY build ./build

# Expose MCP server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001', (res) => process.exit(res.statusCode === 404 ? 0 : 1))"

# Run HTTP server
CMD ["node", "build/http-server.js"]
