# Chat Backend

A chat API built with Node.js, TypeScript, PostgreSQL, and Firebase Firestore. It supports 1:1 and group chats. This repository contains the backend only; there is no frontend.

## What It Does

- Creates or returns one chat for a pair of users.
- Creates group chats and lets their creator add or remove members.
- Stores user IDs and chat membership in PostgreSQL.
- Stores messages, read receipts, and each user's last-seen message in Firestore.
- Lets a message's sender edit or delete their message.
- Returns messages in oldest-to-newest order, with a configurable page size.
- Checks that senders and receipt users belong to the requested chat.

## Project Structure

```text
database/
  schema.sql                 PostgreSQL tables and indexes
scripts/
  applySchema.ts             Apply the database schema from .env
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

2. Copy `.env.example` to `.env`, then set `DATABASE_URL` and the Firebase service-account values. Keep the populated `.env` private; it is ignored by Git.

3. Create the PostgreSQL database if it does not exist:

   ```sql
   CREATE DATABASE chat_backend;
   ```

4. Apply the schema using the connection in `.env`. This creates or updates the tables and backfills memberships for existing direct chats. The script is safe to rerun:

   ```powershell
  npm run db:schema
   ```

5. Start the development server:

   ```powershell
   npm run dev
   ```

6. Check the server at `http://localhost:3000/health`.

Useful commands:

```powershell
npm run typecheck
npm run build
npm start
npm run db:schema
```

## Environment Variables

| Name | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000` |
| `DATABASE_URL` | PostgreSQL connection URL |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service-account email |
| `FIREBASE_PRIVATE_KEY` | Service-account private key; preserve the `\n` line breaks |

## API Reference

Every endpoint accepts and returns JSON where a body is used. `CHAT_ID` is a UUID returned by chat creation. `MESSAGE_ID` is the Firestore document ID returned by sending a message. Replace example IDs with values from your own requests.

Errors use this shape:

```json
{
  "error": "Description of the problem"
}
```

Common statuses are `400` for invalid input, `403` for a failed membership/ownership check, `404` for a missing chat or message, and `500` for an unexpected server error.

### Health check

`GET /health`

Checks that the Express server is running. It does not check database connectivity.

Success (`200 OK`):

```json
{ "status": "ok" }
```

### Create or get a direct chat

`POST /chat/create`

Request:

```json
{
  "userAId": "user-101",
  "userBId": "user-202"
}
```

Success (`200 OK`):

```json
{ "chatId": "293a0c05-04f9-49d9-bc49-125e71eaa432" }
```

The pair is stored in sorted order, so sending the same two IDs in reverse order returns the existing direct chat. Both user rows are created if needed. The IDs must be different.

### Create a group chat

`POST /chat/group/create`

Request:

```json
{
  "name": "Project team",
  "createdById": "user-101",
  "memberIds": ["user-101", "user-202", "user-303"]
}
```

Success (`201 Created`):

```json
{
  "chatId": "293a0c05-04f9-49d9-bc49-125e71eaa432",
  "name": "Project team",
  "memberIds": ["user-101", "user-202", "user-303"]
}
```

The creator is included automatically if missing from `memberIds`. Duplicate member IDs are removed. A group needs at least two distinct members; the trimmed name must be 1 to 100 characters. User rows are created when needed.

### Add a group member

`POST /chat/CHAT_ID/members`

Request:

```json
{
  "actorId": "user-101",
  "userId": "user-404"
}
```

Success (`201 Created`):

```json
{ "success": true }
```

Only the group creator (`actorId`) can add members. An existing member returns `409 Conflict`. The user row is created if needed.

### Remove a group member

`DELETE /chat/CHAT_ID/members/USER_ID`

Request body:

```json
{ "actorId": "user-101" }
```

Success (`200 OK`):

```json
{ "success": true }
```

Only the group creator can remove members. The creator cannot remove themself, a direct chat cannot be changed this way, and a group must retain at least two members.

### Send a message

`POST /chat/CHAT_ID/message/send`

Request:

```json
{
  "senderId": "user-101",
  "text": "Hello!"
}
```

Success (`201 Created`):

```json
{
  "id": "MESSAGE_ID",
  "senderId": "user-101",
  "text": "Hello!",
  "createdAt": "2026-01-01T12:00:00.000Z"
}
```

The sender must be a chat member. Text is trimmed and must contain 1 to 4,000 characters. The message and server timestamp are stored in Firestore.

### Get messages

`GET /chat/CHAT_ID/messages?limit=50`

`limit` is optional, defaults to `50`, and is bounded to `1` through `100`. Messages are returned oldest first.

Success (`200 OK`):

```json
{
  "messages": [
    {
      "id": "MESSAGE_ID",
      "senderId": "user-101",
      "text": "Hello!",
      "createdAt": "2026-01-01T12:00:00.000Z",
      "updatedAt": null
    }
  ]
}
```

### Mark a message as read

`POST /chat/CHAT_ID/message/MESSAGE_ID/read`

Request:

```json
{ "userId": "user-202" }
```

Success (`200 OK`):

```json
{ "success": true }
```

The user must belong to the chat and the message must exist. Firestore stores one read timestamp per user under `chats/{chatId}/messages/{messageId}/readReceipts/{userId}`. Repeating the request updates that user's receipt.

### Update last seen

`POST /chat/CHAT_ID/lastseen`

Request:

```json
{
  "userId": "user-202",
  "messageId": "MESSAGE_ID"
}
```

Success (`200 OK`):

```json
{ "success": true }
```

The user must belong to the chat and the message must exist. Firestore stores the user's latest message pointer at `chats/{chatId}/lastSeen/{userId}`.

### Edit a message

`PATCH /chat/CHAT_ID/message/MESSAGE_ID`

Request:

```json
{
  "userId": "user-101",
  "text": "Corrected message"
}
```

Success (`200 OK`):

```json
{ "success": true }
```

The user must be a chat member and the original message sender. The text must contain 1 to 4,000 characters. Firestore updates the text and records `updatedAt`.

### Delete a message

`DELETE /chat/CHAT_ID/message/MESSAGE_ID`

Request body:

```json
{ "userId": "user-101" }
```

Success (`200 OK`):

```json
{ "success": true }
```

The user must be a chat member and the original sender. Deleting the message also deletes its nested read receipts.

### List a user's chats

`GET /user/USER_ID/chats`

Success (`200 OK`):

```json
{
  "chats": [
    {
      "chatId": "293a0c05-04f9-49d9-bc49-125e71eaa432",
      "type": "group",
      "name": "Project team",
      "memberIds": ["user-101", "user-202", "user-303"],
      "createdAt": "2026-01-01T12:00:00.000Z"
    }
  ]
}
```

Returns direct and group chats containing the requested user, with all member IDs.

## Storage Design

- PostgreSQL `users`, `chats`, and `chat_members` tables hold identities and membership. A unique sorted pair prevents duplicate direct chats; group chats can share the same members.
- Firestore `chats/{chatId}/messages/{messageId}` holds message text and server timestamps.
- Each message's `readReceipts` subcollection stores one receipt per user.
- Each chat's `lastSeen` subcollection stores one latest message pointer per user.

## Notes

This task's API passes user IDs in request bodies and URL paths, so it does not authenticate callers. The creator/sender checks are application-level checks, not a substitute for authentication. Before exposing it publicly, add Firebase Authentication token verification and authorization checks. Keep Firebase service-account credentials out of source control.