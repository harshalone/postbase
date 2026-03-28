import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import { ToastProvider } from "@/hooks/use-toast";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <NextTopLoader color="#c4623a" shadow={false} showSpinner={false} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
