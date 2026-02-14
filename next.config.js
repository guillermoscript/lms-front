const withMDX = require('@next/mdx')({ extension: /\.(md|mdx)$/ });

/** @type {import('next').NextConfig} */
module.exports = withMDX({
  experimental: {
    appDir: true,
  },
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
});
