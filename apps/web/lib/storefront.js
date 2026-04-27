export const introStats = [
  {
    label: "Current live surface",
    value: "GitHub Pages + runtime/storefront",
  },
  {
    label: "Target runtime",
    value: "Next.js App Router",
  },
  {
    label: "Commerce backend",
    value: "Order API + payment confirm webhook",
  },
];

export const migrationMilestones = [
  "Move Sanity reads from static scripts into server-safe loaders.",
  "Create order records before redirecting to the payment provider.",
  "Confirm payment server-side with the provider secret key.",
  "Replace root Pages entrypoints route by route after parity checks.",
];

export const apiSurface = [
  {
    route: "/api/health",
    description: "Returns a lightweight runtime status payload.",
  },
  {
    route: "/api/orders",
    description: "Stub for future order creation and persistence.",
  },
  {
    route: "/api/payments/confirm",
    description: "Stub for future server-side payment confirmation.",
  },
];

export const collectionPreview = [
  {
    title: "Edition Rugs",
    status: "Ready to migrate",
    summary: "Best first target because current catalog and PDP logic already exists in the shared runtime.",
    tags: ["Sanity content", "Price formatting", "Edition detail"],
  },
  {
    title: "Archive",
    status: "Content review",
    summary: "Good candidate for a content-first route after document structures settle in Sanity.",
    tags: ["Editorial", "Static-heavy", "Low payment risk"],
  },
  {
    title: "Checkout",
    status: "Blocked by backend",
    summary: "Needs order creation, payment approval, and webhook handling before production traffic should move here.",
    tags: ["Orders API", "PG confirm", "Webhook"],
  },
];

export const operationalNotes = [
  "Keep the root Pages shell live until the Next routes reach feature parity.",
  "Do not expose PG secret keys in client-side code.",
  "Treat the current API handlers as placeholders only, not production payment logic.",
];