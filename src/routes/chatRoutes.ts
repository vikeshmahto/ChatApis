import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  addChatMember,
  createGroupChat,
  createOrGetChat,
  getChat,
  isChatMember,
  removeChatMember,
} from '../services/chatService';
import {
  deleteMessage,
  editMessage,
  getMessages,
  markMessageRead,
  sendMessage,
  updateLastSeen,
} from '../services/messageService';
import { HttpError } from '../errors/HttpError';

type ChatOperations = Pick<
  typeof import('../services/chatService'),
  | 'addChatMember'
  | 'createGroupChat'
  | 'createOrGetChat'
  | 'getChat'
  | 'isChatMember'
  | 'removeChatMember'
>;
type MessageOperations = Pick<
  typeof import('../services/messageService'),
  | 'deleteMessage'
  | 'editMessage'
  | 'getMessages'
  | 'markMessageRead'
  | 'sendMessage'
  | 'updateLastSeen'
>;

export function createChatRouter(
  chats: ChatOperations = {
    addChatMember,
    createGroupChat,
    createOrGetChat,
    getChat,
    isChatMember,
    removeChatMember,
  },
  messages: MessageOperations = {
    deleteMessage,
    editMessage,
    getMessages,
    markMessageRead,
    sendMessage,
    updateLastSeen,
  },
) {
  const chatRoutes = Router();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function findChat(chatId: string) {
    if (!uuidPattern.test(chatId)) {
      throw new HttpError(400, 'chatId must be a valid UUID');
    }

    return chats.getChat(chatId);
  }

// Find this user's direct chat, or create it if needed.
chatRoutes.post('/create', asyncHandler(async (request, response) => {
  const { userAId, userBId } = request.body as { userAId?: string; userBId?: string };

  if (!userAId || !userBId) {
    throw new HttpError(400, 'userAId and userBId are required');
  }

  const chat = await chats.createOrGetChat(userAId, userBId);
  response.status(200).json({ chatId: chat.id });
}));

// Create a group and add its members.
chatRoutes.post('/group/create', asyncHandler(async (request, response) => {
  const { name, createdById, memberIds } = request.body as {
    name?: string;
    createdById?: string;
    memberIds?: unknown;
  };

  if (!name || !createdById || !Array.isArray(memberIds)
    || !memberIds.every((memberId) => typeof memberId === 'string' && memberId.trim())) {
    throw new HttpError(400, 'name, createdById, and a list of memberIds are required');
  }

  const chat = await chats.createGroupChat(name, createdById, memberIds);
  response.status(201).json({
    chatId: chat.id,
    name: chat.name,
    memberIds: chat.memberIds,
  });
}));

// Only the group creator can add members.
chatRoutes.post('/:chatId/members', asyncHandler(async (request, response) => {
  const { actorId, userId } = request.body as { actorId?: string; userId?: string };
  const chat = await findChat(request.params.chatId);

  if (chat.type !== 'group') {
    throw new HttpError(400, 'Members can only be managed in group chats');
  }
  if (!actorId || actorId !== chat.createdById) {
    throw new HttpError(403, 'Only the group creator can manage members');
  }
  if (!userId?.trim()) {
    throw new HttpError(400, 'userId is required');
  }
  if (chats.isChatMember(chat, userId)) {
    throw new HttpError(409, 'User is already a member');
  }

  await chats.addChatMember(chat.id, userId);
  response.status(201).json({ success: true });
}));

// Keep the creator and at least two people in the group.
chatRoutes.delete('/:chatId/members/:userId', asyncHandler(async (request, response) => {
  const actorId = request.body.actorId as string | undefined;
  const chat = await findChat(request.params.chatId);

  if (chat.type !== 'group') {
    throw new HttpError(400, 'Members can only be managed in group chats');
  }
  if (!actorId || actorId !== chat.createdById) {
    throw new HttpError(403, 'Only the group creator can manage members');
  }
  if (request.params.userId === chat.createdById) {
    throw new HttpError(400, 'The group creator cannot be removed');
  }
  if (!chats.isChatMember(chat, request.params.userId)) {
    throw new HttpError(404, 'User is not a member of this chat');
  }
  if (chat.memberIds.length <= 2) {
    throw new HttpError(400, 'A group chat must keep at least two members');
  }

  await chats.removeChatMember(chat.id, request.params.userId);
  response.json({ success: true });
}));

// Save a message only when its sender belongs to this chat.
chatRoutes.post('/:chatId/message/send', asyncHandler(async (request, response) => {
  const { senderId, text } = request.body as { senderId?: string; text?: string };
  const chat = await findChat(request.params.chatId);

  if (!senderId || !chats.isChatMember(chat, senderId)) {
    throw new HttpError(403, 'senderId must be a member of this chat');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) {
    throw new HttpError(400, 'text must contain 1 to 4000 characters');
  }

  const message = await messages.sendMessage(chat.id, senderId, text.trim());
  response.status(201).json(message);
}));

// Get messages with the oldest message first.
chatRoutes.get('/:chatId/messages', asyncHandler(async (request, response) => {
  const chat = await findChat(request.params.chatId);
  const requestedLimit = Number(request.query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;
  const chatMessages = await messages.getMessages(chat.id, limit);
  response.json({ messages: chatMessages.reverse() });
}));

// Save when this member read the message.
chatRoutes.post('/:chatId/message/:messageId/read', asyncHandler(async (request, response) => {
  const { userId } = request.body as { userId?: string };
  const chat = await findChat(request.params.chatId);

  if (!userId || !chats.isChatMember(chat, userId)) {
    throw new HttpError(403, 'userId must be a member of this chat');
  }

  await messages.markMessageRead(chat.id, request.params.messageId, userId);
  response.json({ success: true });
}));

// Edit a message; the service checks who sent it.
chatRoutes.patch('/:chatId/message/:messageId', asyncHandler(async (request, response) => {
  const { userId, text } = request.body as { userId?: string; text?: string };
  const chat = await findChat(request.params.chatId);

  if (!userId || !chats.isChatMember(chat, userId)) {
    throw new HttpError(403, 'userId must be a member of this chat');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) {
    throw new HttpError(400, 'text must contain 1 to 4000 characters');
  }

  await messages.editMessage(chat.id, request.params.messageId, userId, text.trim());
  response.json({ success: true });
}));

// Delete a message only when the user sent it.
chatRoutes.delete('/:chatId/message/:messageId', asyncHandler(async (request, response) => {
  const { userId } = request.body as { userId?: string };
  const chat = await findChat(request.params.chatId);

  if (!userId || !chats.isChatMember(chat, userId)) {
    throw new HttpError(403, 'userId must be a member of this chat');
  }

  await messages.deleteMessage(chat.id, request.params.messageId, userId);
  response.json({ success: true });
}));

// Save the last message this member has seen.
chatRoutes.post('/:chatId/lastseen', asyncHandler(async (request, response) => {
  const { userId, messageId } = request.body as { userId?: string; messageId?: string };
  const chat = await findChat(request.params.chatId);

  if (!userId || !chats.isChatMember(chat, userId)) {
    throw new HttpError(403, 'userId must be a member of this chat');
  }
  if (!messageId) {
    throw new HttpError(400, 'messageId is required');
  }

  await messages.updateLastSeen(chat.id, messageId, userId);
  response.json({ success: true });
}));

  return chatRoutes;
}

export const chatRoutes = createChatRouter();