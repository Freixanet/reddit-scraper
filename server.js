import express from 'express';
import formidableMiddleware from 'express-formidable';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { scrapeReddit } from './scraper.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuraciones de seguridad y optimización
app.use(helmet());
app.use(compression());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: '⏳ Demasiadas solicitudes. Intenta de nuevo más tarde.',
});
app.use(limiter);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(formidableMiddleware());

// Página principal
app.get('/', (req, res) => {
  res.render('index', { summary: null, subreddit: null, error: null });
});

// Endpoint para iniciar el scraping
app.post('/scrape', async (req, res) => {
  try {
    const { subreddit } = req.fields;
    
    // Validación sencilla del nombre del subreddit
    if (!subreddit || !/^[a-zA-Z0-9_-]+$/.test(subreddit)) {
      return res.status(400).render('index', {
        summary: null,
        subreddit: null,
        error: '❌ Subreddit inválido. Usa letras, números, guiones y guiones bajos.',
      });
    }

    console.log(`🔍 Scrapeando el subreddit: ${subreddit}...`);
    const summary = await scrapeReddit(subreddit);

    // Dividimos las líneas en un array y quitamos enumeraciones
    res.render('index', {
      summary: summary ? summary.split('\n').map(line => line.replace(/^\d+\.\s*/, '')) : [],
      subreddit,
      error: null,
    });
  } catch (error) {
    console.error("❌ Error en /scrape:", error.message);
    
    // Mensajes de error más amigables
    const errorMessage = 
      error.message.includes('Timeout') ? '⏳ Tiempo agotado. Intenta con menos posts.' :
      error.message.includes('ECONNRESET') ? '🔌 Error de conexión con el proxy.' :
      error.message.includes('Se alcanzó el máximo de intentos') ? '⚠️ No se pudo completar el scraping. Todos los proxies fallaron.' :
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
