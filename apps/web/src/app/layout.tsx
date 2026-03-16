import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Postbase",
  description: "Self-hosted Supabase alternative",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <NextTopLoader color="#c4623a" shadow={false} showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
