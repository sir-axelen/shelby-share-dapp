/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Common Node.js modules
        fs: false,
        os: false,
        path: false,
        readline: false,
        child_process: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        zlib: false,
        url: false,
        buffer: false,
        vm: false,
        constants: false,
        assert: false,
        dns: false,
        timers: false,
        got: false,
        // Specific sub-modules
        "stream/promises": false,
        "fs/promises": false,
        "util/types": false,
      };

      config.resolve.alias = {
        ...config.resolve.alias,
        "stream/promises": false,
        "fs/promises": false,
        "util/types": false,
        got: false,
      };

      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
    }
    return config;
  },
};

export default nextConfig;
