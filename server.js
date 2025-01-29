import express from 'express';
import formidableMiddleware from 'express-formidable';
import { scrapeReddit } from './scraper.js';
import fs from 'fs';

const app = express();

// Configuración
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(formidableMiddleware());

// Rutas
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/scrape', async (req, res) => {
  try {
    const { subreddit, outputFile, maxPosts, scrolls } = req.fields;
    
    if (!subreddit) throw new Error('Debes especificar un subreddit');

    const summary = await scrapeReddit(
      subreddit,
      outputFile || 'titulos.txt',
      Number(maxPosts) || 50,
      Number(scrolls) || 10
    );

    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }

    res.json({ summary });
    
  } catch (error) {
    console.error('Error en /scrape:', error);
    res.status(500).json({ 
      error: error.message.includes('Timeout') 
        ? 'Tiempo de espera agotado. Intenta con menos posts.' 
        : error.message
    });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🖥️ Servidor corriendo en http://localhost:${PORT}`);
});