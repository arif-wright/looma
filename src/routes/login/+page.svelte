<script lang="ts">
    // No exported props needed here
  </script>
  
  <h1 class="text-2xl font-bold mb-4">Login</h1>
  
  <form method="POST" class="flex flex-col gap-3 max-w-sm">
    <input
      name="email"
      type="email"
      placeholder="you@example.com"
      required
      class="border rounded p-2"
    />
  
    <button
      formaction="?/magic"
      class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded"
    >
      Send Magic Link
    </button>
  </form>
  
  <p class="text-sm text-gray-600 mt-4">
    A sign-in link will be emailed to you. Check your inbox and click it to continue.
  </p>
  
  