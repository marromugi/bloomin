import { createRoute, z } from "@hono/zod-openapi";
import {
  BingoId,
  Card,
  CardId,
  CardSummary,
  CreateCardBody,
  ErrorBody,
  ItemId,
  Item,
  JoinBody,
  JoinCodeResult,
  Participant,
  Photo,
  PhotoId,
  PhotoUploadQuery,
  PHOTO_MAX_BYTES,
  RegisterParticipantBody,
  ResizeCardBody,
  StampBody,
  StampResult,
  UpdateItemBody,
  UpdateParticipantBody,
} from "./schemas";

function json<T extends z.ZodType>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } };
}

function error(description: string) {
  return json(ErrorBody, description);
}

function body<T extends z.ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } };
}

const common = {
  400: error("`invalid_request`: the body, path or query does not match the schema."),
  401: error(
    "`unauthorized`: a signature header is missing, the participant is unknown, the timestamp is more than 300 seconds from the server's clock, the signature does not verify, or a request other than GET reuses a signature already accepted.",
  ),
};

const onCard = {
  ...common,
  404: error("`not_found`: the card does not exist or the caller is not a member of it."),
};

const writesCard = {
  ...onCard,
  403: error("`card_expired`: the card is past its deadline and is read-only."),
};

const itemNotFound = error("`not_found`: the card or the item does not exist, or the caller is not a member of the card.");

const cardParams = z.object({ cardId: CardId.openapi({ param: { name: "cardId", in: "path" } }) });
const itemParams = cardParams.extend({ itemId: ItemId.openapi({ param: { name: "itemId", in: "path" } }) });
const bingoParams = cardParams.extend({ bingoId: BingoId.openapi({ param: { name: "bingoId", in: "path" } }) });
const photoParams = cardParams.extend({ photoId: PhotoId.openapi({ param: { name: "photoId", in: "path" } }) });
const newPhotoParams = bingoParams.extend({ photoId: PhotoId.openapi({ param: { name: "photoId", in: "path" } }) });

export const registerParticipant = createRoute({
  operationId: "registerParticipant",
  tags: ["participants"],
  method: "post",
  path: "/v1/participants",
  summary: "Register this device's participant",
  description:
    "No login. Signed like every other request, with two differences: the `Bloomin-Participant-Id` header must equal the `id` in the body, and the signature is checked with the public key in the body, so the participant need not exist yet. Registering again with the same id and key returns the existing participant.",
  request: { body: body(RegisterParticipantBody) },
  responses: {
    201: json(Participant, "Registered."),
    200: json(Participant, "Already registered with the same key."),
    ...common,
    401: error(
      "`unauthorized`: a signature header is missing, the participant id header differs from the body `id`, the timestamp is more than 300 seconds from the server's clock, the signature does not verify with the key in the body, or the signature was already accepted.",
    ),
    409: error("`participant_conflict`: the id is registered with a different key."),
  },
});

export const getMe = createRoute({
  operationId: "getMe",
  tags: ["participants"],
  method: "get",
  path: "/v1/participants/me",
  summary: "The calling participant",
  responses: { 200: json(Participant, "The participant."), ...common },
});

export const updateMe = createRoute({
  operationId: "updateMe",
  tags: ["participants"],
  method: "patch",
  path: "/v1/participants/me",
  summary: "Change the display name",
  request: { body: body(UpdateParticipantBody) },
  responses: { 200: json(Participant, "Updated."), ...common },
});

export const listCards = createRoute({
  operationId: "listCards",
  tags: ["cards"],
  method: "get",
  path: "/v1/cards",
  summary: "Cards the caller is a member of",
  responses: {
    200: json(z.object({ cards: z.array(CardSummary) }), "Newest first."),
    ...common,
  },
});

export const createCard = createRoute({
  operationId: "createCard",
  tags: ["cards"],
  method: "post",
  path: "/v1/cards",
  summary: "Create a card",
  description:
    "The caller becomes its creator and first member. The server makes the join code. Sending the same `id` again returns the card the first request made.",
  request: { body: body(CreateCardBody) },
  responses: {
    201: json(Card, "Created."),
    200: json(Card, "This caller already created a card with this id; nothing changed."),
    ...common,
    409: error("`id_conflict`: the id belongs to a card someone else created."),
  },
});

export const getCard = createRoute({
  operationId: "getCard",
  tags: ["cards"],
  method: "get",
  path: "/v1/cards/{cardId}",
  summary: "The whole card",
  description: "Allowed after the deadline.",
  request: { params: cardParams },
  responses: { 200: json(Card, "The card."), ...onCard },
});

export const resizeCard = createRoute({
  operationId: "resizeCard",
  tags: ["cards"],
  method: "put",
  path: "/v1/cards/{cardId}/size",
  summary: "Change the size",
  description:
    "Any member, also after the card has started. Every item is placed again at random. Bingo records stay as they are.",
  request: { params: cardParams, body: body(ResizeCardBody) },
  responses: {
    200: json(Card, "Resized."),
    ...writesCard,
    404: error("`not_found`: the card does not exist, the caller is not a member, or an item id is not on this card."),
  },
});

