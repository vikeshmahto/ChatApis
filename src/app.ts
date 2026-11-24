import express from 'express';
import { database } from './config/database';
import { firestore } from './config/firebase';
import { errorHandler } from './middleware/errorHandler';
import { chatRoutes } from './routes/chatRoutes';
import { userRoutes } from './routes/userRoutes';

export const app = express();

app.use(express.json());
app.get('/health', async (_request, response) => {
	// Check that the API can reach both storage services.
	const [databaseResult, firestoreResult] = await Promise.allSettled([
		database.query('SELECT 1'),
		firestore.listCollections(),
	]);
	const checks = {
		database: databaseResult.status === 'fulfilled' ? 'ok' : 'error',
		firestore: firestoreResult.status === 'fulfilled' ? 'ok' : 'error',
	};
	const isHealthy = Object.values(checks).every((status) => status === 'ok');

	response.status(isHealthy ? 200 : 503).json({
		status: isHealthy ? 'ok' : 'error',
		checks,
	});
});
app.use('/chat', chatRoutes);
app.use('/user', userRoutes);
app.use(errorHandler);