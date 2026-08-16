import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NIGHTSHIFT — Run After Dark",
  description:
    "Technical footwear and off-hours uniforms engineered for movement.",
  metadataBase: new URL("https://nightshift-dark-shop.ivv2.chatgpt.site"),
  openGraph: {
    title: "NIGHTSHIFT — Run After Dark",
    description:
      "Technical footwear and off-hours uniforms engineered for movement.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1672,
        height: 939,
        alt: "NIGHTSHIFT — Run After Dark",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NIGHTSHIFT — Run After Dark",
    description:
      "Technical footwear and off-hours uniforms engineered for movement.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
