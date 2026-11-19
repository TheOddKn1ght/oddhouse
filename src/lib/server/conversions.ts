import { and, asc, count, eq, gt, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { openDatabase } from './database';
import type { ReportPeriod } from './report-period';
import { funnels, goals, hits, journeys } from './schema';
import { hitFilter, journeyFilter, type Filters } from './hit-filters';
import { validPagePath } from './page-report';

type DB = ReturnType<typeof openDatabase>;
export type Step = { kind: 'path' | 'event'; value: string };
export const MAX_GOALS = 20;
export const MAX_FUNNELS = 10;
export const MAX_FUNNEL_STEPS = 5;

export function parseStep(kind: unknown, input: unknown): Step | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (kind === 'event') return /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? { kind, value } : null;
  if (kind !== 'path') return null;
  const path = value.endsWith('*') ? value.slice(0, -1) : value;
  return validPagePath(path) && !path.includes('*') ? { kind, value } : null;
}
export const stepLabel = (step: Step) =>
  step.kind === 'event' ? `Event ${step.value}` : `Page ${step.value}`;

// Prefix matching uses substr, not LIKE, so % and _ in paths stay literal.
function stepCondition(step: Step): SQL {
  if (step.kind === 'event') return and(eq(hits.kind, 'event'), eq(hits.event, step.value))!;
  if (!step.value.endsWith('*')) return and(eq(hits.kind, 'pageview'), eq(hits.path, step.value))!;
  const prefix = step.value.slice(0, -1);
  return and(
    eq(hits.kind, 'pageview'),
    sql`substr(${hits.path}, 1, ${prefix.length}) = ${prefix}`,
  )!;
}

// Linked journeys carry a pageview count; older journeys have no hit links.
function linkedJourneys(siteId: string, since: number, until: number, filters: Filters) {
  return and(
    eq(journeys.site_id, siteId),
    gte(journeys.started_at, since),
    lt(journeys.started_at, until),
    gt(journeys.pageviews, 0),
    journeyFilter(filters, journeys.id),
  )!;
}

function parseSteps(text: string): Step[] {
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return value.map((step) => parseStep(step?.kind, step?.value)).filter((step) => step !== null);
  } catch {
    return [];
  }
}
export function siteGoals(db: DB, siteId: string) {
  return db
    .select({ id: goals.id, name: goals.name, kind: goals.kind, value: goals.value })
    .from(goals)
    .where(eq(goals.site_id, siteId))
    .orderBy(asc(goals.created_at), asc(goals.name))
    .all();
}
export function siteFunnels(db: DB, siteId: string) {
  return db
    .select()
    .from(funnels)
    .where(eq(funnels.site_id, siteId))
    .orderBy(asc(funnels.created_at), asc(funnels.name))
    .all()
    .map((funnel) => ({ id: funnel.id, name: funnel.name, steps: parseSteps(funnel.steps) }));
}

function cleanName(input: unknown) {
  const name = typeof input === 'string' ? input.trim() : '';
  return name && name.length <= 100 ? name : null;
}
export function createGoal(
  db: DB,
  siteId: string,
  input: { name: unknown; kind: unknown; value: unknown },
) {
  const name = cleanName(input.name);
  if (!name) return { error: 'Enter a goal name of up to 100 characters.' };
  const step = parseStep(input.kind, input.value);
  if (!step)
    return {
      error:
        'Use an event name (letters, digits, _ . : -) or a page path starting with /, optionally ending in *.',
    };
  if (siteGoals(db, siteId).length >= MAX_GOALS)
    return { error: `A site can have up to ${MAX_GOALS} goals.` };
  db.insert(goals)
    .values({ id: crypto.randomUUID(), site_id: siteId, name, ...step, created_at: Date.now() })
    .run();
  return { error: null };
}
export function createFunnel(
  db: DB,
  siteId: string,
  name: unknown,
  rawSteps: { kind: unknown; value: unknown }[],
) {
  const cleaned = cleanName(name);
  if (!cleaned) return { error: 'Enter a funnel name of up to 100 characters.' };
  const filled = rawSteps.filter((step) => typeof step.value === 'string' && step.value.trim());
  const steps = filled.map((step) => parseStep(step.kind, step.value));
  if (steps.some((step) => step === null))
    return { error: 'Each step needs a valid event name or page path (optionally ending in *).' };
  if (steps.length < 2 || steps.length > MAX_FUNNEL_STEPS)
    return { error: `A funnel needs 2 to ${MAX_FUNNEL_STEPS} steps.` };
  if (siteFunnels(db, siteId).length >= MAX_FUNNELS)
    return { error: `A site can have up to ${MAX_FUNNELS} funnels.` };
  db.insert(funnels)
    .values({
      id: crypto.randomUUID(),
      site_id: siteId,
      name: cleaned,
      steps: JSON.stringify(steps),
      created_at: Date.now(),
    })
    .run();
  return { error: null };
}
export function deleteDefinition(db: DB, siteId: string, type: 'goal' | 'funnel', id: string) {
  const table = type === 'goal' ? goals : funnels;
  db.delete(table)
    .where(and(eq(table.id, id), eq(table.site_id, siteId)))
    .run();
}

