import { z } from "@hono/zod-openapi";

export function freePosition(size: number): number | null {
  return size % 2 === 1 ? (size * size - 1) / 2 : null;
}

export function itemCount(size: number): number {
  return size * size - (freePosition(size) === null ? 0 : 1);
}

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ED25519_PUBLIC_KEY_BASE64 = /^[A-Za-z0-9+/]{43}=$/;
const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isIanaTimeZone(name: string): boolean {
  if (!IANA_NAME.test(name)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [, y, m, d] = match.map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const Uuid = z
  .string()
  .regex(LOWERCASE_UUID)
  .openapi({
    description: "UUID in lowercase hyphenated form.",
    example: "3f2a1c9e-8b7d-4e6f-9a0b-1c2d3e4f5a6b",
  });

export const Instant = z
  .string()
  .regex(UTC_INSTANT)
  .openapi({ description: "Instant in UTC, ISO 8601 with Z.", example: "2026-11-22T09:30:00.000Z" });

export const ParticipantId = Uuid.openapi("ParticipantId", {
  description: "Made by the device. Lowercase hyphenated UUID.",
});
export const CardId = Uuid.openapi("CardId");
export const ItemId = Uuid.openapi("ItemId");
export const BingoId = Uuid.openapi("BingoId");
export const PhotoId = Uuid.openapi("PhotoId");

export const PublicKey = z.string().regex(ED25519_PUBLIC_KEY_BASE64).openapi("PublicKey", {
  description: "Ed25519 public key: the raw 32 bytes, standard base64 with padding.",
  example: "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
});

export const DisplayName = z.string().trim().min(1).max(32).openapi("DisplayName", { example: "みどり" });
export const CardTitle = z.string().trim().min(1).max(40).openapi("CardTitle", { example: "冬休みにやること" });
export const ItemTitle = z.string().trim().min(1).max(40).openapi("ItemTitle", { example: "初日の出を見る" });
export const Emoji = z.string().min(1).max(16).openapi("Emoji", {
  description: "One emoji, as one extended grapheme cluster.",
  example: "🌅",
});
export const Comment = z.string().trim().min(1).max(140).openapi("Comment", {
  description: "The one-line note of what was done.",
  example: "海で見た！",
});

export const Size = z
  .int()
  .min(3)
  .max(5)
  .openapi("Size", { description: "The card is size × size. Odd sizes have a FREE cell in the middle." });

export const Position = z
  .int()
  .min(0)
  .max(24)
  .openapi("Position", {
    description: "Cell index, row-major from the top left: 0 … size²−1.",
  });

export const JoinCode = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{10}$/)
  .openapi("JoinCode", {
    description:
      "10 characters of Crockford base32 (uppercase). The QR holds the Universal Link https://<host>/j/{joinCode}. Rotating the code makes old QR codes stop working.",
    example: "7K3M9QX2HD",
  });

export const Deadline = z
  .object({
    date: z
      .string()
      .regex(ISO_DATE)
      .refine(isCalendarDate, "must be a calendar date YYYY-MM-DD")
      .openapi({ description: "Last day of the card, in the creator's time zone.", example: "2026-12-31" }),
    timeZone: z
      .string()
      .refine(isIanaTimeZone, "must be an IANA time zone name")
      .openapi({ description: "IANA time zone name of the creator.", example: "Asia/Tokyo" }),
  })
  .openapi("Deadline", {
    description:
      "The card expires at the first instant on or after 00:00 of the day after `date`, in `timeZone`. The server decides this on every request.",
  });

export const Participant = z
  .object({
    id: ParticipantId,
    displayName: DisplayName,
    createdAt: Instant,
  })
  .openapi("Participant");

export const Member = z
  .object({
    participantId: ParticipantId,
    displayName: DisplayName,
    joinedAt: Instant,
  })
  .openapi("Member");

export const Item = z
  .object({
    id: ItemId,
    position: Position,
    title: ItemTitle,
    emoji: Emoji,
  })
  .openapi("Item", { description: "One cell. The FREE cell has no item." });

export const Stamp = z
  .object({
    itemId: ItemId,
    stampedBy: ParticipantId,
    comment: Comment,
    stampedAt: Instant,
  })
  .openapi("Stamp", {
    description: "At most one per item. Editing the item keeps the stamp; any member can remove it.",
  });

export const BingoItem = z
  .object({
    itemId: ItemId,
    title: ItemTitle,
    emoji: Emoji,
  })
  .openapi("BingoItem", { description: "The item as it was when the bingo was made." });

export const Bingo = z
  .object({
    id: BingoId,
    achievedAt: Instant,
    items: z.array(BingoItem),
  })
  .openapi("Bingo", {
    description:
      "A completed line, kept as the items it held (FREE left out) and the time. It does not change when items, positions or the size change later, nor when a stamp is removed. The same set of items makes a bingo only once.",
  });

export const PhotoContentType = z.enum(["image/jpeg", "image/heic"]).openapi("PhotoContentType");

export const Photo = z
  .object({
    id: PhotoId,
    bingoId: BingoId,
    takenBy: ParticipantId,
    takenAt: Instant,
    uploadedAt: Instant,
    contentType: PhotoContentType,
  })
  .openapi("Photo", { description: "The image itself is read from GET /v1/cards/{cardId}/photos/{photoId}." });

const cardFields = {
  id: CardId,
  title: CardTitle,
  size: Size,
  freePosition: z
    .int()
    .min(0)
    .max(24)
    .nullable()
    .openapi({ description: "Position of the FREE cell: the middle for odd sizes, null for size 4." }),
  deadline: Deadline,
  expiresAt: Instant,
  isExpired: z.boolean().openapi({ description: "After expiry the card is read-only, except adding photos." }),
  createdBy: ParticipantId,
  createdAt: Instant,
};

export const CardSummary = z.object(cardFields).openapi("CardSummary");

export const Card = z
  .object({
    ...cardFields,
    joinCode: JoinCode,
    items: z.array(Item),
    stamps: z.array(Stamp),
    bingos: z.array(Bingo),
    photos: z.array(Photo),
    members: z.array(Member),
  })
  .openapi("Card", { description: "Every member sees the same card and the same layout." });

export const ErrorCode = z
  .enum([
    "invalid_request",
    "unauthorized",
    "not_found",
    "card_expired",
    "already_stamped",
    "participant_conflict",
    "payload_too_large",
    "not_implemented",
  ])
  .openapi("ErrorCode");

export const ErrorBody = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
    }),
  })
  .openapi("ErrorBody");

