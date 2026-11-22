import { z } from "@hono/zod-openapi";
import { decodeCanonicalBase64 } from "./base64";
import { isUsablePublicKey } from "./ed25519";

export function freePosition(size: number): number | null {
  return size % 2 === 1 ? (size * size - 1) / 2 : null;
}

export function itemCount(size: number): number {
  return size * size - (freePosition(size) === null ? 0 : 1);
}

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;
const FORBIDDEN_IN_TEXT = /[\p{Cc}\p{Co}\p{Cn}\u2028\u2029\u202A-\u202E\u2066-\u2069\u{E0000}-\u{E007F}]/u;
const BLANK_LOOKING = /[\u115F\u1160\u3164\uFFA0\u2800\uFFFC\u{1D159}]/gu;
/** The subdivision flags Unicode recommends (England, Scotland, Wales): the one use of tag characters let into text. */
const TAG_FLAG = /\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/gu;
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;
const TAG_CHARACTER = /[\u{E0000}-\u{E007F}]/u;
const EMOJI = /\p{Extended_Pictographic}|^\p{Regional_Indicator}{2}$|^[0-9#*]\uFE0F?\u20E3$/u;

/** The regex keeps out UTC offsets, which Intl accepts as time zones. */
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

function isUtcDateTime(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): boolean {
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s);
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s
  );
}

function matchesDateTime(pattern: RegExp, value: string): boolean {
  const match = pattern.exec(value);
  if (match === null) return false;
  const [y, mo, d, h, mi, s] = match.slice(1).map(Number);
  if (y === undefined || mo === undefined || d === undefined) return false;
  return isUtcDateTime(y, mo, d, h, mi, s);
}

function isOneEmoji(value: string): boolean {
  const graphemes = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)];
  return graphemes.length === 1 && EMOJI.test(value) && !TAG_CHARACTER.test(value.replace(TAG_FLAG, ""));
}

function isUsablePublicKeyText(text: string): boolean {
  const bytes = decodeCanonicalBase64(text, 32);
  return bytes !== null && isUsablePublicKey(bytes);
}

function line(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !FORBIDDEN_IN_TEXT.test(v.replace(TAG_FLAG, "")), "must be one line without control, private-use, unassigned, direction or tag characters outside the flags of England, Scotland and Wales")
    .refine((v) => VISIBLE.test(v.replace(BLANK_LOOKING, "")), "must contain a visible character")
    .refine((v) => v.isWellFormed(), "must be well-formed Unicode");
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
  .refine((v) => matchesDateTime(UTC_INSTANT, v), "must be a real date and time")
  .openapi({ description: "Instant in UTC, ISO 8601 with Z.", example: "2026-11-22T09:30:00.000Z" });

export const ParticipantId = Uuid.openapi("ParticipantId", {
  description: "Made by the device. Lowercase hyphenated UUID.",
});
export const CardId = Uuid.openapi("CardId");
export const ItemId = Uuid.openapi("ItemId");
export const BingoId = Uuid.openapi("BingoId");
export const PhotoId = Uuid.openapi("PhotoId");
export const NoteId = Uuid.openapi("NoteId", {
  description: "Made by the app for each note it sends, so a retry can be told from a new note.",
});

export const PublicKey = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .refine(isUsablePublicKeyText, "must be a canonical Ed25519 public key that is not of small order")
  .openapi("PublicKey", {
  description:
    "Ed25519 public key: the raw 32 bytes, standard base64 with padding, in its one canonical encoding. Keys of small order are refused.",
  example: "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
});

const LENGTH_NOTE =
  "One line without control, private-use, unassigned, direction-override or tag characters (tag characters are allowed only inside the flags of England, Scotland and Wales), with at least one visible letter, digit, punctuation or symbol; length is counted in Unicode code points after trimming.";
export const DisplayName = line(32).openapi("DisplayName", { description: LENGTH_NOTE, example: "みどり" });
export const CardTitle = line(40).openapi("CardTitle", { description: LENGTH_NOTE, example: "冬休みにやること" });
export const ItemTitle = line(40).openapi("ItemTitle", { description: LENGTH_NOTE, example: "初日の出を見る" });
export const Emoji = z
  .string()
  .max(32)
  .refine(isOneEmoji, "must be one emoji")
  .openapi("Emoji", {
    description:
      "One emoji: a single extended grapheme cluster holding an emoji. Tag characters are allowed only in the flags of England, Scotland and Wales.",
    example: "🌅",
  });
export const Comment = line(140).openapi("Comment", {
  description: `The one-line note of what was done. ${LENGTH_NOTE}`,
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
      .refine((v) => matchesDateTime(ISO_DATE, v), "must be a calendar date YYYY-MM-DD")
      .openapi({ description: "Last day of the card, in the creator's time zone.", example: "2026-12-31" }),
    timeZone: z
      .string()
      .refine(isIanaTimeZone, "must be an IANA time zone name")
      .openapi({ description: "IANA time zone name of the creator. Letter case is not significant; responses carry the spelling the server's time zone data resolves it to (`asia/tokyo` comes back as `Asia/Tokyo`).", example: "Asia/Tokyo" }),
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
    noteId: NoteId,
    stampedBy: ParticipantId,
    comment: Comment,
    stampedAt: Instant,
  })
  .openapi("Stamp", {
    description:
      "At most one per item. Made from a one-line note, never by picking an item. Editing the item keeps the stamp; any member can remove it.",
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
      "A completed line, kept as the items it held (FREE left out) and the time. It does not change when items, positions or the size change later.",
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
    "participant_conflict",
    "id_conflict",
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
    id: CardId.openapi({ description: "Made by the app, so a retry returns the card the first request made." }),
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

export const StampBody = z.object({ noteId: NoteId, comment: Comment }).openapi("StampBody");

export const StampResult = z
  .object({
    stamps: z.array(Stamp).openapi({
      description: "The stamps this note made: none when it fulfils no unstamped item, several when it fulfils several.",
    }),
    newBingos: z.array(Bingo).openapi({ description: "Bingos these stamps completed." }),
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