export function goalReport(db: DB, siteId: string, period: ReportPeriod, filters: Filters = {}) {
  const linked = (since: number, until: number) =>
    db
      .select({ count: count() })
      .from(journeys)
      .where(linkedJourneys(siteId, since, until, filters))
      .get()!.count;
  const sessions = linked(period.since, period.until);
  const previousSessions = linked(period.previousSince, period.previousUntil);
  return siteGoals(db, siteId).map((goal) => {
    const condition = stepCondition(goal);
    const conversions = (since: number, until: number) =>
      db
        .select({ count: count() })
        .from(journeys)
        .where(
          and(
            linkedJourneys(siteId, since, until, filters),
            sql`exists (select 1 from ${hits} where ${hits.journey_id} = ${journeys.id} and ${condition})`,
          ),
        )
        .get()!.count;
    const completions = db
      .select({ count: count() })
      .from(hits)
      .where(
        and(
          eq(hits.site_id, siteId),
          gte(hits.created_at, period.since),
          lt(hits.created_at, period.until),
          condition,
          hitFilter(filters),
        ),
      )
      .get()!.count;
    const current = conversions(period.since, period.until);
    const previous = conversions(period.previousSince, period.previousUntil);
    return {
      ...goal,
      conversions: current,
      previous,
      completions,
      rate: sessions ? current / sessions : 0,
      previousRate: previousSessions ? previous / previousSessions : null,
    };
  });
}

// Each step takes the first matching hit after the previous step's hit, by insertion order.
export function funnelSteps(
  db: DB,
  siteId: string,
  period: Pick<ReportPeriod, 'since' | 'until'>,
  steps: Step[],
  filters: Filters = {},
) {
  if (!steps.length) return [];
  const scope = linkedJourneys(siteId, period.since, period.until, filters);
  const ctes = steps.map((step, index) => {
    const name = sql.raw(`step${index}`);
    if (index === 0)
      return sql`${name} as (select ${hits.journey_id} as journey, min(${hits.id}) as hit from ${hits} where ${hits.journey_id} in (select ${journeys.id} from ${journeys} where ${scope}) and ${stepCondition(step)} group by ${hits.journey_id})`;
    const previous = sql.raw(`step${index - 1}`);
    return sql`${name} as (select ${hits.journey_id} as journey, min(${hits.id}) as hit from ${hits} join ${previous} on ${hits.journey_id} = ${previous}.journey and ${hits.id} > ${previous}.hit where ${stepCondition(step)} group by ${hits.journey_id})`;
  });
  const counts = steps.map((_, index) => sql`(select count(*) from ${sql.raw(`step${index}`)})`);
  // Raw bun-sqlite queries return positional values.
  const row = db.values<number[]>(
    sql`with ${sql.join(ctes, sql`, `)} select ${sql.join(counts, sql`, `)}`,
  )[0];
  const reached = steps.map((_, index) => Number(row?.[index] ?? 0));
  return steps.map((step, index) => ({
    ...step,
    label: stepLabel(step),
    sessions: reached[index],
    ofFirst: reached[0] ? reached[index] / reached[0] : 0,
    fromPrevious: index === 0 ? 1 : reached[index - 1] ? reached[index] / reached[index - 1] : 0,
  }));
}
export function funnelReport(db: DB, siteId: string, period: ReportPeriod, filters: Filters = {}) {
  return siteFunnels(db, siteId).map((funnel) => ({
    ...funnel,
    steps: funnelSteps(db, siteId, period, funnel.steps, filters),
  }));
}
