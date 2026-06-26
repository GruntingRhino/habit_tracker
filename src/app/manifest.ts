import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LiveImproved",
    short_name: "LiveImproved",
    description: "Track, analyze, and improve your daily habits",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060d1c",
    theme_color: "#060d1c",
    icons: [
      {
        src: "/brand/liveimproved-apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/brand/liveimproved-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/liveimproved-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
