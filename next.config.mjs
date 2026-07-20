/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // These pull in optional/native deps that should not be bundled by webpack.
  serverExternalPackages: ["@googleapis/gmail", "google-auth-library"],
};

export default nextConfig;
