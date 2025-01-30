import express from 'express';
import formidableMiddleware from 'express-formidable';
import { scrapeReddit } from './scraper.js';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(formidableMiddleware());

app.get('/', (req, res) => {
  res.render('index', { summary: null, subreddit: null, error: null });
});

app.post('/scrape', async (req, res) => {
  try {
    const { subreddit } = req.fields;

    if (!subreddit) throw new Error('Debes especificar un subreddit');

    console.log(`🔍 Scrapeando el subreddit: ${subreddit}...`);
    const summary = await scrapeReddit(subreddit);

    res.render('index', { 
      summary: summary ? summary.split('\n').map(line => line.replace(/^\d+\.\s*/, '')) : [],
      subreddit,
      error: null
    });

  } catch (error) {
    console.error("❌ Error en /scrape:", error.message);

    res.render('index', { 
      summary: null,
      subreddit: req.fields?.subreddit || null,
      error: error.message.includes('Timeout') 
        ? '⏳ Tiempo de espera agotado. Intenta con menos posts.' 
        : error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🖥️ Servidor web en http://localhost:${PORT}`);
});