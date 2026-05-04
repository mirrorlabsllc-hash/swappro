import express from 'express';
import cors from 'cors';
import { getProviders } from './providers/providerManager';

const app = express();
app.use(cors());

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/quote/compare', (req, res) => {
  const providers = getProviders();

  const best = providers.sort((a, b) => b.swapScore - a.swapScore)[0];

  res.json({
    providers,
    bestProvider: best?.name || null,
    aiInsight: {
      summary: 'Best provider selected based on scoring model.',
      bestChoiceReason: 'Highest swapScore based on route, safety, and reliability.'
    }
  });
});

app.get('/api/docs', (req, res) => {
  res.json({
    endpoints: [
      '/api/status',
      '/api/quote/compare',
      '/api/docs'
    ]
  });
});

app.listen(3000, () => {
  console.log('SwapIQ API running on port 3000');
});
