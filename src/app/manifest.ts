import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LiveImproved",
    short_name: "Live",
    description: "Private life tracker",
    start_url: "/chat",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0e1a",
    theme_color: "#0a0e1a",
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
