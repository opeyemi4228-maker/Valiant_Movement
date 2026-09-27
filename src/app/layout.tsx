import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Valiant Movement — Join the Movement",
  description:
    "Valiant Movement is a verified community platform for Nigerians. Register with your NIN, connect across states, and move together.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw edge-to-edge so env(safe-area-inset-*) reports the notch / home
  // indicator, which the bottom tab bar pads itself clear of.
  viewportFit: "cover",
  // Shrink the layout (not just the visual viewport) when the on-screen
  // keyboard opens, so chat composers stay above it on Android.
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
