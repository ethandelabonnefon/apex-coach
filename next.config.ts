import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  /**
   * Anciennes adresses des modules retirés en nov. 2026 (sport, nutrition,
   * profil). Une notification ancienne, un favori ou un raccourci d'écran
   * d'accueil peuvent encore y pointer : on les ramène vers l'écran qui a
   * repris leur rôle plutôt que d'afficher une page introuvable.
   * Redirections temporaires (307) : rien n'est gravé dans le cache du
   * navigateur si l'un de ces modules revenait un jour.
   */
  async redirects() {
    return [
      { source: "/profil", destination: "/diabete/parametres", permanent: false },
      { source: "/profil/:path*", destination: "/diabete/parametres", permanent: false },
      { source: "/muscu/:path*", destination: "/diabete", permanent: false },
      { source: "/running/:path*", destination: "/diabete", permanent: false },
      { source: "/nutrition", destination: "/diabete", permanent: false },
      { source: "/diagnostic", destination: "/diabete", permanent: false },
      { source: "/diabete/patterns", destination: "/diabete", permanent: false },
    ];
  },
};

export default nextConfig;
