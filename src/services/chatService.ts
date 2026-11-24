import { database } from '../config/database';
import { HttpError } from '../errors/HttpError';

export interface Chat {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: Date;
  type: 'direct' | 'group';
  name: string | null;
  createdById: string | null;
  memberIds: string[];
}

interface ChatRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: Date;
  chat_type: 'direct' | 'group';
  name: string | null;
  created_by: string | null;
  member_ids?: string[];
}

const chatColumns = 'id, user_a_id, user_b_id, created_at, chat_type, name, created_by';

function toChat(row: ChatRow): Chat {
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    createdAt: row.created_at,
    type: row.chat_type,
    name: row.name,
    createdById: row.created_by,
    memberIds: row.member_ids ?? [row.user_a_id, row.user_b_id],
  };
}

// Keep user order the same so we do not create duplicate direct chats.
export async function createOrGetChat(userAId: string, userBId: string): Promise<Chat> {
  if (userAId === userBId) {
    throw new HttpError(400, 'A chat needs two different users');
  }

  const [firstUserId, secondUserId] = [userAId, userBId].sort();
  const client = await database.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id) VALUES ($1), ($2) ON CONFLICT (id) DO NOTHING',
      [firstUserId, secondUserId],
    );

    const result = await client.query<ChatRow>(
      `INSERT INTO chats (user_a_id, user_b_id, chat_type)
       VALUES ($1, $2, 'direct')
       ON CONFLICT (user_a_id, user_b_id) WHERE chat_type = 'direct' DO NOTHING
       RETURNING ${chatColumns}`,
      [firstUserId, secondUserId],
    );

    const chatResult = result.rowCount
      ? result
      : await client.query<ChatRow>(
        `SELECT ${chatColumns}
         FROM chats WHERE user_a_id = $1 AND user_b_id = $2`,
        [firstUserId, secondUserId],
      );

    const chat = chatResult.rows[0];
    if (!chat) {
      throw new Error('Could not create or find the chat');
    }

    await client.query(
      `INSERT INTO chat_members (chat_id, user_id)
       VALUES ($1, $2), ($1, $3)
       ON CONFLICT (chat_id, user_id) DO NOTHING`,
      [chat.id, firstUserId, secondUserId],
    );
    await client.query('COMMIT');

    return toChat({ ...chat, member_ids: [firstUserId, secondUserId] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Save the group and all its members together.
export async function createGroupChat(
  name: string,
  createdById: string,
  requestedMemberIds: string[],
): Promise<Chat> {
  const creatorId = createdById.trim();
  const requestedIds = requestedMemberIds.map((memberId) => memberId.trim());
  const memberIds = [...new Set([...requestedIds, creatorId])].sort();
  const groupName = name.trim();

  if (!creatorId || requestedIds.some((memberId) => !memberId) || memberIds.length < 2) {
    throw new HttpError(400, 'A group chat needs at least two members');
  }
  if (!groupName || groupName.length > 100) {
    throw new HttpError(400, 'Group name must contain 1 to 100 characters');
  }

  const client = await database.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id) SELECT UNNEST($1::text[]) ON CONFLICT (id) DO NOTHING',
      [memberIds],
    );

    const result = await client.query<ChatRow>(
      `INSERT INTO chats (user_a_id, user_b_id, chat_type, name, created_by)
       VALUES ($1, $2, 'group', $3, $4)
       RETURNING ${chatColumns}`,
      [memberIds[0], memberIds[1], groupName, creatorId],
    );
    const chat = result.rows[0];

    if (!chat) {
      throw new Error('Could not create group chat');
    }

    await client.query(
      `INSERT INTO chat_members (chat_id, user_id)
       SELECT $1, UNNEST($2::text[])`,
      [chat.id, memberIds],
    );
    await client.query('COMMIT');

    return toChat({ ...chat, member_ids: memberIds });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Get chat details and the full list of its members.
export async function getChat(chatId: string): Promise<Chat> {
  const result = await database.query<ChatRow>(
    `SELECT ${chatColumns},
       ARRAY(SELECT user_id FROM chat_members WHERE chat_id = chats.id ORDER BY joined_at, user_id) AS member_ids
     FROM chats WHERE id = $1`,
    [chatId],
  );

  if (!result.rows[0]) {
    throw new HttpError(404, 'Chat not found');
  }

  return toChat(result.rows[0]);
}

// Get every direct or group chat that contains this user.
export async function getUserChats(userId: string): Promise<Chat[]> {
  const result = await database.query<ChatRow>(
    `SELECT ${chatColumns},
      ARRAY(SELECT user_id FROM chat_members WHERE chat_id = chats.id ORDER BY joined_at, user_id) AS member_ids
     FROM chats
     WHERE EXISTS (SELECT 1 FROM chat_members WHERE chat_id = chats.id AND user_id = $1)
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map(toChat);
}

// Check whether this user belongs to the chat.
export function isChatMember(chat: Chat, userId: string): boolean {
  return chat.memberIds.includes(userId);
}

// Create the user if needed, then add them to the chat.
export async function addChatMember(chatId: string, userId: string): Promise<void> {
  const client = await database.connect();

  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
    await client.query(
      `INSERT INTO chat_members (chat_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (chat_id, user_id) DO NOTHING`,
      [chatId, userId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Remove the user from the chat but keep the chat history.
export async function removeChatMember(chatId: string, userId: string): Promise<boolean> {
  const result = await database.query(
    'DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId],
  );

  return result.rowCount === 1;
}