<script lang="ts">
  import { pageReportUrl } from '#lib/report-links.js';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  const format = (value: number) => value.toLocaleString();
  let base = $derived(
    new URLSearchParams({
      site: data.site.id,
      from: data.period.from,
      to: data.period.to,
      q: data.options.query,
      sort: data.options.sort,
    }),
  );
  const pageUrl = (page: number) => `?${base}&page=${page}`;
  let back = $derived(
    `/?${new URLSearchParams({ site: data.site.id, from: data.period.from, to: data.period.to })}`,
  );
  let download = $derived(`/reports/${data.dimension}/export?${base}`);
</script>

<svelte:head><title>{data.definition.title} · {data.site.name} · Oddhouse</title></svelte:head>
<header>
  <a class="brand" href="/">oddhouse<span class="dot">.</span></a>
  <span class="header-note">Web analytics</span>
  <form method="POST" action="/?/logout"><button class="quiet">Sign out</button></form>
</header>
<main>
  <p><a href={back}>← Back to overview</a></p>
  <div class="page-heading">
    <div>
      <p class="eyebrow">{data.site.name}</p>
      <h1>{data.definition.title}</h1>
    </div>
    <span class="period-note">UTC · {data.period.from} – {data.period.to}</span>
  </div>
  <form method="GET" class="filters explorer-filters" role="search">
    <input type="hidden" name="site" value={data.site.id} />
    <input type="hidden" name="from" value={data.period.from} />
    <input type="hidden" name="to" value={data.period.to} />
    <label class="date-filter"
      >Search {data.definition.label.toLowerCase()}<input
        type="search"
        name="q"
        value={data.options.query}
        maxlength="200"
        placeholder="Contains…"
      /></label
    >
    <label class="date-filter"
      >Sort<select name="sort" value={data.options.sort}
        ><option value="count">Most activity</option><option value="label">Alphabetical</option
        ></select
      ></label
    >
    <button>Search</button>
    {#if data.options.query}<a
        href={`?site=${encodeURIComponent(data.site.id)}&from=${data.period.from}&to=${data.period.to}`}
        >Clear search</a
      >{/if}
  </form>
  <div class="toolbar">
    <p class="muted" aria-live="polite">
      {format(data.report.totals.rows)} matching rows · {format(data.report.totals.count)}
      {data.definition.unit.toLowerCase()}
    </p>
    {#if data.report.totals.rows <= data.exportLimit}<a href={download} download
        >Export matching CSV</a
      >{:else}<span class="muted small">Narrow the search to 10,000 rows or fewer to export.</span
      >{/if}
  </div>
  <table>
    <thead><tr><th>{data.definition.label}</th><th>{data.definition.unit}</th></tr></thead>
    <tbody>
      {#each data.report.rows as row}<tr
          ><td
            >{#if data.dimension === 'pages'}<a
                href={pageReportUrl(data.site.id, row.label, data.period)}>{row.name}</a
              >{:else}{row.name}{/if}{#if row.name !== row.label}<span class="muted">
                ({row.label})</span
              >{/if}</td
          ><td>{format(row.count)}</td></tr
        >
      {:else}<tr
          ><td colspan="2" class="empty"
            >No matching activity. Try a different search or date range.</td
          ></tr
        >{/each}
    </tbody>
  </table>
  <nav class="pagination" aria-label="Report pages">
    {#if data.report.page > 1}<a href={pageUrl(data.report.page - 1)} rel="prev">← Previous</a>{/if}
    <span>Page {format(data.report.page)} of {format(data.report.pages)}</span>
    {#if data.report.page < data.report.pages}<a href={pageUrl(data.report.page + 1)} rel="next"
        >Next →</a
      >{/if}
  </nav>
  <p class="muted small">
    Search matches literal text in the stored {data.definition.label.toLowerCase()}. Country and
    language searches use codes. CSV includes every matching row, up to 10,000.
  </p>
</main>
