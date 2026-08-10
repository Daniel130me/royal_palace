import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const interMono = JetBrains_Mono({
  variable: "--font-inter-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Royal Palace Health Care — Connected Healthcare Platform",
  description:
    "Royal Palace Health Care connects consultations, medical records, laboratory, pharmacy and delivery into one continuous care journey.",
  keywords: [
    "healthcare", "telemedicine", "consultation", "laboratory", "pharmacy",
    "delivery", "medical records", "Nigeria", "Royal Palace",
  ],
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${interMono.variable} font-sans antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        {children}
        <Toaster richColors position="top-center" toastOptions={{ style: { borderRadius: "var(--radius)" } }} />
      </body>
    </html>
  );
}
