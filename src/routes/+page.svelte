<script lang="ts">
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let adding = $state(false);
  let copied = $state(false);
  const format = (value: number) => value.toLocaleString();
  let peak = $derived(Math.max(1, ...data.series.map((item) => item.count)));
  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(data.snippet);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<svelte:head><title>{data.selected?.name || 'Sites'} · Oddhouse</title></svelte:head>
<header>
  <a class="brand" href="/">oddhouse<span class="dot">.</span></a>
  <span class="header-note">Web analytics</span>
  <form method="POST" action="?/logout"><button class="quiet">Sign out</button></form>
</header>
<main class="dashboard">
  <nav class="toolbar" aria-label="Dashboard filters">
    <form method="GET" class="filters">
      <label class="sr-only" for="site">Site</label>
      <select
        name="site"
        id="site"
        value={data.selected?.id}
        onchange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {#if !data.sites.length}<option>No sites yet</option>{/if}
        {#each data.sites as site}<option value={site.id}>{site.name}</option>{/each}
      </select>
      <label class="sr-only" for="days">Period</label>
      <select
        name="days"
        id="days"
        value={data.days}
        onchange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="1">Today</option><option value="7">Last 7 days</option><option value="30"
          >Last 30 days</option
        ><option value="90">Last 90 days</option>
      </select>
      <button class="quiet">Refresh</button>
    </form>
    <button class="quiet" onclick={() => (adding = !adding)}
      >{adding ? 'Cancel' : '+ Add site'}</button
    >
  </nav>
  {#if adding || !data.sites.length || form?.error}
    <section class="panel">
      <h2>Add a site</h2>
      <form method="POST" action="?/createSite" class="site-form">
        <label>Name<input name="name" placeholder="Neoblog" maxlength="100" required /></label>
        <label
          >Site origin<input
            name="origin"
            type="url"
            placeholder="https://example.com"
            required
          /></label
        >
        <button>Add site</button>
      </form>
      {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
      <p class="muted">Register each origin separately, including www or other subdomains.</p>
    </section>
  {/if}
  {#if data.selected}
    <div class="page-heading">
      <div>
        <p class="eyebrow">OVERVIEW</p>
        <h1>{data.selected.name}</h1>
        <p class="muted">{data.selected.origin}</p>
      </div>
      <span class="period-note"
        >UTC · {data.days === 1 ? 'Today' : `${data.days} calendar days`}</span
      >
    </div>
    <section class="metrics" aria-label="Totals">
      <div>
        <p>Pageviews</p>
        <strong>{format(data.totals.pageviews)}</strong>
      </div>
      <div>
        <p>Custom events</p>
        <strong>{format(data.totals.events)}</strong>
      </div>
    </section>
    <section class="panel chart-panel">
      <h2>Pageviews over time</h2>
      <div
        class="chart"
        role="img"
        aria-label={`Daily pageviews for the last ${data.days} days. ${data.totals.pageviews} total.`}
      >
        {#each data.series as day}
          <div class="bar-slot" title={`${day.day}: ${format(day.count)} pageviews`}>
            <div
              class="bar"
              style:height={`${(day.count / peak) * 100}%`}
              class:zero={day.count === 0}
            ></div>
          </div>
        {/each}
      </div>
      <div class="chart-labels">
        <span>{data.series[0]?.day}</span><span>{data.series.at(-1)?.day}</span>
      </div>
      <details>
        <summary>Daily counts</summary>
        <table>
          <thead><tr><th>Date (UTC)</th><th>Pageviews</th></tr></thead><tbody
            >{#each data.series as day}<tr><td>{day.day}</td><td>{format(day.count)}</td></tr
              >{/each}</tbody
          >
        </table>
      </details>
    </section>
    <div class="tables">
      <section class="panel">
        <h2>Pages</h2>
        <table>
          <thead><tr><th>Path</th><th>Views</th></tr></thead><tbody
            >{#each data.pages as page}<tr
                ><td class="break">{page.path}</td><td>{format(page.count)}</td></tr
              >{:else}<tr><td colspan="2" class="empty">No pageviews in this period.</td></tr
              >{/each}</tbody
          >
        </table>
      </section>
      <section class="panel">
        <h2>Referrers</h2>
        <table>
          <thead><tr><th>Source</th><th>Views</th></tr></thead><tbody
            >{#each data.referrers as referrer}<tr
                ><td class="break">{referrer.referrer || 'Direct / unknown'}</td><td
                  >{format(referrer.count)}</td
                ></tr
              >{:else}<tr><td colspan="2" class="empty">No referrers in this period.</td></tr
              >{/each}</tbody
          >
        </table>
      </section>
      <section class="panel">
        <h2>Events</h2>
        <table>
          <thead><tr><th>Name</th><th>Count</th></tr></thead><tbody
            >{#each data.events as event}<tr
                ><td class="break">{event.event}</td><td>{format(event.count)}</td></tr
              >{:else}<tr><td colspan="2" class="empty">No events in this period.</td></tr
              >{/each}</tbody
          >
        </table>
      </section>
    </div>
    <section class="panel integration">
      <h2>Install tracker</h2>
      <p class="muted">
        Add this to your shared HTML template. Page loads and SPA path changes are counted
        automatically.
      </p>
      <pre><code>{data.snippet}</code></pre>
      <button class="quiet" onclick={copySnippet}>{copied ? 'Copied' : 'Copy snippet'}</button>
      <p class="muted small">
        Custom events: <code>window.oddhouse?.event('signup')</code>. Query strings and fragments
        are excluded. Do Not Track and Global Privacy Control are respected.
      </p>
    </section>
  {:else}
    <div class="welcome">
      <p class="eyebrow">GET STARTED</p>
      <h1>No sites yet.</h1>
      <p class="muted">Add a site above, then copy its tracking script into your website.</p>
    </div>
  {/if}
  <footer>oddhouse · Tracker uses no cookies or visitor identifiers</footer>
</main>
