/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove static export — API routes and the /app route handler need server runtime
  images: { unoptimized: true },
};

module.exports = nextConfig;
