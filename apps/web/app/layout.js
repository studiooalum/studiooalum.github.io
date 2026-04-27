import Link from "next/link";
import "./globals.css";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/shop", label: "Shop Preview" },
  { href: "/checkout", label: "Checkout" },
  { href: "/api/health", label: "API Health" },
];

export const metadata = {
  title: "Studio Oalum Storefront",
  description: "Next.js storefront scaffold for the Studio Oalum production launch.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link href="/" className="brand-mark">
              <span className="brand-mark__eyebrow">Studio Oalum</span>
              <span className="brand-mark__title">Storefront Scaffold</span>
            </Link>
            <nav className="site-nav" aria-label="Primary">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="site-nav__link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <p>Production launch should move orders and payment confirmation into server routes here.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}