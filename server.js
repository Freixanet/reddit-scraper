import express from 'express';
import formidableMiddleware from 'express-formidable';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { scrapeReddit } from './scraper.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: '⏳ Demasiadas solicitudes. Intenta de nuevo más tarde.',
});
app.use(limiter);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(formidableMiddleware());

app.get('/', (req, res) => {
  res.render('index', { summary: null, subreddit: null, error: null });
});

app.post('/scrape', async (req, res) => {
  try {
    const { subreddit } = req.fields;
    
    if (!subreddit || !/^[a-zA-Z0-9_-]+$/.test(subreddit)) {
      return res.status(400).render('index', {
        summary: null,
        subreddit: null,
        error: '❌ Subreddit inválido. Usa letras, números, guiones y guiones bajos.',
      });
    }

    console.log(`🔍 Scrapeando el subreddit: ${subreddit}...`);
    const summary = await scrapeReddit(subreddit);

    res.render('index', {
      summary: summary ? summary.split('\n').map(line => line.replace(/^\d+\.\s*/, '')) : [],
      subreddit,
      error: null,
    });
  } catch (error) {
    console.error("❌ Error en /scrape:", error.message);
    
    const errorMessage = 
      error.message.includes('Timeout') ? '⏳ Tiempo agotado. Intenta con menos posts.' :
      error.message.includes('ECONNRESET') ? '🔌 Error de conexión con el proxy' :
      '⚠️ Ocurrió un error inesperado. Inténtalo nuevamente más tarde.';

    res.status(500).render('index', {
      summary: null,
      subreddit: req.fields?.subreddit || null,
      error: errorMessage,
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🖥️ Servidor web en http://localhost:${PORT}`);
});
