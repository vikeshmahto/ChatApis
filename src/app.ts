import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { chatRoutes } from './routes/chatRoutes';
import { userRoutes } from './routes/userRoutes';

export const app = express();

app.use(express.json());
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.use('/chat', chatRoutes);
app.use('/user', userRoutes);
app.use(errorHandler);