import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZMM | Zerona March Madness",
  description: "The Zerona family March Madness bracket challenge.",
  icons: { icon: "/zmm-logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
