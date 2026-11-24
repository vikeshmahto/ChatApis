import { Router } from 'express';
import { HttpError } from '../errors/HttpError';
import { asyncHandler } from '../middleware/asyncHandler';
import { getUserChats } from '../services/chatService';

export const userRoutes = Router();

userRoutes.get('/:userId/chats', asyncHandler(async (request, response) => {
  const userId = request.params.userId;

  if (!userId) {
    throw new HttpError(400, 'userId is required');
  }

  const chats = await getUserChats(userId);
  response.json({
    chats: chats.map((chat) => ({
      chatId: chat.id,
      memberIds: [chat.userAId, chat.userBId],
      createdAt: chat.createdAt,
    })),
  });
}));