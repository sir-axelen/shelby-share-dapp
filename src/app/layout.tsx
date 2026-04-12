import type { Metadata } from "next";
import { DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "Shelby File Share — Decentralized Storage on Aptos",
  description: "Decentralized Real-Time Storage on Aptos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${spaceMono.variable} font-sans antialiased`}
        style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
      >
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
