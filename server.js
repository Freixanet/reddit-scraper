import express from 'express';
import formidableMiddleware from 'express-formidable';
import { scrapeReddit } from './scraper.js';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(formidableMiddleware());

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/scrape', async (req, res) => {
  try {
    const { subreddit } = req.fields;
    
    if (!subreddit) throw new Error('Debes especificar un subreddit');

    const summary = await scrapeReddit(subreddit);
    
    res.render('index', { 
      summary: summary.split('\n').map(line => line.replace(/^\d+\.\s*/, '')),
      subreddit 
    });
    
  } catch (error) {
    res.render('index', { 
      error: error.message.includes('Timeout') 
        ? 'Tiempo de espera agotado. Intenta con menos posts.' 
        : error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🖥️ Servidor web en http://localhost:${PORT}`);
});