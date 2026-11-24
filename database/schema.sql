CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id TEXT NOT NULL REFERENCES users(id),
  user_b_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chats_distinct_users CHECK (user_a_id <> user_b_id)
);

ALTER TABLE chats ADD COLUMN IF NOT EXISTS chat_type TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_unique_pair;

CREATE UNIQUE INDEX IF NOT EXISTS chats_unique_direct_pair_idx
  ON chats(user_a_id, user_b_id)
  WHERE chat_type = 'direct';

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

INSERT INTO chat_members (chat_id, user_id)
SELECT id, user_id
FROM chats
CROSS JOIN LATERAL UNNEST(ARRAY[user_a_id, user_b_id]) AS member(user_id)
ON CONFLICT (chat_id, user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS chats_user_a_id_idx ON chats(user_a_id);
CREATE INDEX IF NOT EXISTS chats_user_b_id_idx ON chats(user_b_id);
CREATE INDEX IF NOT EXISTS chat_members_user_id_idx ON chat_members(user_id);