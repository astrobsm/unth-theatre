/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  // Power on SWC minification
  swcMinify: true,
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
  },
  // SWC compiler optimisations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    // Tree-shake barrel exports for heavy packages
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'react-chartjs-2',
      'chart.js',
      '@hookform/resolvers',
      'react-hook-form',
      'zod',
      'react-hot-toast',
      'jspdf',
      'jspdf-autotable',
    ],
  },
  // Exclude massive optional packages from server bundle
  webpack: (config, { isServer }) => {
    // Split large vendor chunks so the browser can cache them independently
    if (!isServer) {
      // Split large vendor chunks so the browser can cache them independently
      if (config.optimization && config.optimization.splitChunks) {
        config.optimization.splitChunks.cacheGroups = {
          ...config.optimization.splitChunks.cacheGroups,
          // Heavy libs get their own chunk (only loaded when actually imported)
          heavyVendors: {
            test: /[\\/]node_modules[\\/](xlsx|jspdf|jspdf-autotable|tesseract\.js|@tensorflow|chart\.js)[\\/]/,
            name: 'heavy-vendors',
            chunks: 'async',   // only for dynamic imports
            priority: 30,
            reuseExistingChunk: true,
          },
          // Common vendor chunk for frequently used small libs
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
            reuseExistingChunk: true,
          },
        };
      }
    }
    return config;
  },
  async rewrites() {
    return [
      // Short alias for the public patient feedback form so the link we share
      // with patients stays very short (e.g. https://host/f).
      { source: '/f', destination: '/feedback' },
    ];
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
          // SECURITY: API responses are session/role specific. Mark them `private`
          // so they are NEVER cached on shared CDN/proxy infrastructure (which could
          // otherwise serve one user's data to another). Per-device offline speed is
          // provided by the service worker + IndexedDB cache, not the CDN, so this
          // does not slow page loads. `no-store` keeps authenticated data out of the
          // browser's shared HTTP cache while the SW still caches for offline use.
          { key: 'Cache-Control', value: 'private, no-store, must-revalidate' },
          { key: 'Vary', value: 'Cookie, Authorization' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Cache fonts aggressively
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
