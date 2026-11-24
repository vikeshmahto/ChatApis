# Chat Backend

A small 1:1 chat API built with Node.js, TypeScript, PostgreSQL, and Firebase Firestore. This repository contains the backend only; there is no frontend.

## What It Does

- Creates or returns one chat for a pair of users.
- Stores user IDs and chat membership in PostgreSQL.
- Stores messages, read receipts, and each user's last-seen message in Firestore.
- Returns messages in oldest-to-newest order, with a configurable page size.
- Checks that senders and receipt users belong to the requested chat.

## Project Structure

```text
database/
  schema.sql                 PostgreSQL tables and indexes
src/
  config/                    PostgreSQL and Firebase connections
  errors/                    Small HTTP error type
  middleware/                Async route and error handling
  routes/                    HTTP endpoints and request validation
  services/                  Chat and message data operations
  app.ts                     Express app and route registration
  server.ts                  Server startup and graceful shutdown
.env.example                 Required environment variable names
```

Routes validate request data and call a service. Services handle storage. Keeping those jobs separate makes each part easier to read and explain.

## Requirements

- Node.js 20 or newer
- PostgreSQL 13 or newer
- A Firebase project with Firestore enabled
- A Firebase service account for the Admin SDK

## Run Locally

1. Install packages:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env`, then set your PostgreSQL connection string and Firebase service-account values. The existing `.env` in this workspace is empty, so it does not contain usable credentials yet. Keep the populated `.env` private; it is ignored by Git.

3. Create the database and apply the schema:

   ```sql
   CREATE DATABASE chat_backend;
   ```

   Then run `database/schema.sql` against that database. For example, with PostgreSQL's command-line client:

   ```powershell
   psql -d chat_backend -f database/schema.sql
   ```

4. Start the development server:

   ```powershell
   npm run dev
   ```

5. Check the server at `http://localhost:3000/health`.

Useful commands:

```powershell
npm run typecheck
npm run build
npm start
```

## Environment Variables

| Name | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000` |
| `DATABASE_URL` | PostgreSQL connection URL |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service-account email |
| `FIREBASE_PRIVATE_KEY` | Service-account private key; preserve the `\n` line breaks |

## API

All request and response bodies use JSON. IDs are strings. Replace `CHAT_ID`, `USER_ID`, and `MESSAGE_ID` in the examples with real IDs.

### Create or get a 1:1 chat

`POST /chat/create`

```json
{
  "userAId": "user-101",
  "userBId": "user-202"
}
```

Response:

```json
{
  "chatId": "CHAT_ID"
}
```

The pair is stored in sorted order with a unique database constraint. Repeating the request, including with the user IDs reversed, returns the same chat. User rows are created when needed because this task does not include a separate user-registration endpoint.

### Send a message

`POST /chat/CHAT_ID/message/send`

```json
{
  "senderId": "user-101",
  "text": "Hello!"
}
```

Response (`201 Created`):

```json
{
  "id": "MESSAGE_ID",
  "senderId": "user-101",
  "text": "Hello!",
  "createdAt": "2026-01-01T12:00:00.000Z"
}
```

Messages are limited to 4,000 characters.

### Get messages

`GET /chat/CHAT_ID/messages?limit=50`

The limit defaults to 50 and is capped at 100. Results are ordered oldest first.

### Mark a message as read

`POST /chat/CHAT_ID/message/MESSAGE_ID/read`

```json
{
  "userId": "user-202"
}
```

The receipt is stored at `chats/{chatId}/messages/{messageId}/readReceipts/{userId}` in Firestore. Repeating the request updates the same receipt.

### Update last seen

`POST /chat/CHAT_ID/lastseen`

```json
{
  "userId": "user-202",
  "messageId": "MESSAGE_ID"
}
```

The latest position is stored at `chats/{chatId}/lastSeen/{userId}` in Firestore.

### List a user's chats

`GET /user/USER_ID/chats`

Returns each chat ID, both member IDs, and its creation time from PostgreSQL.

## Storage Design

- PostgreSQL `users` and `chats` tables hold identities and 1:1 membership. A unique sorted user pair prevents duplicate chats.
- Firestore `chats/{chatId}/messages/{messageId}` holds message text and server timestamps.
- Each message's `readReceipts` subcollection stores one receipt per user.
- Each chat's `lastSeen` subcollection stores one latest message pointer per user.

## Notes

This task's API passes user IDs in request bodies and URL paths, so it does not authenticate callers. Before exposing it publicly, add Firebase Authentication token verification and authorization checks. Keep Firebase service-account credentials out of source control. Group chats and edit/delete are intentionally not included so the core 1:1 implementation stays small.