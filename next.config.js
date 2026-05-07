/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",          // generates a static `out/` folder
  images: { unoptimized: true },
  trailingSlash: true,       // /about → /about/index.html — cleaner for static hosting
};

module.exports = nextConfig;
