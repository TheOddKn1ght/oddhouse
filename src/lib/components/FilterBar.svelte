<script lang="ts">
  import { withFilter, withoutFilters } from '#lib/report-links.js';
  let {
    chips,
    params,
    journeyNote = false,
  }: {
    chips: { key: string; title: string; value: string; name: string }[];
    params: URLSearchParams;
    journeyNote?: boolean;
  } = $props();
</script>

{#if chips.length}
  <section class="filter-bar" aria-label="Active filters">
    <span class="muted small">Filtered by</span>
    {#each chips as chip}<a
        class="chip"
        href={`?${withFilter(params, chip.key, null)}`}
        title={`Remove ${chip.title.toLowerCase()} filter`}
        >{chip.title}: {chip.name}{#if chip.name !== chip.value && chip.value}<span class="muted">
            ({chip.value})</span
          >{/if}<span aria-hidden="true"> ×</span><span class="sr-only"> (remove)</span></a
      >{/each}
    <a class="small" href={`?${withoutFilters(params)}`}>Clear filters</a>
    {#if journeyNote}<p class="muted small">
        Session, entry, exit, quality, goal and funnel figures count sessions with a matching
        pageview, recorded since session linking was added. Live activity is unfiltered.
      </p>{/if}
  </section>
{/if}
