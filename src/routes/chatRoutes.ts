import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { createOrGetChat, getChat, isChatMember } from '../services/chatService';
import { getMessages, markMessageRead, sendMessage, updateLastSeen } from '../services/messageService';
import { HttpError } from '../errors/HttpError';

export const chatRoutes = Router();

chatRoutes.post('/create', asyncHandler(async (request, response) => {
  const { userAId, userBId } = request.body as { userAId?: string; userBId?: string };

  if (!userAId || !userBId) {
    throw new HttpError(400, 'userAId and userBId are required');
  }

  const chat = await createOrGetChat(userAId, userBId);
  response.status(200).json({ chatId: chat.id });
}));

chatRoutes.post('/:chatId/message/send', asyncHandler(async (request, response) => {
  const { senderId, text } = request.body as { senderId?: string; text?: string };
  const chat = await getChat(request.params.chatId);

  if (!senderId || !isChatMember(chat, senderId)) {
    throw new HttpError(403, 'senderId must be a member of this chat');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) {
    throw new HttpError(400, 'text must contain 1 to 4000 characters');
  }

  const message = await sendMessage(chat.id, senderId, text.trim());
  response.status(201).json(message);
}));

chatRoutes.get('/:chatId/messages', asyncHandler(async (request, response) => {
  const chat = await getChat(request.params.chatId);
  const requestedLimit = Number(request.query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;
  const messages = await getMessages(chat.id, limit);
  response.json({ messages: messages.reverse() });
}));

chatRoutes.post('/:chatId/message/:messageId/read', asyncHandler(async (request, response) => {
  const { userId } = request.body as { userId?: string };
  const chat = await getChat(request.params.chatId);

  if (!userId || !isChatMember(chat, userId)) {
    throw new HttpError(403, 'userId must be a member of this chat');
  }

  await markMessageRead(chat.id, request.params.messageId, userId);
  response.json({ success: true });
}));

chatRoutes.post('/:chatId/lastseen', asyncHandler(async (request, response) => {
  const { userId, messageId } = request.body as { userId?: string; messageId?: string };
  const chat = await getChat(request.params.chatId);

  if (!userId || !isChatMember(chat, userId)) {
    throw new HttpError(403, 'userId must be a member of this chat');
  }
  if (!messageId) {
    throw new HttpError(400, 'messageId is required');
  }

  await updateLastSeen(chat.id, messageId, userId);
  response.json({ success: true });
}));