// Keep build stages sequential and worker pools small for 1 CPU / 1 GB VPS hosts.
const env = {
  ...process.env,
  // Build processes are short-lived: prefer memory savings over JIT throughput.
  BUN_JSC_useJIT: process.env.BUN_JSC_useJIT ?? '0',
  // Return unused allocator pages promptly instead of keeping them for reuse.
  MIMALLOC_PURGE_DELAY: process.env.MIMALLOC_PURGE_DELAY ?? '0',
  MIMALLOC_ALLOW_THP: process.env.MIMALLOC_ALLOW_THP ?? '0',
  ROLLDOWN_WORKER_THREADS: process.env.ROLLDOWN_WORKER_THREADS || '1',
  RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS || '1',
};

for (const args of [
  ['--smol', 'scripts/build-tracker.ts'],
  ['--smol', '--bun', 'node_modules/vite/bin/vite.js', 'build', '--configLoader', 'native'],
]) {
  const child = Bun.spawn([process.execPath, ...args], {
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}
