import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from "@sentry/nextjs";

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

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "guillermoscript",

  project: "lms-front",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
