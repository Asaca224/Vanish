import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "Vanish — Personal Data Removal",
  description:
    "Get your personal information deleted from data brokers and people-search sites.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/intake", label: "Identity" },
  { href: "/brokers", label: "Brokers" },
  { href: "/drop", label: "DROP" },
  { href: "/requests", label: "Requests" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col">
          <header className="flex items-center justify-between border-b border-edge px-6 py-4">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-lg font-bold tracking-tight">
                Vanish
              </Link>
              {session?.user && (
                <nav className="flex gap-4 text-sm text-muted">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="transition hover:text-gray-100"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            {session?.user && (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/signin" });
                }}
              >
                <button className="text-sm text-muted hover:text-gray-100">
                  {session.user.email} · Sign out
                </button>
              </form>
            )}
          </header>
          <main className="flex-1 px-6 py-8">{children}</main>
          <footer className="border-t border-edge px-6 py-4 text-xs text-muted">
            Single-tenant · PII field-encrypted at the app layer · Not legal advice.
          </footer>
        </div>
      </body>
    </html>
  );
}
