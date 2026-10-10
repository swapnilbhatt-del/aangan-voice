import "./globals.css";
import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import { sql } from "@/lib/db";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Aangan Call Desk",
  description: "Every call to Aangan Studio: verdict, recording, transcript, handoff and cost.",
};

// Latest health check per service, so the header tells the truth about the integrations.
async function systemStatus() {
  try {
    const rows = await sql<{ service: string; ok: boolean; checked_at: Date }[]>`
      select distinct on (service) service, ok, checked_at from health_checks order by service, checked_at desc`;
    const down = rows.filter((r) => !r.ok).map((r) => r.service);
    return { ok: down.length === 0, down, checked: rows[0]?.checked_at ?? null };
  } catch {
    return { ok: false, down: ["database"], checked: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await systemStatus();
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="topbar">
          <div className="inner">
            <a className="brand" href="/" aria-label="Aangan Call Desk home">
              <span className="brand-mark" aria-hidden="true">a</span>
              <span>
                <span className="brand-name">Aangan Call Desk</span>
                <br />
                <span className="brand-sub">Aangan Studio · Pune</span>
              </span>
            </a>
            <span className="spacer" />
            <span className="live" title={status.checked ? `Last health check ${new Date(status.checked).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "No health check yet"}>
              <span className={`dot${status.ok ? "" : " bad"}`} aria-hidden="true" />
              <span className="live-text">{status.ok ? "Agent live 24/7 · all systems OK" : `Attention: ${status.down.join(", ")} down`}</span>
              <span className="sr-only">{status.ok ? "All systems OK" : "Some systems down"}</span>
            </span>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
      </body>
    </html>
  );
}
