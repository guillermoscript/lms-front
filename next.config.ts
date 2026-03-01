import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return {
      beforeFiles: [
        // RFC 9728: /.well-known/oauth-protected-resource/* → API route
        {
          source: '/.well-known/oauth-protected-resource/:path*',
          destination: '/api/well-known/oauth-protected-resource',
        },
        {
          source: '/.well-known/oauth-protected-resource',
          destination: '/api/well-known/oauth-protected-resource',
        },
        // RFC 8414: /.well-known/oauth-authorization-server/* → API route
        {
          source: '/.well-known/oauth-authorization-server/:path*',
          destination: '/api/well-known/oauth-authorization-server',
        },
        {
          source: '/.well-known/oauth-authorization-server',
          destination: '/api/well-known/oauth-authorization-server',
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
};

export default withNextIntl(nextConfig);
