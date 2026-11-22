import { expect, it } from "vitest";
import committed from "../openapi.json";
import { createApp, openApiDocument } from "../src/app";

it("openapi.json matches the document the routes generate (run `pnpm openapi` to update it)", () => {
  const generated: unknown = JSON.parse(JSON.stringify(openApiDocument(createApp())));
  expect(generated).toStrictEqual(committed);
});
