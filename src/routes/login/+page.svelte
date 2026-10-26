<script lang="ts">
  import type { PageProps } from './$types';
  let { form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · Oddhouse</title></svelte:head>
<main class="login">
  <a class="brand" href="/">oddhouse<span class="dot">.</span></a>
  <h1>Sign in</h1>
  <form method="POST">
    <label>Username<input name="username" autocomplete="username" required /></label>
    <label
      >Password<input
        name="password"
        type="password"
        autocomplete="current-password"
        required
      /></label
    >
    {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
    <button>Sign in</button>
  </form>
</main>
