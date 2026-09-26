import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import { Navbar } from "@/components/navbar";
import { ClientErrorMonitor } from "@/components/client-error-monitor";
import { ThemeProvider } from "@/components/theme-provider";

import { THEME_STORAGE_KEY } from "@/lib/themes";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t){document.documentElement.dataset.theme=t;}}catch(e){}}());`;

const homeTitle = "Hub";
const homeDescription =
  "Personal hub of in-browser micro-utilities for developers, 3D artists, and creators.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: homeTitle,
    template: "%s | Hub",
  },
  description: homeDescription,
  openGraph: {
    title: homeTitle,
    description: homeDescription,
    siteName: "Hub",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: homeTitle,
    description: homeDescription,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <Navbar />
          <ClientErrorMonitor />
          <main className="flex flex-1 flex-col">{children}</main>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}