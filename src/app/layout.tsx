import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Category Draft Coach — Fantasy Baseball",
  description:
    "Maximize your roto points with z-score category analysis during your fantasy baseball draft.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
