import Link from "next/link";
import { apiSurface, introStats, migrationMilestones, operationalNotes } from "@/lib/storefront";

export default function HomePage() {
  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="kicker">Future storefront surface</p>
          <h1>Build the production storefront here without breaking the live Pages shell.</h1>
          <p className="hero-panel__body">
            This Next.js app is the migration target for the public shop, product pages, checkout,
            and payment flow. The current GitHub Pages entrypoints remain live until this surface
            reaches parity.
          </p>
          <div className="action-row">
            <Link href="/shop" className="action-pill action-pill--solid">
              Open live shop data
            </Link>
            <a href="/api/health" className="action-pill action-pill--ghost">
              Inspect API health
            </a>
          </div>
        </div>
        <div className="hero-panel__aside">
          <p className="hero-panel__label">First production boundaries</p>
          <ul className="detail-list">
            <li>Catalog rendering now reads published product documents from Sanity.</li>
            <li>Checkout now creates an order record through the local order API route.</li>
            <li>Payment confirmation now crosses a server route before success/fail handling.</li>
          </ul>
        </div>
      </section>

      <section className="metric-grid" aria-label="Project status">
        {introStats.map((item) => (
          <article key={item.label} className="metric-card">
            <p className="metric-card__label">{item.label}</p>
            <p className="metric-card__value">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <p className="kicker">Migration order</p>
          <h2>What should happen next</h2>
          <ol className="ordered-list">
            {migrationMilestones.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </article>

        <article className="panel-card">
          <p className="kicker">Server surface</p>
          <h2>Routes already reserved</h2>
          <div className="route-list">
            {apiSurface.map((item) => (
              <div key={item.route} className="route-row">
                <code>{item.route}</code>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="notes-card">
        <p className="kicker">Operating notes</p>
        <div className="notes-card__grid">
          {operationalNotes.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </section>
    </div>
  );
}