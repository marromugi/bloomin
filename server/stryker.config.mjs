import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  coverageAnalysis: "perTest",
  mutate: ["src/**/*.ts", "!src/db/schema.ts"],
  reporters: ["clear-text", "progress"],
  cleanTempDir: "always",
  // Outside the project, by its real path: under macOS's /var symlink Vitest finds no tests.
  tempDirName: mkdtempSync(join(realpathSync(tmpdir()), "bloomin-stryker-")),
};
