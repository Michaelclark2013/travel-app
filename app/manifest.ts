import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Voyage — Plan trips with AI",
    short_name: "Voyage",
    description:
      "Plan your whole trip in one place — flights, hotels, day-by-day schedule, and on-the-go nearby food & coffee.",
    start_url: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#050507",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
