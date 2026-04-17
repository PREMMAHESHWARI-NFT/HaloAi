import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { walletRouter } from './routes/wallets';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/wallets', walletRouter);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
});
