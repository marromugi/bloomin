import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp, openApiDocument } from "../src/app";

const target = fileURLToPath(new URL("../openapi.json", import.meta.url).href);
writeFileSync(target, `${JSON.stringify(openApiDocument(createApp()), null, 2)}\n`);
