<script lang="ts">
  import ViewChart from '#lib/components/ViewChart.svelte';
  import {
    comparison,
    formatCount as format,
    formatDuration as duration,
  } from '#lib/report-format.js';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  let query = $derived(
    new URLSearchParams({
      site: data.site.id,
      path: data.path,
      from: data.period.from,
      to: data.period.to,
    }),
  );
  let overview = $derived(
    `/?${new URLSearchParams({ site: data.site.id, from: data.period.from, to: data.period.to })}`,
  );
  let pages = $derived(
    `/reports/pages?${new URLSearchParams({ site: data.site.id, from: data.period.from, to: data.period.to })}`,
  );
</script>

<svelte:head><title>{data.path} · {data.site.name} · Oddhouse</title></svelte:head>
<header>
  <a class="brand" href="/">oddhouse<span class="dot">.</span></a>
  <span class="header-note">Web analytics</span>
  <form method="POST" action="/?/logout"><button class="quiet">Sign out</button></form>
</header>
<main>
  <nav class="detail-nav" aria-label="Page report navigation">
    <a href={overview}>← Overview</a><a href={pages}>All pages</a><a
      href={`/page/export?${query}`}
      download>Export page CSV</a
    >
  </nav>
  <div class="page-heading">
    <div>
      <p class="eyebrow">{data.site.name} · PAGE REPORT</p>
      <h1 class="page-path">{data.path}</h1>
      <p class="muted">{data.site.origin}</p>
    </div>
    <span class="period-note">UTC · {data.period.from} – {data.period.to}</span>
  </div>
  <form method="GET" class="filters explorer-filters panel">
    <input type="hidden" name="site" value={data.site.id} />
    <input type="hidden" name="path" value={data.path} />
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
    <button>Apply dates</button>
  </form>
  <section class="metrics" aria-label="Page totals">
    {#each [{ key: 'pageviews' as const, label: 'Pageviews' }, { key: 'events' as const, label: 'Events' }] as metric}<div
      >
        <p>{metric.label}</p>
        <strong>{format(data.report.totals[metric.key])}</strong>
        <p class="comparison">
          {comparison(data.report.totals[metric.key], data.report.previous[metric.key])}
          <span class="muted">vs {format(data.report.previous[metric.key])}</span>
        </p>
      </div>{/each}
  </section>
  <p class="muted small">
    Exact path · Compared with the preceding {data.period.days} UTC calendar {data.period.days === 1
      ? 'day'
      : 'days'}.{#if data.period.to === data.period.today}
      Today is still in progress.{/if}
  </p>
  <ViewChart series={data.report.chartSeries} granularity={data.report.granularity} />
  <section class="panel">
    <h2>Page engagement</h2>
    {#if data.report.engagement.samples}
      <div class="metrics">
        <div>
          <p>Tracked page loads</p>
          <strong>{format(data.report.engagement.samples)}</strong>
        </div>
        <div>
          <p>Total active time</p>
          <strong>{duration(data.report.engagement.activeMs)}</strong>
        </div>
        <div>
          <p>Average active time</p>
          <strong>{duration(data.report.engagement.averageMs)}</strong>
        </div>
        <div>
          <p>Average deepest scroll</p>
          <strong>{Math.round(data.report.engagement.averageScroll)}%</strong>
        </div>
        <div>
          <p>Deepest scroll</p>
          <strong>{data.report.engagement.deepestScroll}%</strong>
        </div>
      </div>
    {:else}<p class="empty">No tracked engagement samples for this page in this period.</p>{/if}
    <p class="muted small">
      Engagement uses tracked page loads, including zero-time samples. It is attributed to the date
      the page opened; later snapshots can update these totals. Tracked loads can differ from
      repeat-filtered pageviews.
    </p>
  </section>
  <p class="muted small">Breakdowns show the top 20 results for this exact page.</p>
  <div class="tables">
    {#each [{ title: 'Referrers', rows: data.report.referrers }, { title: 'Events', rows: data.report.events }, { title: 'Outbound clicks', rows: data.report.outbound }, { title: 'Downloads', rows: data.report.downloads }] as breakdown}
      <section class="panel">
        <h2>{breakdown.title}</h2>
        <table>
          <thead
            ><tr
              ><th>{breakdown.title === 'Events' ? 'Name' : 'Source / target'}</th><th>Count</th
              ></tr
            ></thead
          ><tbody>
            {#each breakdown.rows as row}<tr><td>{row.label}</td><td>{format(row.count)}</td></tr
              >{:else}<tr><td colspan="2" class="empty">No data in this period.</td></tr>{/each}
          </tbody>
        </table>
      </section>
    {/each}
  </div>
</main>
