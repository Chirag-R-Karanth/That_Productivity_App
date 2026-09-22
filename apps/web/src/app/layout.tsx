import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { themeInitScript } from "@/lib/themeInit";
import "./globals.css";

export const metadata: Metadata = {
  title: "That Productivity App",
  description: "Tasks, calendar, attendance, and focus timer in one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "That Productivity App",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /* suppressHydrationWarning: the head script injects the theme class onto
       <html> before React hydrates (server rendered no class) — a benign
       attribute-only difference React should not attempt to patch. */
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the stored theme before first paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript() }}
        />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes into <body> that the server never rendered. */}
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}