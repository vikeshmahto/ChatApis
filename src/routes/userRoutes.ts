import { Router } from 'express';
import { HttpError } from '../errors/HttpError';
import { asyncHandler } from '../middleware/asyncHandler';
import { getUserChats } from '../services/chatService';

export function createUserRouter(listChats = getUserChats) {
  const userRoutes = Router();

// Get all chats that this user belongs to.
userRoutes.get('/:userId/chats', asyncHandler(async (request, response) => {
  const userId = request.params.userId;

  if (!userId) {
    throw new HttpError(400, 'userId is required');
  }

  const chats = await listChats(userId);
  response.json({
    chats: chats.map((chat) => ({
      chatId: chat.id,
      type: chat.type,
      name: chat.name,
      memberIds: chat.memberIds,
      createdAt: chat.createdAt,
    })),
  });
}));

  return userRoutes;
}

export const userRoutes = createUserRouter();