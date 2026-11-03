# Oddhouse agent guidance

## src/md intent notes

This project follows [src/md](https://srcmd.org/). Keep technical intent and
design decisions near the source in `src/md/`.

- Before changing behavior, read `src/md/README.md` and the relevant linked notes.
- When behavior or a design decision changes, update the relevant intent note
  first, then keep the implementation and appropriate tests consistent with it.
- Capture the purpose, tradeoffs, constraints, and tricky aspects. Keep notes
  concise and factual; avoid restating code or adding formal specifications,
  process documents, or temporary plans.
- Maintain `## File Index` in `src/md/README.md`: link every other intent file
  with a brief description, using paths relative to `src/md/`.
- Keep user setup and operational instructions in the root `README.md`.

## Implementation style

- Prefer ordinary string, URL, and date operations over regex when practical.
