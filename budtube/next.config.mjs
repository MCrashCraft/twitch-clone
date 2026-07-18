/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for the Docker image; regular output for `next start`.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
