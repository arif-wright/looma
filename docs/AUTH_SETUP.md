# Auth Provider Setup

Current configuration (SvelteKit + Supabase via `@supabase/ssr`):

- Email / Password
- Google OAuth (`PUBLIC_OAUTH_GOOGLE=true`)
- Apple / Facebook disabled (`PUBLIC_OAUTH_APPLE=false`, `PUBLIC_OAUTH_FACEBOOK=false`)

To enable additional providers later:

1. Flip the relevant `PUBLIC_OAUTH_*` flag(s) to `true` in the environment (.env, Vercel, etc.).
2. Add the provider secrets to your deployment environment (Vercel project, Supabase settings).
3. Enable the provider inside Supabase Dashboard → Authentication → Providers and supply the callback URL (`/auth/callback`).

Remember to keep `PUBLIC_SITE_URL`, `PUBLIC_SUPABASE_URL`, and `PUBLIC_SUPABASE_ANON_KEY` in sync across environments.
