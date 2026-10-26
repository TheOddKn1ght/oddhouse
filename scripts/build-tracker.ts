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
  await Bun.write(new URL('../static/tracker.js', import.meta.url), code);
  console.log(`Built tracker.js (${Buffer.byteLength(code)} bytes)`);
}
