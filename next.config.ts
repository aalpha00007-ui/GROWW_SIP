import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The pipeline reads data/ and src/db/schema.sql at run time, from the project folder.
  outputFileTracingIncludes: { '/**': ['./data/**/*', './src/db/schema.sql'] },
  poweredByHeader: false,
};

export default nextConfig;
