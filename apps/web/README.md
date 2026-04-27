# apps/web

`apps/web` is the future storefront target for the production launch.

The live public site still runs from the repository root HTML files plus `runtime/storefront`. This app exists so the next migration step has a fixed destination instead of more ad-hoc static expansion.

## Included now

- App Router shell with shared layout and global styles
- `/` overview page for the future storefront surface
- `/shop` live Sanity-backed catalog page
- `/product/[baseSlug]` grouped base-product route
- `/edition/[slug]` individual edition route
- `/checkout` client-side cart and order creation page
- `/payment`, `/success`, `/fail` preview payment approval flow
- `/api/health` sanity-check route
- `/api/orders` order creation route
- `/api/payments/confirm` preview payment confirmation route
- `.env.example` for Sanity and payment configuration

## Run

From the repository root:

```bash
npm install
npm run web:dev
```

## Notes

- This app is not the live public site yet.
- The payment approval route is still a preview flow. It crosses the server boundary but does not yet call a real PG secret-key API.
- When production work begins, replace the preview approval logic with the provider's real server-side confirmation request.
- The initial Postgres draft for orders, payments, shipping, and webhook events lives in `docs/commerce-schema.sql`.
- The first Vercel migration checklist for this app lives in `docs/apps-web-deploy.md`.