// Times are Unix milliseconds. Ids are lowercase UUIDs.
// Not enforced here, checked by the handlers: an item's position is below size² and is not the FREE cell.
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    publicKey: text("public_key").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "participants_public_key_base64",
      sql`typeof(${t.publicKey}) = 'text' AND length(${t.publicKey}) = 44 AND ${t.publicKey} NOT GLOB '*[^A-Za-z0-9+/=]*'`,
    ),
  ],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    size: integer("size").notNull(),
    deadlineDate: text("deadline_date").notNull(),
    deadlineTimeZone: text("deadline_time_zone").notNull(),
    joinCode: text("join_code").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => participants.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("cards_size", sql`typeof(${t.size}) = 'integer' AND ${t.size} BETWEEN 3 AND 5`)],
);

export const cardMembers = sqliteTable(
  "card_members",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    joinedAt: integer("joined_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.participantId] }), index("card_members_by_participant").on(t.participantId)],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    emoji: text("emoji").notNull(),
  },
  (t) => [
    check("items_position", sql`typeof(${t.position}) = 'integer' AND ${t.position} BETWEEN 0 AND 24`),
    unique("items_cell").on(t.cardId, t.position),
    unique("items_id_card").on(t.id, t.cardId),
  ],
);

/** Every note sent, whether or not it stamped anything, so a retry with the same id is not judged again. */
export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    sentBy: text("sent_by")
      .notNull()
      .references(() => participants.id),
    comment: text("comment").notNull(),
    sentAt: integer("sent_at").notNull(),
  },
  (t) => [unique("notes_id_card").on(t.id, t.cardId)],
);

/** One stamp per item: the primary key makes the first insert win. Who stamped, the comment and the time are the note's. */
export const stamps = sqliteTable(
  "stamps",
  {
    itemId: text("item_id").primaryKey(),
    cardId: text("card_id").notNull(),
    noteId: text("note_id").notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.itemId, t.cardId], foreignColumns: [items.id, items.cardId] }).onDelete("cascade"),
    foreignKey({ columns: [t.noteId, t.cardId], foreignColumns: [notes.id, notes.cardId] }).onDelete("cascade"),
    index("stamps_by_card").on(t.cardId),
    index("stamps_by_note").on(t.noteId),
  ],
);

export const bingos = sqliteTable(
  "bingos",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    achievedAt: integer("achieved_at").notNull(),
  },
  (t) => [unique("bingos_id_card").on(t.id, t.cardId)],
);

/** A copy of each item as it was; item_id has no foreign key so the record outlives the item. */
export const bingoItems = sqliteTable(
  "bingo_items",
  {
    bingoId: text("bingo_id")
      .notNull()
      .references(() => bingos.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    itemId: text("item_id").notNull(),
    title: text("title").notNull(),
    emoji: text("emoji").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bingoId, t.ordinal] })],
);

export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id").notNull(),
    bingoId: text("bingo_id").notNull(),
    takenBy: text("taken_by")
      .notNull()
      .references(() => participants.id),
    takenAt: integer("taken_at").notNull(),
    uploadedAt: integer("uploaded_at").notNull(),
    contentType: text("content_type", { enum: ["image/jpeg", "image/heic"] }).notNull(),
    /** Key of the image in the R2 bucket bound as PHOTOS. */
    objectKey: text("object_key").notNull().unique(),
  },
  (t) => [
    foreignKey({ columns: [t.bingoId, t.cardId], foreignColumns: [bingos.id, bingos.cardId] }).onDelete("cascade"),
    check("photos_content_type", sql`${t.contentType} IN ('image/jpeg', 'image/heic')`),
    index("photos_by_bingo").on(t.bingoId),
  ],
);

/** Signatures of accepted requests other than GET, kept until the timestamp leaves the clock window, so each is accepted once. */
export const usedSignatures = sqliteTable(
  "used_signatures",
  {
    signature: text("signature").primaryKey(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [
    check("used_signatures_expires_at", sql`typeof(${t.expiresAt}) = 'integer'`),
    index("used_signatures_by_expiry").on(t.expiresAt),
  ],
);