export const RegisterParticipantBody = z
  .object({
    id: ParticipantId,
    publicKey: PublicKey,
    displayName: DisplayName,
  })
  .openapi("RegisterParticipantBody");

export const UpdateParticipantBody = z.object({ displayName: DisplayName }).openapi("UpdateParticipantBody");

const NewItem = z.object({ position: Position, title: ItemTitle, emoji: Emoji }).openapi("NewItem");

export const CreateCardBody = z
  .object({
    title: CardTitle,
    size: Size,
    deadline: Deadline,
    items: z.array(NewItem).openapi({
      description: "One item for every position except the FREE cell.",
    }),
  })
  .superRefine((body, ctx) => {
    const free = freePosition(body.size);
    const expected = new Set<number>();
    for (let p = 0; p < body.size * body.size; p++) if (p !== free) expected.add(p);
    const seen = new Set<number>();
    for (const item of body.items) {
      if (!expected.has(item.position) || seen.has(item.position)) {
        ctx.addIssue({ code: "custom", path: ["items"], message: `position ${item.position} is not an open cell or is repeated` });
      }
      seen.add(item.position);
    }
    if (seen.size !== expected.size) {
      ctx.addIssue({ code: "custom", path: ["items"], message: `needs exactly ${expected.size} items` });
    }
  })
  .openapi("CreateCardBody");

export const UpdateCardBody = z
  .object({ title: CardTitle.optional(), deadline: Deadline.optional() })
  .refine((b) => b.title !== undefined || b.deadline !== undefined, "set title or deadline")
  .openapi("UpdateCardBody");

export const UpdateItemBody = z
  .object({ title: ItemTitle.optional(), emoji: Emoji.optional() })
  .refine((b) => b.title !== undefined || b.emoji !== undefined, "set title or emoji")
  .openapi("UpdateItemBody");

const ResizeItem = z
  .object({
    id: ItemId.optional().openapi({ description: "An existing item to keep, with its stamp. Omit for a new item." }),
    title: ItemTitle,
    emoji: Emoji,
  })
  .openapi("ResizeItem");

export const ResizeCardBody = z
  .object({
    size: Size,
    items: z.array(ResizeItem).openapi({
      description:
        "Every item of the resized card. Existing items left out are deleted with their stamps. The server places the items at random.",
    }),
  })
  .superRefine((body, ctx) => {
    const count = itemCount(body.size);
    if (body.items.length !== count) {
      ctx.addIssue({ code: "custom", path: ["items"], message: `needs exactly ${count} items` });
    }
    const ids = body.items.flatMap((i) => (i.id === undefined ? [] : [i.id]));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "an item id is repeated" });
    }
  })
  .openapi("ResizeCardBody");

export const StampBody = z.object({ comment: Comment }).openapi("StampBody");

export const StampResult = z
  .object({
    stamp: Stamp,
    newBingos: z.array(Bingo).openapi({ description: "Bingos this stamp completed." }),
  })
  .openapi("StampResult");

export const JoinBody = z.object({ joinCode: JoinCode }).openapi("JoinBody");

export const JoinCodeResult = z.object({ joinCode: JoinCode }).openapi("JoinCodeResult");

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export const PhotoUploadQuery = z.object({
  takenAt: Instant.openapi({
    param: { name: "takenAt", in: "query" },
    description: "When the photo was taken, in UTC with Z.",
  }),
});
