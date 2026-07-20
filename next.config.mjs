/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright/googleapis pull in optional deps that should not be bundled by webpack.
  serverExternalPackages: ["googleapis"],
};

export default nextConfig;
