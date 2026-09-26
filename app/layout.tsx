import type { Metadata } from "next";
import "./globals.css";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    "https://ivashkov2022-droid.github.io/vazuri-preview-liko-dark-shop-public/",
);
const ogImage = new URL("og.png", siteUrl).href;
const favicon = new URL("favicon.svg", siteUrl).href;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "NIGHTSHIFT — E-commerce Concept Case | VAZURI",
  description:
    "NIGHTSHIFT is a VAZURI concept case for a technical footwear e-commerce site with a bold dark interface and product interactions.",
  keywords: [
    "e-commerce web design",
    "footwear website design",
    "dark interface design",
    "interactive product website",
    "VAZURI case study",
  ],
  alternates: { canonical: siteUrl.href },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    title: "NIGHTSHIFT — E-commerce Concept Case | VAZURI",
    description:
      "A VAZURI concept case for a technical footwear e-commerce site with a bold dark interface.",
    type: "website",
    url: siteUrl.href,
    siteName: "VAZURI",
    images: [
      {
        url: ogImage,
        width: 1672,
        height: 939,
        alt: "NIGHTSHIFT e-commerce concept by VAZURI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NIGHTSHIFT — E-commerce Concept Case | VAZURI",
    description:
      "A VAZURI concept case for a technical footwear e-commerce site with a bold dark interface.",
    images: [ogImage],
  },
  icons: {
    icon: [{ url: favicon, type: "image/svg+xml" }],
    shortcut: favicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: "NIGHTSHIFT — E-commerce Concept Case",
    description:
      "A VAZURI concept case for a technical footwear e-commerce site with a bold dark interface and product interactions.",
    url: siteUrl.href,
    image: ogImage,
    inLanguage: "en",
    creator: { "@type": "Organization", name: "VAZURI", url: "https://vazuri.ru/" },
    isPartOf: { "@type": "WebSite", name: "VAZURI", url: "https://vazuri.ru/" },
    keywords: "e-commerce web design, footwear website design, dark interface, interactive product experience",
  };

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}
