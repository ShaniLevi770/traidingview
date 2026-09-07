import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getOptionalSession } from "@/lib/supabase/dal";
import { signOut } from "@/app/actions/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trading Journal",
  description: "A trading journal for beginners, built on top of Colmex Pro trade history and TradingView charts.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getOptionalSession();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black dark:text-zinc-50">
        {session && (
          <header className="border-b border-zinc-200 dark:border-zinc-800">
            <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
              <Link href="/journal" className="font-semibold">Journal</Link>
              <Link href="/journal" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">Trades</Link>
              <Link href="/import" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">Import</Link>
              <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">Dashboard</Link>
              <form action={signOut} className="ml-auto">
                <button type="submit" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                  Log out
                </button>
              </form>
            </nav>
          </header>
        )}
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
