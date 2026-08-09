# Vendored Kascov preflight snapshot

This workspace contains the minimum MIT-licensed Kascov source required to
build Studio's offline transaction preflight helper.

- Upstream repository: `https://github.com/Knitser/kascov`
- Upstream commit: `b64d6b4114df324f899783080371f26b619b19d0`
- Pinned rusty-kaspa commit: `98a4ccd8d200853787f227bd4536ac540cf34957`
- License: see `LICENSE`

The upstream repository was replaced on 2026-08-09 and the pinned commit was
no longer fetchable by a clean CI checkout. Studio therefore commits the
audited preflight module, its two required Kascov crates, fixtures, and the
Cargo lockfile. Runtime preflight remains pure local computation and does not
contact Kascov or a Kaspa node.

Studio's wrapper changes only the `Network` import, provides the stdin/stdout
CLI entry point, and gates the upstream database fixture refresher behind the
disabled `kascov-index-fixture` feature. The release binary does not include
that index-only fixture tool.
