<script lang="ts">
  let {
    series,
    granularity,
  }: {
    series: { day: string; count: number }[];
    granularity: 'hour' | 'day' | 'week' | 'month';
  } = $props();
  const names = {
    hour: ['Hourly', 'Hour'],
    day: ['Daily', 'Date'],
    week: ['Weekly', 'Week starting'],
    month: ['Monthly', 'Month starting'],
  } as const;
  let [adjective, unit] = $derived(names[granularity]);
  const format = (value: number) => value.toLocaleString();
  let peak = $derived(Math.max(1, ...series.map((item) => item.count)));
  let total = $derived(series.reduce((sum, item) => sum + item.count, 0));
  const label = (date: string) => (granularity === 'hour' ? date.slice(11) : date);
</script>

<section class="panel chart-panel">
  <h2>Pageviews over time</h2>
  <p class="muted small">
    {adjective} counts · UTC{#if granularity === 'week' || granularity === 'month'}
      · Labels show each bucket's first date in range; edge buckets may be partial{/if}
  </p>
  <div
    class="chart"
    role="img"
    aria-label={`${adjective} pageviews from ${series[0]?.day} to ${series.at(-1)?.day} UTC. ${total} total.`}
  >
    {#each series as bucket}
      <div class="bar-slot" title={`${bucket.day} UTC: ${format(bucket.count)} pageviews`}>
        <div
          class="bar"
          style:height={`${(bucket.count / peak) * 100}%`}
          class:zero={bucket.count === 0}
        ></div>
      </div>
    {/each}
  </div>
  <div class="chart-labels">
    <span>{label(series[0]?.day || '')}</span><span>{label(series.at(-1)?.day || '')}</span>
  </div>
  <details>
    <summary>{adjective} counts</summary>
    <table>
      <thead><tr><th>{unit} (UTC)</th><th>Pageviews</th></tr></thead><tbody>
        {#each series as bucket}<tr><td>{bucket.day}</td><td>{format(bucket.count)}</td></tr>{/each}
      </tbody>
    </table>
  </details>
</section>
