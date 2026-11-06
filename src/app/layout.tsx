import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allowance — your agent's spending allowance",
  description: "Lets your AI agent pay for what it needs, asks you about the rest, and remembers your rules on Walrus. Settles in USDC on Sui via Tatum.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
