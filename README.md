# sv

[![Playwright Tests](https://github.com/kinforge/looma-web/actions/workflows/playwright.yml/badge.svg)](https://github.com/kinforge/looma-web/actions/workflows/playwright.yml)

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Auth & Protected Routes

- `/app` is gated in `src/routes/app/+layout.server.ts`. The loader checks `locals.getSession()` and redirects anonymous visitors to `/login?next=...`.
- The logout action lives in `src/routes/app/+page.server.ts`. The shared layout posts to `/app?/logout`, which signs out via Supabase and sends the user back to `/login`.
- `/login` understands an optional `?next=` query (legacy `redirectTo` still works). The value must be an on-site path (starting with a single `/`); anything else falls back to `/app`.
- Supabase magic links land on `/auth/callback`, which consumes the URL hash, stores the session, and then redirects to the sanitized `next` path (defaulting to `/app`).
- The callback also posts the tokens to `/auth/refresh` so SSR guards have access to the Supabase session cookies.
- During this processing window users see a full-screen status screen with spinner (`AuthProgress`), stateful messaging, and a retry link back to `/login` when something goes wrong.

## CI

- GitHub Actions runs the Playwright suite on every push and pull request. Failing runs upload the HTML report from the playwright-report directory as a downloadable artifact.

## Local Testing

1. Visit `/app` while logged out — you should be redirected to `/login?next=/app`.
2. Complete the Supabase magic-link sign-in — the browser should land on `/app` (or the sanitized target from `next`).
3. Click **Logout** in the header — you should be returned to `/login`.

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
