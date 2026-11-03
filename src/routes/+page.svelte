<script lang="ts">
  import ViewChart from '#lib/components/ViewChart.svelte';
  import { pageReportUrl } from '#lib/report-links.js';
  import {
    comparison,
    formatCount as format,
    formatDuration as duration,
  } from '#lib/report-format.js';
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let adding = $state(false);
  let copied = $state(false);
  let customDates = $state(false);
  let exportUrl = $derived(
    `/api/export?${new URLSearchParams({ site: data.selected?.id || '', from: data.period.from, to: data.period.to })}`,
  );
  let renameAction = $derived(
    `?/renameSite&${new URLSearchParams({ site: data.selected?.id || '', from: data.period.from, to: data.period.to })}`,
  );
  const reportUrl = (dimension: string) =>
    `/reports/${dimension}?${new URLSearchParams({ site: data.selected?.id || '', from: data.period.from, to: data.period.to })}`;
  let liveErrorSite = $state<string | null>(null);
  let liveErrorAt = $state(0);
  const pageUrl = (path: string) => pageReportUrl(data.selected?.id || '', path, data.period);
  let live = $state<typeof data.live | null>(null);
  let visibleLive = $derived(
    live?.siteId === data.selected?.id && live.updatedAt > data.live.updatedAt ? live : data.live,
  );
  onMount(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || !data.selected || controller) return;
      const siteId = data.selected.id;
      controller = new AbortController();
      try {
        const response = await fetch(`/api/live?site=${encodeURIComponent(siteId)}`, {
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        });
        if (response.ok) {
          live = await response.json();
          liveErrorSite = null;
        } else {
          liveErrorSite = siteId;
          liveErrorAt = Date.now();
        }
      } catch {
        liveErrorSite = siteId;
        liveErrorAt = Date.now();
      } finally {
        controller = undefined;
      }
    };
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', refresh);
    };
  });
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
        value={data.period.custom || customDates ? 'custom' : String(data.days)}
        onchange={(event) => {
          customDates = event.currentTarget.value === 'custom';
          if (!customDates) {
            const form = event.currentTarget.form!;
            for (const name of ['from', 'to']) {
              const field = form.elements.namedItem(name) as HTMLInputElement | null;
              if (field) field.disabled = true;
            }
            form.requestSubmit();
          }
        }}
      >
        <option value="1">Today</option><option value="7">Last 7 days</option><option value="30"
          >Last 30 days</option
        ><option value="90">Last 90 days</option><option value="custom">Custom dates</option>
      </select>
      {#if data.period.custom || customDates}
        <label class="date-filter"
          >From (UTC)<input
            type="date"
            name="from"
            value={data.period.from}
            max={data.period.today}
            required
          /></label
        >
        <label class="date-filter"
          >To (UTC)<input
            type="date"
            name="to"
            value={data.period.to}
            max={data.period.today}
            required
          /></label
        >
      {/if}
      <button class="quiet">{data.period.custom || customDates ? 'Apply' : 'Refresh'}</button>
    </form>
    {#if data.selected}<a class="export-link" href={exportUrl} download>Export CSV</a>{/if}
    <button class="quiet" onclick={() => (adding = !adding)}
      >{adding ? 'Cancel' : '+ Add site'}</button
    >
  </nav>
  {#if data.period.error}<p class="error" role="alert">
      {data.period.error} Showing {data.period.from}–{data.period.to}.
    </p>{/if}
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
      <span class="period-note">UTC · {data.period.from} – {data.period.to}</span>
    </div>
    <section class="metrics" aria-label="Totals">
      <div>
        <p>Pageviews</p>
        <strong>{format(data.totals.pageviews)}</strong>
        <p class="comparison">
          {comparison(data.totals.pageviews, data.previous.pageviews)}
          <span class="muted">vs {format(data.previous.pageviews)}</span>
        </p>
      </div>
      <div>
        <p>Events</p>
        <strong>{format(data.totals.events)}</strong>
        <p class="comparison">
          {comparison(data.totals.events, data.previous.events)}
          <span class="muted">vs {format(data.previous.events)}</span>
        </p>
      </div>
      <div>
        <p>Sessions started</p>
        <strong>{format(data.totals.sessions)}</strong>
        <p class="comparison">
          {comparison(data.totals.sessions, data.previous.sessions)}
          <span class="muted">vs {format(data.previous.sessions)}</span>
        </p>
      </div>
    </section>
    <p class="muted small">
      Compared with the preceding {data.days} UTC calendar {data.days === 1 ? 'day' : 'days'}. {#if data.period.to === data.period.today}Today
        is still in progress.
      {/if}Sessions expire after 30 minutes idle; they are not unique visitors.
    </p>
    <ViewChart series={data.chartSeries} granularity={data.granularity} />
    <section class="panel">
      <h2>Live activity <span class="muted small">· Now, independent of report dates</span></h2>
      <p>
        {visibleLive.active} active sessions in the last 60 seconds. Refreshes every 15 seconds.
      </p>
      <p class="muted small">
        Snapshot: {new Date(visibleLive.updatedAt).toISOString().slice(11, 19)} UTC.
      </p>
      {#if liveErrorSite === data.selected.id && liveErrorAt > visibleLive.updatedAt}<p
          class="error"
          role="status"
        >
          Could not refresh live activity. Showing the last successful snapshot.
        </p>{/if}
      <table>
        <thead><tr><th>Recent pageviews (last 5 minutes, UTC)</th><th>Time</th></tr></thead><tbody>
          {#each visibleLive.recent as hit}<tr
              ><td><a href={pageUrl(hit.path)}>{hit.path}</a></td><td
                >{new Date(hit.created_at).toISOString().slice(11, 19)}</td
              ></tr
            >
          {:else}<tr><td colspan="2" class="empty">No recent pageviews.</td></tr>{/each}
        </tbody>
      </table>
    </section>
    <p class="muted small">Breakdowns show the top 20 results in each category.</p>
    <div class="tables">
      <section class="panel">
        <div class="panel-heading">
          <h2>Pages</h2>
          <a class="small" href={reportUrl('pages')}
            >View all<span class="sr-only"> pages</span> →</a
          >
        </div>
        <table>
          <thead><tr><th>Path</th><th>Views</th></tr></thead><tbody
            >{#each data.pages as page}<tr
                ><td class="break"><a href={pageUrl(page.path)}>{page.path}</a></td><td
                  >{format(page.count)}</td
                ></tr
              >{:else}<tr><td colspan="2" class="empty">No pageviews in this period.</td></tr
              >{/each}</tbody
          >
        </table>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <h2>Referrers</h2>
          <a class="small" href={reportUrl('referrers')}
            >View all<span class="sr-only"> referrers</span> →</a
          >
        </div>
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
        <div class="panel-heading">
          <h2>Events</h2>
          <a class="small" href={reportUrl('events')}
            >View all<span class="sr-only"> events</span> →</a
          >
        </div>
        <table>
          <thead><tr><th>Name</th><th>Count</th></tr></thead><tbody
            >{#each data.events as event}<tr
                ><td class="break">{event.event}</td><td>{format(event.count)}</td></tr
              >{:else}<tr><td colspan="2" class="empty">No events in this period.</td></tr
              >{/each}</tbody
          >
        </table>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <h2>Countries</h2>
          <a class="small" href={reportUrl('countries')}
            >View all<span class="sr-only"> countries</span> →</a
          >
        </div>
        <table>
          <thead><tr><th>Country</th><th>Views</th></tr></thead><tbody>
            {#each data.countries as country}<tr
                ><td class="break">{country.name}</td><td>{format(country.count)}</td></tr
              >
            {:else}<tr><td colspan="2" class="empty">No pageviews in this period.</td></tr>{/each}
          </tbody>
        </table>
        <p class="muted small">
          <a href="https://db-ip.com" target="_blank" rel="noreferrer">IP Geolocation by DB-IP</a>
        </p>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <h2>Browsers</h2>
          <a class="small" href={reportUrl('browsers')}
            >View all<span class="sr-only"> browsers</span> →</a
          >
        </div>
        <table>
          <thead><tr><th>Browser</th><th>Views</th></tr></thead><tbody>
            {#each data.browsers as browser}<tr
                ><td class="break">{browser.browser || 'Unknown'}</td><td
                  >{format(browser.count)}</td
                ></tr
              >
            {:else}<tr><td colspan="2" class="empty">No pageviews in this period.</td></tr>{/each}
          </tbody>
        </table>
      </section>
      {#each [{ key: 'devices', title: 'Devices', label: 'Device', rows: data.devices }, { key: 'os', title: 'Operating systems', label: 'OS', rows: data.operatingSystems }, { key: 'languages', title: 'Languages', label: 'Language', rows: data.languages }] as breakdown}
        <section class="panel">
          <div class="panel-heading">
            <h2>{breakdown.title}</h2>
            {#if 'key' in breakdown && breakdown.key}<a
                class="small"
                href={reportUrl(breakdown.key)}
                >View all<span class="sr-only"> {breakdown.title.toLowerCase()}</span> →</a
              >{/if}
          </div>
          <table>
            <thead><tr><th>{breakdown.label}</th><th>Views</th></tr></thead>
            <tbody
              >{#each breakdown.rows as row}<tr
                  ><td class="break">{row.label}</td><td>{format(row.count)}</td></tr
                >
              {:else}<tr><td colspan="2" class="empty">No pageviews in this period.</td></tr
                >{/each}</tbody
            >
          </table>
        </section>
      {/each}
      <section class="panel">
        <h2>Campaigns</h2>
        <table>
          <thead><tr><th>Source / medium / campaign</th><th>Views</th></tr></thead><tbody>
            {#each data.campaigns as campaign}<tr
                ><td
                  >{campaign.source || '—'} / {campaign.medium || '—'} / {campaign.campaign ||
                    '—'}</td
                ><td>{format(campaign.count)}</td></tr
              >
            {:else}<tr><td colspan="2" class="empty">No campaign pageviews.</td></tr>{/each}
          </tbody>
        </table>
      </section>
      {#each [{ key: 'outbound', title: 'Outbound clicks', rows: data.outboundLinks.map( (row) => ({ label: row.target, count: row.count }) ) }, { key: 'downloads', title: 'Downloads', rows: data.downloads.map( (row) => ({ label: row.target, count: row.count }) ) }, { title: 'Entry pages', rows: data.entries.map( (row) => ({ label: row.path, count: row.count }) ) }, { title: 'Exit pages (idle for 30+ minutes)', rows: data.exits.map( (row) => ({ label: row.path, count: row.count }) ) }] as breakdown}
        <section class="panel">
          <div class="panel-heading">
            <h2>{breakdown.title}</h2>
            {#if 'key' in breakdown && breakdown.key}<a
                class="small"
                href={reportUrl(breakdown.key)}
                >View all<span class="sr-only"> {breakdown.title.toLowerCase()}</span> →</a
              >{/if}
          </div>
          <table>
            <thead><tr><th>Page / target</th><th>Count</th></tr></thead><tbody>
              {#each breakdown.rows as row}<tr><td>{row.label}</td><td>{format(row.count)}</td></tr>
              {:else}<tr><td colspan="2" class="empty">No data in this period.</td></tr>{/each}
            </tbody>
          </table>
        </section>
      {/each}
      <section class="panel">
        <h2>Engagement</h2>
        <table>
          <thead><tr><th>Page</th><th>Active time</th><th>Deepest scroll</th></tr></thead><tbody>
            {#each data.engagement as row}<tr
                ><td>{row.path}</td><td>{duration(row.active_ms)}</td><td>{row.max_scroll}%</td></tr
              >
            {:else}<tr><td colspan="3" class="empty">No measured engagement.</td></tr>{/each}
          </tbody>
        </table>
      </section>
    </div>
    <details class="panel site-settings" open={!!form?.renameError}>
      <summary>Site settings</summary>
      <form method="POST" action={renameAction} class="site-form">
        <input type="hidden" name="id" value={data.selected.id} />
        <label
          >Site name<input name="name" value={data.selected.name} maxlength="100" required /></label
        >
        <button>Save name</button>
      </form>
      {#if form?.renameError}<p class="error" role="alert">{form.renameError}</p>{/if}
      <p class="muted small">
        Renaming preserves this site's tracking script, registered origin, and history.
      </p>
    </details>
    {#if form?.renamed}<p role="status">Site name saved.</p>{/if}
    <section class="panel integration">
      <h2>Install tracker</h2>
      <p class="collection-status">
        {#if data.lastHit !== null}Latest stored pageview or event: <time
            datetime={new Date(data.lastHit).toISOString()}
            >{new Date(data.lastHit).toISOString().replace('T', ' ').slice(0, 19)} UTC</time
          >.{:else}No pageviews or events received yet. Add the snippet, open your site in a normal
          browser, then refresh this dashboard.{/if}
      </p>
      <p class="muted">
        Add this to your shared HTML template. Page loads and SPA path changes are tracked
        automatically. Repeat visits to the same page within five minutes are counted once.
      </p>
      <pre><code>{data.snippet}</code></pre>
      <button class="quiet" onclick={copySnippet}>{copied ? 'Copied' : 'Copy snippet'}</button>
      <p class="muted small">
        Custom events: <code>window.oddhouse?.event('signup')</code>. Only UTM campaign tags are
        kept from query strings; fragments are excluded.
      </p>
    </section>
  {:else}
    <div class="welcome">
      <p class="eyebrow">GET STARTED</p>
      <h1>No sites yet.</h1>
      <p class="muted">Add a site above, then copy its tracking script into your website.</p>
    </div>
  {/if}
  <footer>
    oddhouse · Five-minute repeat filtering · Known bots excluded · No tracking cookies
  </footer>
</main>
