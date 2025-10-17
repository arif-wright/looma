<script lang="ts">
  import { PUBLIC_SITE_URL } from '$env/static/public';
  import { supabaseBrowser } from '$lib/supabaseClient';

  let email = '';

  async function sendMagic(e: SubmitEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const value = (formData.get('email') as string | null)?.trim();
    if (!value) return;

    const supabase = supabaseBrowser();
    email = value;

    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: `${PUBLIC_SITE_URL}/auth/callback?next=/app/dashboard` }
    });

    if (error) {
      console.error('Supabase sign-in error:', error.message);
    } else {
      alert('Magic link sent! Check your inbox.');
    }
  }
</script>

<h1>Login</h1>

<form class="flex flex-col gap-3 max-w-sm" on:submit={sendMagic}>
  <input
    type="email"
    placeholder="you@example.com"
    bind:value={email}
    required
    class="border rounded p-2"
    name="email"
  />
  <button class="bg-emerald-600 text-white py-2 px-4 rounded">Send Magic Link</button>
</form>
