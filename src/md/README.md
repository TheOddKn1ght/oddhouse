# Oddhouse intent

Oddhouse answers a site owner's traffic questions on a small self-hosted server.
Keep the interface minimal and factual. Counts describe collected activity;
they must not imply unique people, complete delivery, or exact bot detection.

This directory follows [src/md](https://srcmd.org/). It records why the code has
its shape and the constraints future changes must preserve. It is a developer
entry point, not a replacement for the setup instructions in the root README.
Update the relevant intent when a feature's behavior changes.

## File Index

- [features/reporting.md](features/reporting.md): UTC ranges, comparisons, session meaning, and export decisions.
- [features/sites.md](features/sites.md): site identity, renaming, and tracker collection status.
- [features/collection.md](features/collection.md): privacy boundaries, repeat filtering, campaign attribution, and engagement.
- [api/access.md](api/access.md): private reports, public collection, and admin session intent.
- [infrastructure/storage.md](infrastructure/storage.md): durable and transient data, migrations, backup, and constrained builds.
