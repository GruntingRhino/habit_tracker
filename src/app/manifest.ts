import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GoodHabits",
    short_name: "GoodHabits",
    description: "Track, analyze, and improve your daily habits",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060d1c",
    theme_color: "#060d1c",
    icons: [
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
