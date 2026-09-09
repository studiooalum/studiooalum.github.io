# Studio OALUM workspace instructions

- Do not run `npm ci` in this workspace. It deletes the working dependency tree and can be interrupted by resource-heavy Sanity/SWC installation in the dev container.
- Do not reinstall dependencies for routine validation. Run `npm run verify` instead.
- When `package.json` or `package-lock.json` changes and dependencies must be synchronized, run `npm run deps:install` once.
- Treat `whatwg-encoding` deprecation output as a non-blocking transitive dependency warning unless npm exits with a nonzero status.
- Keep Cloudflare production operations ordered as D1 backup, targeted migration, Pages deployment, then production checks. Never run the full migration chain when production migration history is empty.