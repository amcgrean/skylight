# CLAUDE.md: Family Hub

Family manager app (iPhone first, shared screen later). **Read `README.md` first**: it covers the demo mode, the EAS build, the Supabase setup and the project layout. This file holds only the working rules.

## Shared rules (2026-11-10)

These hold in every repo Aaron owns. The maintained copy is `docs/mission-control/SHARED_RULES.md` in his private `agility-ai` repo (sections 1 and 3); the list below is repeated here because that repo is not always readable from a session in this one. If a rule conflicts with the rest of this file, this file wins for this repo.

1. No em-dashes, anywhere: docs, comments, commit messages, PR text, UI copy and chat replies. Use a spaced hyphen, a colon, a comma or two sentences.
2. Branch first. Do not push or open a PR unless Aaron asked for it in this session.
3. Surgical diffs over rewrites. Change the lines the task needs.
4. Write docs to be read cold: what, why, the date, and where the detail lives.
5. No secrets in git: no `.env` files, tokens or connection strings.
6. Take a position. Propose the concrete action and do it; ask only when a wrong guess is expensive or cannot be undone.
7. No Beisser data, credentials or code in this repo. It gets its own database project, never the Beisser one.
8. Personal use is the default: nothing is published, submitted to a store or shared unless Aaron says so for this project.
9. Smallest usable slice first. Ship the slice, then widen it.
10. When this project starts, ships, parks or dies, tell Aaron so its row in the Mission Control registry (`docs/mission-control/REGISTRY.md` in `agility-ai`) gets updated.
