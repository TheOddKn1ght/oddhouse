<script lang="ts">
  type Step = { kind: 'path' | 'event'; value: string };
  let {
    siteId,
    query,
    retention,
    retentionOptions,
    goals,
    funnels,
    maxSteps,
    open = false,
  }: {
    siteId: string;
    query: URLSearchParams;
    retention: number | null;
    retentionOptions: readonly number[];
    goals: { id: string; name: string; kind: 'path' | 'event'; value: string }[];
    funnels: { id: string; name: string; steps: (Step & { label: string })[] }[];
    maxSteps: number;
    open?: boolean;
  } = $props();
  const action = (name: string) => `?/${name}&${query}`;
</script>

<details class="panel site-settings" {open}>
  <summary>Retention, goals and funnels</summary>
  <h3>Data retention</h3>
  <form method="POST" action={action('setRetention')} class="site-form">
    <input type="hidden" name="id" value={siteId} />
    <label
      >Keep analytics for<select
        name="retention"
        value={retention === null ? '' : String(retention)}
        ><option value="">Forever</option>{#each retentionOptions as days}<option
            value={String(days)}>{days} days</option
          >{/each}</select
      ></label
    >
    <button>Save retention</button>
  </form>
  <p class="muted small">
    Hits, sessions and engagement older than the period are permanently deleted, hourly and on save.
    Existing backups keep their copies.
  </p>

  <h3>Goals</h3>
  <form method="POST" action={action('createGoal')} class="site-form">
    <input type="hidden" name="id" value={siteId} />
    <label>Name<input name="name" maxlength="100" placeholder="Signed up" required /></label>
    <label
      >Type<select name="kind"
        ><option value="event">Event name</option><option value="path">Page path</option></select
      ></label
    >
    <label
      >Match<input name="value" maxlength="2048" placeholder="signup or /thanks" required /></label
    >
    <button>Add goal</button>
  </form>
  {#if goals.length}<ul class="definitions">
      {#each goals as goal}<li>
          <span>{goal.name} <span class="muted small">· {goal.kind} {goal.value}</span></span>
          <form method="POST" action={action('deleteDefinition')}>
            <input type="hidden" name="id" value={siteId} /><input
              type="hidden"
              name="type"
              value="goal"
            /><input type="hidden" name="definition" value={goal.id} /><button class="quiet"
              >Delete<span class="sr-only"> goal {goal.name}</span></button
            >
          </form>
        </li>{/each}
    </ul>{/if}

  <h3>Funnels</h3>
  <form method="POST" action={action('createFunnel')} class="funnel-form">
    <input type="hidden" name="id" value={siteId} />
    <label>Name<input name="name" maxlength="100" placeholder="Checkout" required /></label>
    {#each Array.from({ length: maxSteps }, (_, index) => index) as index}
      <fieldset class="site-form">
        <legend class="small muted">Step {index + 1}{index < 2 ? '' : ' (optional)'}</legend>
        <label
          ><span class="sr-only">Step {index + 1} type</span><select name={`kind${index}`}
            ><option value="path">Page path</option><option value="event">Event name</option
            ></select
          ></label
        >
        <label
          ><span class="sr-only">Step {index + 1} match</span><input
            name={`value${index}`}
            maxlength="2048"
            placeholder={index === 0 ? '/pricing' : index === 1 ? '/checkout/*' : ''}
            required={index < 2}
          /></label
        >
      </fieldset>
    {/each}
    <button>Add funnel</button>
  </form>
  {#if funnels.length}<ul class="definitions">
      {#each funnels as funnel}<li>
          <span
            >{funnel.name}
            <span class="muted small">· {funnel.steps.map((step) => step.label).join(' → ')}</span
            ></span
          >
          <form method="POST" action={action('deleteDefinition')}>
            <input type="hidden" name="id" value={siteId} /><input
              type="hidden"
              name="type"
              value="funnel"
            /><input type="hidden" name="definition" value={funnel.id} /><button class="quiet"
              >Delete<span class="sr-only"> funnel {funnel.name}</span></button
            >
          </form>
        </li>{/each}
    </ul>{/if}
  <p class="muted small">
    Paths are exact; end with * for a prefix, such as /blog/*. Event names are exact. Reports
    recalculate from stored data when definitions change, using sessions recorded since session
    linking was added.
  </p>
</details>
