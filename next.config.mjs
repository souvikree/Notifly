/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIXED: Was ignoreBuildErrors: true — type errors were silently deployed.
  // This is a major security and reliability risk. TypeScript errors must fail the build.
  typescript: {
    ignoreBuildErrors: false,
  },

  // Keep image optimization disabled (unoptimized: true) for simplicity.
  // Remove this when you add a proper image CDN (Cloudinary, Imgix, etc.)
  images: {
    unoptimized: true,
  },

  // Required for Docker standalone output (used in Dockerfile.frontend)
  output: 'standalone',

  /**
   * API proxy rewrites.
   *
   * FIXED: Frontend had no proxy config, requiring NEXT_PUBLIC_API_URL to be
   * set correctly in every environment. This was causing browser CORS issues
   * when the frontend container needed to talk to the API container.
   *
   * With this proxy:
   *  - Browser calls /api/backend/... (same origin — no CORS)
   *  - Next.js server forwards to BACKEND_URL/api/...
   *  - Credentials stay server-side
   *
   * For direct API access (using NEXT_PUBLIC_API_URL), keep the existing
   * api-client.ts behavior — both approaches coexist.
   */
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },

  /**
   * Security headers applied to all responses.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection',          value: '1; mode=block' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
