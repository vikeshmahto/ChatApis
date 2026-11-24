import { database } from '../config/database';
import { HttpError } from '../errors/HttpError';

export interface Chat {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: Date;
}

interface ChatRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: Date;
}

function toChat(row: ChatRow): Chat {
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    createdAt: row.created_at,
  };
}

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
      `INSERT INTO chats (user_a_id, user_b_id)
       VALUES ($1, $2)
       ON CONFLICT (user_a_id, user_b_id) DO NOTHING
       RETURNING id, user_a_id, user_b_id, created_at`,
      [firstUserId, secondUserId],
    );

    const chatResult = result.rowCount
      ? result
      : await client.query<ChatRow>(
        `SELECT id, user_a_id, user_b_id, created_at
         FROM chats WHERE user_a_id = $1 AND user_b_id = $2`,
        [firstUserId, secondUserId],
      );

    await client.query('COMMIT');

    if (!chatResult.rows[0]) {
      throw new Error('Could not create or find the chat');
    }

    return toChat(chatResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getChat(chatId: string): Promise<Chat> {
  const result = await database.query<ChatRow>(
    `SELECT id, user_a_id, user_b_id, created_at FROM chats WHERE id = $1`,
    [chatId],
  );

  if (!result.rows[0]) {
    throw new HttpError(404, 'Chat not found');
  }

  return toChat(result.rows[0]);
}

export async function getUserChats(userId: string): Promise<Chat[]> {
  const result = await database.query<ChatRow>(
    `SELECT id, user_a_id, user_b_id, created_at
     FROM chats
     WHERE user_a_id = $1 OR user_b_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map(toChat);
}

export function isChatMember(chat: Chat, userId: string): boolean {
  return chat.userAId === userId || chat.userBId === userId;
}