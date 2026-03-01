import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return {
      // beforeFiles rewrites run before filesystem routes AND middleware
      beforeFiles: [
        // RFC 9728: OAuth metadata at well-known paths for MCP
        // Claude Desktop fetches /.well-known/oauth-protected-resource/api/mcp
        // Rewrite to API route that serves tenant-aware metadata
        {
          source: '/.well-known/oauth-protected-resource/:path*',
          destination: '/api/well-known/oauth-protected-resource',
        },
        {
          source: '/.well-known/oauth-authorization-server/:path*',
          destination: '/api/well-known/oauth-authorization-server',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default withNextIntl(nextConfig);