export const updateItem = createRoute({
  operationId: "updateItem",
  tags: ["items"],
  method: "patch",
  path: "/v1/cards/{cardId}/items/{itemId}",
  summary: "Edit an item",
  description: "Any member, also after the card has started. A stamp on the item stays.",
  request: { params: itemParams, body: body(UpdateItemBody) },
  responses: { 200: json(Item, "Updated."), ...writesCard, 404: itemNotFound },
});

export const stamp = createRoute({
  operationId: "stamp",
  tags: ["stamps"],
  method: "post",
  path: "/v1/cards/{cardId}/stamps",
  summary: "Stamp the items a one-line note fulfils",
  description:
    "Items are never stamped by picking them. The server judges from the note which unstamped items it fulfils (none, one or several), stamps each with who sent the note, the note and the time, then records any bingo they completed. An item already stamped keeps its stamp: when two notes fulfil one item, the first one to arrive stamps it. Sending the same `noteId` again returns the stamps that note made, with no new bingos, without judging it again.",
  request: { params: cardParams, body: body(StampBody) },
  responses: {
    200: json(StampResult, "Judged; `stamps` lists what was stamped."),
    ...writesCard,
    409: error("`id_conflict`: the noteId was sent before with another card or another comment."),
  },
});

export const unstampItem = createRoute({
  operationId: "unstampItem",
  tags: ["stamps"],
  method: "delete",
  path: "/v1/cards/{cardId}/items/{itemId}/stamp",
  summary: "Remove a stamp",
  description: "Any member, whoever stamped it.",
  request: { params: itemParams },
  responses: {
    204: { description: "Removed." },
    ...writesCard,
    404: error("`not_found`: the card or item does not exist, the caller is not a member, or the item has no stamp."),
  },
});

export const uploadPhoto = createRoute({
  operationId: "uploadPhoto",
  tags: ["photos"],
  method: "put",
  path: "/v1/cards/{cardId}/bingos/{bingoId}/photos/{photoId}",
  summary: "Add a photo to a bingo",
  description: `Allowed after the deadline. The body is the image bytes, at most ${PHOTO_MAX_BYTES} bytes; its SHA-256 is part of the signature like any body. Another content type or an empty body gets 400 \`invalid_request\`. The app makes \`photoId\`; sending the same one again returns the photo the first request stored.`,
  request: {
    params: newPhotoParams,
    query: PhotoUploadQuery,
    body: {
      required: true,
      content: {
        "image/jpeg": { schema: z.string().openapi({ format: "binary" }) },
        "image/heic": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
  },
  responses: {
    201: json(Photo, "Stored."),
    200: json(Photo, "This caller already stored a photo with this id for this bingo; nothing changed."),
    ...onCard,
    404: error("`not_found`: the card or the bingo does not exist, or the caller is not a member of the card."),
    409: error("`id_conflict`: the photoId belongs to another photo."),
    413: error("`payload_too_large`: the image is larger than the limit."),
  },
});

export const getPhoto = createRoute({
  operationId: "getPhoto",
  tags: ["photos"],
  method: "get",
  path: "/v1/cards/{cardId}/photos/{photoId}",
  summary: "The image of a photo",
  request: { params: photoParams },
  responses: {
    200: {
      description: "The image bytes, with the photo's content type.",
      content: {
        "image/jpeg": { schema: z.string().openapi({ format: "binary" }) },
        "image/heic": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    ...onCard,
    404: error("`not_found`: the card or the photo does not exist, or the caller is not a member of the card."),
  },
});

export const rotateJoinCode = createRoute({
  operationId: "rotateJoinCode",
  tags: ["joining"],
  method: "post",
  path: "/v1/cards/{cardId}/join-code",
  summary: "Make a new join code",
  description: "Any member. The old code, and every QR made from it, stops working.",
  request: { params: cardParams },
  responses: { 200: json(JoinCodeResult, "The new code."), ...writesCard },
});

export const joinCard = createRoute({
  operationId: "joinCard",
  tags: ["joining"],
  method: "post",
  path: "/v1/joins",
  summary: "Join a card with its join code",
  description:
    "Allowed after the deadline; the card is then read-only for the new member too. Joining a card the caller is already a member of returns it unchanged.",
  request: { body: body(JoinBody) },
  responses: {
    200: json(Card, "Joined."),
    ...common,
    404: error("`not_found`: no card has this join code."),
  },
});

export const routes = [
  registerParticipant,
  getMe,
  updateMe,
  listCards,
  createCard,
  getCard,
  resizeCard,
  updateItem,
  stamp,
  unstampItem,
  uploadPhoto,
  getPhoto,
  rotateJoinCode,
  joinCard,
] as const;
