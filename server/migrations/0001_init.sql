-- Times are Unix milliseconds. Ids are lowercase UUIDs.

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  public_key BLOB NOT NULL CHECK (length(public_key) = 32),
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size BETWEEN 3 AND 5),
  deadline_date TEXT NOT NULL,
  deadline_time_zone TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES participants (id),
  created_at INTEGER NOT NULL
);

CREATE TABLE card_members (
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants (id),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (card_id, participant_id)
);
CREATE INDEX card_members_by_participant ON card_members (participant_id);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 24),
  title TEXT NOT NULL,
  emoji TEXT NOT NULL,
  UNIQUE (card_id, position)
);

-- One stamp per item: the primary key makes the first insert win.
CREATE TABLE stamps (
  item_id TEXT PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  stamped_by TEXT NOT NULL REFERENCES participants (id),
  comment TEXT NOT NULL,
  stamped_at INTEGER NOT NULL
);
CREATE INDEX stamps_by_card ON stamps (card_id);

-- item_ids_key: the line's item ids, sorted and joined by ",". A set of items makes a bingo once.
CREATE TABLE bingos (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  item_ids_key TEXT NOT NULL,
  achieved_at INTEGER NOT NULL,
  UNIQUE (card_id, item_ids_key)
);

-- A copy of each item as it was; item_id has no foreign key so the record outlives the item.
CREATE TABLE bingo_items (
  bingo_id TEXT NOT NULL REFERENCES bingos (id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY (bingo_id, ordinal)
);

-- object_key: the key of the image in the R2 bucket bound as PHOTOS.
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  bingo_id TEXT NOT NULL REFERENCES bingos (id) ON DELETE CASCADE,
  taken_by TEXT NOT NULL REFERENCES participants (id),
  taken_at INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/heic')),
  object_key TEXT NOT NULL UNIQUE
);
CREATE INDEX photos_by_bingo ON photos (bingo_id);
