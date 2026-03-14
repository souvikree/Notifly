/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIXED: Was ignoreBuildErrors: true — type errors were silently deployed.
  typescript: {
    ignoreBuildErrors: false,
  },

  /**
   * Disable React StrictMode.
   *
   * StrictMode double-invokes effects in development. @react-oauth/google calls
   * google.accounts.id.initialize() in a useEffect — when invoked twice, the
   * second call corrupts GSI state and Google rejects the origin with 403.
   * Known incompatibility: https://github.com/MomenSherif/react-oauth/issues/12
   */
  reactStrictMode: false,

  images: {
    unoptimized: true,
  },

  // Required for Docker standalone output
  output: 'standalone',

  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection',       value: '1; mode=block' },
          {
            key:   'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          /**
           * FIXED: Cross-Origin-Opener-Policy was missing.
           *
           * The default browser COOP is "unsafe-none", but some environments
           * (Vercel, certain proxies) inject "same-origin" which completely
           * breaks Google's sign-in popup. The popup communicates the credential
           * back to your page via window.postMessage — if COOP is "same-origin",
           * the browser tears down the opener reference and the message is lost,
           * causing the silent 403 / "origin not allowed" errors.
           *
           * "same-origin-allow-popups" is the correct value:
           *   - Keeps cross-origin windows from accessing your page (safe)
           *   - Allows popups YOU opened (Google sign-in) to postMessage back (required)
           */
          {
            key:   'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
