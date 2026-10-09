# warpdom

A DOM for unit and component tests that **loads almost instantly and behaves
like jsdom**: a drop-in Vitest and Jest environment.

Status: early development, private. See `PLAN.md` for status and decisions and
`docs/design.md` for the architecture and the first milestone.

```sh
npm test            # unit tests (node:test)
npm run bench:load  # cold load and window creation time
```
