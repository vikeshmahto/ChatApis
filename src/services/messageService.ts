import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../config/firebase';
import { HttpError } from '../errors/HttpError';

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | null;
  updatedAt?: string | null;
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

// Change the text only if this user sent the message.
export async function editMessage(
  chatId: string,
  messageId: string,
  userId: string,
  text: string,
): Promise<void> {
  validateDocumentId(messageId, 'messageId');
  validateDocumentId(userId, 'userId');
  const message = messagesCollection(chatId).doc(messageId);
  const snapshot = await message.get();

  if (!snapshot.exists) {
    throw new HttpError(404, 'Message not found');
  }
  if (snapshot.get('senderId') !== userId) {
    throw new HttpError(403, 'Only the sender can edit this message');
  }

  await message.update({
    text,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// Delete the message and its read receipts.
export async function deleteMessage(
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
  if (snapshot.get('senderId') !== userId) {
    throw new HttpError(403, 'Only the sender can delete this message');
  }

  await firestore.recursiveDelete(message);
}

// Get the newest messages and format their dates for the API.
export async function getMessages(chatId: string, limit: number): Promise<Message[]> {
  const result = await messagesCollection(chatId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return result.docs.map((document) => {
    const data = document.data();
    const createdAt = data.createdAt as Timestamp | undefined;
    const updatedAt = data.updatedAt as Timestamp | undefined;

    return {
      id: document.id,
      senderId: data.senderId as string,
      text: data.text as string,
      createdAt: createdAt?.toDate().toISOString() ?? null,
      updatedAt: updatedAt?.toDate().toISOString() ?? null,
    };
  });
}

// Save this user's read time for the message.
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

// Save which message this user last saw.
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