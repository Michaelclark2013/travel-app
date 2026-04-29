// Track F (SEO): server-rendered shell that adds metadata + a CollectionPage
// JSON-LD blob to the (client-only) tag page at /tag/[name].

import type { Metadata } from "next";
import { abs, jsonLd, SITE_URL } from "@/lib/seo";

type Props = { params: Promise<{ name: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const tag = name.toLowerCase();
  const title = `#${tag}`;
  const description = `Travel moments tagged #${tag} on Voyage. Plan a trip from anything you save.`;
  const url = abs(`/tag/${tag}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "Voyage",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: "@voyageapp",
    },
  };
}

export default async function TagLayout({ params, children }: Props) {
  const { name } = await params;
  const tag = name.toLowerCase();
  const ld = jsonLd({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `#${tag} on Voyage`,
    url: abs(`/tag/${tag}`),
    keywords: tag,
    isPartOf: { "@type": "WebSite", name: "Voyage", url: SITE_URL },
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ld }}
      />
      <link rel="canonical" href={`${SITE_URL}/tag/${tag}`} />
      {children}
    </>
  );
}
