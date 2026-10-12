import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import Providers from "./providers";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://einkk.app"),
  title: {
    default: "einkk.app — NIKKE Solo Raid border forecasts",
    template: "%s | einkk.app",
  },
  description:
    "Per-server forecasts of the NIKKE Solo Raid ranking borders, with honest ranges, updated during the raid.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "einkk.app",
    title: "einkk.app — NIKKE Solo Raid border forecasts",
    description: "Top 3% border forecasts for every NIKKE server, updated during the Solo Raid.",
  },
  twitter: { card: "summary" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={roboto.variable} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" />
        <AppRouterCacheProvider>
          <Providers>{children}</Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
