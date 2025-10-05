<script lang="ts">
    import { supabase } from '$lib/supabaseClient';
    import { PUBLIC_APP_URL } from '$env/static/public';
  
    let email = '';
    let ok: boolean | null = null;
    let error: string | null = null;
  
    async function sendMagic(e: Event) {
      e.preventDefault();
      ok = null;
      error = null;
  
      const redirectTo =
        PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo }
      });
  
      if (err) {
        error = err.message;
        ok = false;
      } else {
        ok = true;
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
    />
    <button class="bg-emerald-600 text-white py-2 px-4 rounded">Send Magic Link</button>
  </form>
  
  {#if error}
    <p style="color:red;margin-top:10px;">{error}</p>
  {:else if ok}
    <p style="color:green;margin-top:10px;">If that email exists, a sign-in link was sent.</p>
  {/if}
  
  
  