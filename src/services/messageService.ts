import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../config/firebase';
import { HttpError } from '../errors/HttpError';

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | null;
}

function validateDocumentId(value: string, label: string): void {
  if (!value || value.includes('/')) {
    throw new HttpError(400, `${label} is invalid`);
  }
}

function messagesCollection(chatId: string) {
  validateDocumentId(chatId, 'chatId');
  return firestore.collection('chats').doc(chatId).collection('messages');
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string,
): Promise<Message> {
  validateDocumentId(senderId, 'senderId');
  const message = await messagesCollection(chatId).add({
    senderId,
    text,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { id: message.id, senderId, text, createdAt: new Date().toISOString() };
}

export async function getMessages(chatId: string, limit: number): Promise<Message[]> {
  const result = await messagesCollection(chatId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return result.docs.map((document) => {
    const data = document.data();
    const createdAt = data.createdAt as Timestamp | undefined;

    return {
      id: document.id,
      senderId: data.senderId as string,
      text: data.text as string,
      createdAt: createdAt?.toDate().toISOString() ?? null,
    };
  });
}

export async function markMessageRead(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<void> {
  validateDocumentId(messageId, 'messageId');
  validateDocumentId(userId, 'userId');
  const message = messagesCollection(chatId).doc(messageId);
  const snapshot = await message.get();

  if (!snapshot.exists) {
    throw new HttpError(404, 'Message not found');
  }

  await message.collection('readReceipts').doc(userId).set({
    userId,
    readAt: FieldValue.serverTimestamp(),
  });
}

export async function updateLastSeen(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<void> {
  validateDocumentId(messageId, 'messageId');
  validateDocumentId(userId, 'userId');
  const chatMessages = messagesCollection(chatId);
  const message = await chatMessages.doc(messageId).get();

  if (!message.exists) {
    throw new HttpError(404, 'Message not found');
  }

  await firestore.collection('chats').doc(chatId).collection('lastSeen').doc(userId).set({
    userId,
    messageId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}