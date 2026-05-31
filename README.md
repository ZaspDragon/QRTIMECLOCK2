# QRTIMECLOCK2

This repository mirrors the upgraded **QRTimeClock Pro -> Portaly SaaS** application into a separate deployment target.

It keeps the upgraded static frontend architecture:

- `index.html`
- `style.css`
- `app.js`
- `firebase-config.js`
- `billing-config.js`
- `firestore.rules`
- `functions/index.js`

The app is still a plain GitHub Pages / static-host friendly site with hash routing, plus optional Firebase Cloud Functions for email and billing workflows.

## What was mirrored

The source baseline came from `QRTimeclock-reference`, then the upgraded SaaS implementation from the `Portaly` repo was applied on top.

That means this target repo now contains:

- worker-first public punch flow
- agency/client/site/worker management
- client approval flow
- payroll export surfaces
- invite flows
- billing placeholders and Square-ready structure
- Firebase Functions sources for invite/demo email workflows

## Important config note

This mirror does **not** automatically point at the live Portaly Firebase project.

`firebase-config.js` is intentionally shipped with:

- `enabled: false`
- blank Firebase keys
- blank `functionsBaseUrl`

That keeps the public site loading safely until you decide whether this repo should use:

1. its own Firebase project, or
2. the existing Portaly Firebase project

## Local setup

```bash
npm install
npm run build
```

The root build script creates a static `dist/` folder with the frontend assets for GitHub Pages, Vercel, or another static host.

## Firebase setup

If this repo should use Firebase Cloud Mode:

1. Create or choose a Firebase project.
2. Enable:
   - Authentication
   - Firestore
   - Functions
3. Replace the blank values in `firebase-config.js`.
4. Deploy `firestore.rules`.
5. If using the included functions, deploy the `functions/` directory separately.

## Deployment

### GitHub Pages

Use the built static output from `dist/`, or configure Pages to publish from the root if you prefer serving the checked-in files directly.

Because the app uses hash routing, deep links work in the form:

- `#/landing`
- `#/login`
- `#/clock`
- `#/punch`

### Vercel

This app can be deployed as a static site. No server runtime is required for the frontend itself.

If you want invite/demo emails or future subscription automation, deploy `functions/` to Firebase Functions separately.
