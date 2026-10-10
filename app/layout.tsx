import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aangan Call Desk",
  description: "Every call to Aangan Studio: verdict, recording, transcript, handoff and cost.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="top">
          <div className="wrap">
            <h1><a href="/" style={{ color: "inherit", textDecoration: "none" }}>Aangan Studio · Call Desk</a></h1>
            <p>Voice agent answers 24/7 · verdicts by Nikhil's five criteria · updates itself after every call</p>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
      </body>
    </html>
  );
}
