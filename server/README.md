# server

The bloomin API on Cloudflare Workers (Hono, D1, R2).

- `openapi.json` is the API contract. It is generated from `src/routes.ts` and `src/schemas.ts`; after changing them run `pnpm openapi` and commit the result. CI fails when the two differ.
- `test-vectors/signature.json` holds worked examples of request signing; after changing `scripts/signature-vectors.ts` run `pnpm signature-vectors`, and a test fails when they differ. The signing rules are in the `info.description` of `openapi.json`.
- `migrations/` is the D1 schema.

```sh
pnpm install
pnpm test
```
