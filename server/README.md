# server

The bloomin API on Cloudflare Workers (Hono, D1, R2).

- `openapi.json` is the API contract. It is generated from `src/routes.ts` and `src/schemas.ts`; after changing them run `pnpm openapi` and commit the result. CI fails when the two differ.
- `test-vectors/signature.json` holds worked examples of request signing; after changing `scripts/signature-vectors.ts` run `pnpm signature-vectors`, and a test fails when they differ. The signing rules are in the `info.description` of `openapi.json`.
- `src/db/schema.ts` is the D1 schema, written with Drizzle. `migrations/` is generated from it by `pnpm db:generate` (drizzle-kit) and committed. `pnpm db:check` fails when a schema change has no migration, or when the committed migrations build a database whose table definitions (columns, collations, constraints, options), indexes, foreign keys, rows, triggers, views or `user_version` differ from what the schema generates; CI runs it.
- `pnpm mutate` runs StrykerJS (`stryker.config.mjs`) on `src/`, except `src/db/schema.ts`, which holds table definitions only. `pnpm mutate --mutate src/signature.ts:40-60` limits it to some lines. It shows which deliberate breaks no test catches. Run one at a time: on a busy machine some mutants no test catches show as `Timeout`, which Stryker counts as caught; run the lines of a `Timeout` again alone. Its reports and `--incremental` record go to `reports/`, which git ignores. CI does not run it.

```sh
pnpm install
pnpm test
```
