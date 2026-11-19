<script lang="ts">
  import { formatCompact, formatCount } from '#lib/report-format.js';
  let { grid, peak }: { grid: { day: string; hours: number[] }[]; peak: number } = $props();
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
</script>

<section class="panel">
  <h2>Weekday and hour</h2>
  <p class="muted small">Pageviews by UTC weekday and hour across the selected range.</p>
  <div class="heatmap-scroll">
    <table class="heatmap">
      <caption class="sr-only">Pageviews by UTC weekday (rows) and hour (columns)</caption>
      <thead
        ><tr
          ><th scope="col"><span class="sr-only">Weekday</span></th>{#each hours as hour}<th
              scope="col">{hour}</th
            >{/each}</tr
        ></thead
      >
      <tbody>
        {#each grid as row}<tr
            ><th scope="row">{row.day}</th>{#each row.hours as count, hour}<td
                style:background-color={count && peak
                  ? `rgb(170 170 170 / ${0.12 + (count / peak) * 0.75})`
                  : undefined}
                class:hot={peak > 0 && count / peak > 0.55}
                title={`${row.day} ${hours[hour]}:00 UTC: ${formatCount(count)} pageviews`}
                >{count ? formatCompact(count) : ''}<span class="sr-only">{count ? '' : '0'}</span
                ></td
              >{/each}</tr
          >{/each}
      </tbody>
    </table>
  </div>
</section>
