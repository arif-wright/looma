# Apple Sign In Configuration

To enable Sign in with Apple for Looma:

1. **Create a Services ID** in the Apple Developer portal (`Certificates, Identifiers & Profiles` → `Identifiers`). Use a reverse-DNS identifier (for example `com.kinforge.looma.auth`). Enable `Sign in with Apple` and add the callback URL `https://looma-omega.vercel.app/auth/callback` as well as `http://localhost:5173/auth/callback` for local development.
2. **Generate a Sign in with Apple key** (`Keys` → `+`). Check `Sign in with Apple`, choose the Services ID you created, and download the `.p8` private key. Record the **Key ID** and **Team ID**; the key cannot be downloaded again.
3. **Configure Supabase** under `Authentication` → `Providers` → `Apple` with:
   - Team ID
   - Services ID
   - Key ID
   - Contents of the downloaded `.p8` key
   - Callback URL `/auth/callback`
4. Commit the key to a secure secret store (e.g. Supabase project config or deployment provider secrets). Do *not* commit the `.p8` file to git.

After saving the provider settings, test the Apple flow locally (`npm run dev`) and in the hosted environment to ensure the callback returns to `/auth/callback` and lands on `/app/home`.
