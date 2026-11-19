<script lang="ts">
  import {
    comparison,
    formatCount as format,
    formatPercent as percent,
  } from '#lib/report-format.js';
  type Goal = {
    id: string;
    name: string;
    kind: 'path' | 'event';
    value: string;
    conversions: number;
    previous: number;
    completions: number;
    rate: number;
    previousRate: number | null;
  };
  type Funnel = {
    id: string;
    name: string;
    steps: { label: string; sessions: number; ofFirst: number; fromPrevious: number }[];
  };
  let { goals, funnels }: { goals: Goal[]; funnels: Funnel[] } = $props();
</script>

<section class="panel">
  <h2>Goals</h2>
  <table class="wide-table">
    <thead><tr><th>Goal</th><th>Sessions</th><th>Rate</th><th>Completions</th></tr></thead>
    <tbody>
      {#each goals as goal}<tr
          ><td
            >{goal.name}<br /><span class="muted small"
              >{goal.kind === 'event' ? 'Event' : 'Page'}
              {goal.value} · {comparison(goal.conversions, goal.previous)} vs {format(
                goal.previous,
              )}</span
            ></td
          ><td>{format(goal.conversions)}</td><td
            >{percent(goal.rate)}<br /><span class="muted small"
              >vs {goal.previousRate === null ? '—' : percent(goal.previousRate)}</span
            ></td
          ><td>{format(goal.completions)}</td></tr
        >
      {:else}<tr
          ><td colspan="4" class="empty">No goals yet. Add one in site settings below.</td></tr
        >{/each}
    </tbody>
  </table>
  <p class="muted small">
    Sessions: linked sessions started in this period that reached the goal; the rate divides by all
    linked sessions. Completions count every matching pageview or event in the period, including
    older data.
  </p>
</section>
{#each funnels as funnel}
  <section class="panel">
    <h2>Funnel · {funnel.name}</h2>
    <table class="wide-table funnel">
      <thead><tr><th>Step</th><th>Sessions</th><th>Of first</th><th>From previous</th></tr></thead>
      <tbody>
        {#each funnel.steps as step, index}<tr
            ><td
              ><span class="muted">{index + 1}.</span>
              {step.label}
              <div class="funnel-bar" aria-hidden="true">
                <div style:width={`${step.ofFirst * 100}%`}></div>
              </div></td
            ><td>{format(step.sessions)}</td><td>{percent(step.ofFirst)}</td><td
              >{index === 0 ? '—' : percent(step.fromPrevious)}</td
            ></tr
          >{/each}
      </tbody>
    </table>
    <p class="muted small">
      Steps must happen in order within one linked session started in this period.
    </p>
  </section>
{/each}
