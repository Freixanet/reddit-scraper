// server.js - Mejorado con seguridad y optimización
import express from 'express';
import formidableMiddleware from 'express-formidable';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { scrapeReddit } from './scraper.js';

// Cargar variables de entorno desde .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de seguridad para proteger contra ataques comunes
app.use(helmet());

// Middleware para limitar la cantidad de solicitudes y evitar abusos
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Intervalo de tiempo de 15 minutos
  max: 10, // Máximo 10 solicitudes por IP en el intervalo definido
  message: '⏳ Demasiadas solicitudes. Intenta de nuevo más tarde.',
});
app.use(limiter);

// Configurar el motor de vistas EJS y servir archivos estáticos
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(formidableMiddleware()); // Middleware para manejar formularios de manera sencilla

// Ruta principal que renderiza la interfaz inicial
app.get('/', (req, res) => {
  res.render('index', { summary: null, subreddit: null, error: null });
});

// Ruta para ejecutar el scraping de Reddit
app.post('/scrape', async (req, res) => {
  try {
    const { subreddit } = req.fields;
    
    // Validar que el subreddit solo contenga caracteres permitidos
    if (!subreddit || !/^[a-zA-Z0-9_]+$/.test(subreddit)) {
      return res.status(400).render('index', {
        summary: null,
        subreddit: null,
        error: '❌ Subreddit inválido. Usa solo letras, números y guiones bajos.',
      });
    }

    console.log(`🔍 Scrapeando el subreddit: ${subreddit}...`);
    const summary = await scrapeReddit(subreddit);

    // Renderizar la página con los resultados obtenidos
    res.render('index', {
      summary: summary ? summary.split('\n').map(line => line.replace(/^\d+\.\s*/, '')) : [],
      subreddit,
      error: null,
    });
  } catch (error) {
    console.error("❌ Error en /scrape:", error.message);
    
    // Manejo de errores y respuesta adecuada
    res.status(500).render('index', {
      summary: null,
      subreddit: req.fields?.subreddit || null,
      error: error.message.includes('Timeout') 
        ? '⏳ Tiempo de espera agotado. Intenta con menos posts.' 
        : '⚠️ Ocurrió un error inesperado. Inténtalo nuevamente más tarde.',
    });
  }
});

// Iniciar el servidor y escuchar en el puerto definido
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🖥️ Servidor web en http://localhost:${PORT}`);
});
