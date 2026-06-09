const nextConfig = {
  reactStrictMode: true,
  // Retirer output: 'export' pour permettre les routes API (serveur Node.js requis)
  // L'application fonctionne avec "npm run dev" qui lance un serveur
  images: {
    unoptimized: true,
  },
};

export default nextConfig;