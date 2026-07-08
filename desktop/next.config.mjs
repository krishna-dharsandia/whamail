const isElectron = process.env.ELECTRON_BUILD === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isElectron && {
    output: "export",
    trailingSlash: true,
    assetPrefix: "./",
    images: { unoptimized: true },
    skipMiddlewareUrlNormalize: true,
  }),
};

export default nextConfig
