import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSignatureVectors } from "./signature-vectors";

const target = fileURLToPath(new URL("../test-vectors/signature.json", import.meta.url).href);
writeFileSync(target, `${JSON.stringify(await makeSignatureVectors(), null, 2)}\n`);
