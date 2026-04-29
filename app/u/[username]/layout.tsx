// Track F (SEO): server-rendered shell that adds metadata + Person JSON-LD to
// the (client-only) public profile page at /u/[username]. The page itself
// continues to render in the browser — this layout only injects <head>
// content and the structured data <script>.

import type { Metadata } from "next";
import { userByUsername } from "@/lib/social";
import { abs, personLd, SITE_URL } from "@/lib/seo";

type Props = {
  params: Promise<{ username: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = userByUsername(username);
  const url = abs(`/u/${username}`);

  const title = user ? `${user.displayName} (@${user.username})` : `@${username}`;
  const description = user
    ? `${user.bio} · ${user.followers.toLocaleString()} followers on Voyage.`
    : "A traveler on Voyage. See their moments and trip inspiration.";

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      url,
      title,
      description,
      siteName: "Voyage",
      ...(user
        ? {
            // Open Graph profile object — most readers ignore but Facebook
            // surfaces username when present.
            username: user.username,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: "@voyageapp",
    },
  };
}

export default async function ProfileLayout({ params, children }: Props) {
  const { username } = await params;
  const user = userByUsername(username);
  const ld = user
    ? personLd({
        name: user.displayName,
        username: user.username,
        bio: user.bio,
        followers: user.followers,
        travelStyles: user.travelStyles,
      })
    : null;

  return (
    <>
      {ld ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ld }}
        />
      ) : null}
      <link rel="canonical" href={`${SITE_URL}/u/${username}`} />
      {children}
    </>
  );
}
