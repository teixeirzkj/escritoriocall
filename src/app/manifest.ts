import type { MetadataRoute } from "next";

/** Permite "Adicionar à tela inicial" no celular: abre em tela cheia, como um app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frédy · escritório virtual",
    short_name: "Frédy",
    description: "Escritório virtual da Frédy: voz, vídeo e salas de reunião.",
    start_url: "/escritorio",
    display: "standalone",
    background_color: "#0e1533",
    theme_color: "#0e1533",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
