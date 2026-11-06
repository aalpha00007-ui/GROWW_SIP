import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The pipeline reads data/ and src/db/schema.sql at run time, from the project folder.
  outputFileTracingIncludes: { '/**': ['./data/**/*', './src/db/schema.sql'] },
  poweredByHeader: false,
  // The regression suite's in-memory database: loaded at run time from node_modules, and only when E2E_PGLITE=1.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Pages that no longer exist: an old link lands on Explore, not on an error.
  async redirects() {
    return ['/soon/:path*', '/reports'].map((source) => ({ source, destination: '/explore', permanent: false }));
  },
  // The prototype looks like a real app, so: no search engine listing, and no other site may show it in a frame.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
