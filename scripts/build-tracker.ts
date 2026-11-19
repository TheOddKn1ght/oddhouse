import { fileURLToPath } from 'node:url';

export async function compileTracker(minify: boolean) {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL('../tracker/tracker.ts', import.meta.url))],
    target: 'browser',
    format: 'iife',
    minify,
    sourcemap: 'none',
  });
  if (!result.success) throw new AggregateError(result.logs, 'Tracker build failed');
  return result.outputs[0].text();
}

if (import.meta.main) {
  const code = await compileTracker(!Bun.argv.includes('--development'));
  // tracker.js is a legacy alias so embeds installed before the rename keep working.
  for (const name of ['oddhouse.js', 'tracker.js'])
    await Bun.write(new URL(`../static/${name}`, import.meta.url), code);
  console.log(`Built oddhouse.js (${Buffer.byteLength(code)} bytes)`);
}
