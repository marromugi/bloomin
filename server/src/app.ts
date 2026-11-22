import { OpenAPIHono, type RouteConfig } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { Bindings } from "./env";
import { routes } from "./routes";
import type { ErrorBody } from "./schemas";
import type { z } from "@hono/zod-openapi";
import {
  CLOCK_SKEW_SECONDS,
  HEADER_PARTICIPANT_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  SIGNATURE_VERSION,
} from "./signature";

type AppEnv = { Bindings: Bindings };

function errorResponse(status: 400 | 501, code: z.infer<typeof ErrorBody>["error"]["code"], message: string): Response {
  const body: z.infer<typeof ErrorBody> = { error: { code, message } };
  return Response.json(body, { status });
}

export function createApp(): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        return errorResponse(400, "invalid_request", result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
      return undefined;
    },
  });

  app.onError((error) => {
    if (error instanceof HTTPException && (error.status === 400 || error.status === 415)) {
      return errorResponse(400, "invalid_request", error.message);
    }
    throw error;
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "participantId", {
    type: "apiKey",
    in: "header",
    name: HEADER_PARTICIPANT_ID,
    description: "The participant id the device made, lowercase UUID.",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "timestamp", {
    type: "apiKey",
    in: "header",
    name: HEADER_TIMESTAMP,
    description: `Unix time in whole seconds, decimal, no leading zeros. Refused when more than ${CLOCK_SKEW_SECONDS} seconds from the server's clock.`,
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "signature", {
    type: "apiKey",
    in: "header",
    name: HEADER_SIGNATURE,
    description: "Ed25519 signature of the signing string (see the API description): 64 bytes, standard base64 with padding.",
  });

  const notImplemented = () => errorResponse(501, "not_implemented", "Not implemented yet.");
  for (const route of routes) registerStub(app, route, notImplemented);

  return app;
}

function registerStub(app: OpenAPIHono<AppEnv>, route: RouteConfig, handler: () => Response): void {
  app.openapi(route, handler);
}

const API_DESCRIPTION = `API of bloomin: one bingo card shared by everyone who joins it.

## Signing requests

There is no login. A device makes an Ed25519 key pair and a participant id (lowercase UUID), keeps the private key in the keychain (synced with iCloud Keychain), and registers the public key with \`POST /v1/participants\`. Every request, registration included, carries three headers:

- \`${HEADER_PARTICIPANT_ID}\`: the participant id.
- \`${HEADER_TIMESTAMP}\`: Unix time in whole seconds, decimal.
- \`${HEADER_SIGNATURE}\`: the Ed25519 signature of the signing string below, standard base64 with padding.

The signing string is these five lines joined by a single \`\\n\` (LF), with no line break at the end, encoded as UTF-8:

\`\`\`
${SIGNATURE_VERSION}
<METHOD>
<path and query>
<timestamp>
<body SHA-256>
\`\`\`

- \`METHOD\`: the HTTP method exactly as sent; every method of this API is uppercase.
- \`path and query\`: the request path exactly as sent, percent-encoding as on the wire, followed by \`?\` and the query when the URL has one. No scheme, host or fragment.
- \`timestamp\`: the same text as the \`${HEADER_TIMESTAMP}\` header.
- \`body SHA-256\`: SHA-256 of the raw body bytes, 64 lowercase hex digits. A request without a body hashes zero bytes (\`e3b0c442…b855\`).

The signature is accepted only in its one canonical base64 encoding. The server refuses with 401 when the timestamp is more than ${CLOCK_SKEW_SECONDS} seconds from its clock, or when the signature does not verify with the participant's registered key (for registration, the key in the body, and the participant id header must equal the body \`id\`). A request that changes something (any method but GET) is accepted once: the server remembers its signature until the timestamp leaves the window and refuses the same signature again with 401. A GET may be sent again. To retry a change, sign it again with a new timestamp. Worked examples are in \`server/test-vectors/signature.json\`.

## Deadline

A card stores its last day and the creator's IANA time zone. It expires at 00:00 of the following day in that zone. After that it is read-only, except that photos can still be added and people can still join to look at it.

## Stamping

Items are never stamped by picking them from the card. The app sends a one-line note to \`POST /v1/cards/{cardId}/stamps\` and the server stamps the items the note fulfils, which may be none or several.

## Errors

Every error body is \`ErrorBody\`. A body that is not JSON where JSON is expected, or JSON that does not match the schema, gets 400 \`invalid_request\`.

## Joining

The QR code holds the Universal Link \`https://<host>/j/{joinCode}\`. The app reads the code from the link and calls \`POST /v1/joins\`.`;

export function openApiDocument(app: OpenAPIHono<AppEnv>) {
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "bloomin API", version: "1.0.0", description: API_DESCRIPTION },
    security: [{ participantId: [], timestamp: [], signature: [] }],
  });
}
