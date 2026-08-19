/**
 * Baseline security headers, applied to every response.
 *
 * Deliberately NOT included: Content-Security-Policy. This app has no
 * dangerouslySetInnerHTML, no inline <script> tags, and no third-party
 * embeds/trackers in its own code (verified) — but Next.js's own hydration
 * script and its RSC payload delivery rely on inline script content, so a
 * strict `script-src` (no 'unsafe-inline', no nonce) risks breaking page
 * hydration across the app, and that can only be confirmed safe by
 * exercising every page in a real browser. Next.js's own supported path for
 * a strict CSP is a per-request nonce generated in middleware
 * (https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
 * — a real architectural addition (new middleware.ts, nonce threaded through
 * every render), not a one-line config change, so it's intentionally left
 * for a follow-up pass with full page-by-page verification rather than
 * shipped half-tested here.
 */
async function headers() {
  return [
    {
      source: '/:path*',
      headers: [
        // Stops the browser from guessing a response's MIME type.
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Nothing in this app frames itself — deny all framing (clickjacking protection).
        { key: 'X-Frame-Options', value: 'DENY' },
        // Send the full referrer only to same-origin requests; a trimmed, origin-only referrer cross-origin.
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // This app never uses camera/mic/geolocation/payment APIs — lock them off explicitly.
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        // Only meaningful to browsers over an actual HTTPS connection (e.g. Vercel) — inert over local HTTP dev.
        // `preload` intentionally omitted: submitting to the browser preload list is a separate, hard-to-reverse
        // decision that shouldn't be made silently on the app's behalf.
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@erp/types'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.financialmodelingprep.com',
      },
    ],
  },
  headers,
};

export default nextConfig;
