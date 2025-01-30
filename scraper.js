// scraper.js - Mejorado con comentarios
import puppeteer from 'puppeteer';
import fs from 'fs';
import { setTimeout } from 'timers/promises';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import randomUseragent from 'random-useragent';
import proxyChain from 'proxy-chain';

dotenv.config(); // Cargar las variables de entorno

let browser;
const PROXIES = ['http://proxy1.com', 'http://proxy2.com']; // Lista de proxies para evitar bloqueos

// Función para cerrar el navegador en caso de que el proceso termine inesperadamente
async function cleanup() {
  if (browser) {
    console.log("Cerrando navegador...");
    await browser.close();
    console.log("Navegador cerrado correctamente");
  }
  process.exit(0);
}

// Manejo de señales del sistema para cerrar el navegador correctamente
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Configuración de la API de OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Función principal para hacer scraping en Reddit
 * @param {string} subreddit - El subreddit a analizar
 * @param {string} outputFile - Archivo donde se guardarán los títulos extraídos
 * @param {number} maxPosts - Número máximo de posts a extraer
 * @param {number} scrolls - Número de desplazamientos en la página
 */
async function scrapeReddit(subreddit, outputFile = 'titulos.txt', maxPosts = 50, scrolls = 10) {
  console.log("Iniciando scraping de Reddit...");
  
  // Seleccionar un proxy aleatorio y anonimizarlo
  const proxyUrl = PROXIES[Math.floor(Math.random() * PROXIES.length)];
  const anonymizedProxy = await proxyChain.anonymizeProxy(proxyUrl);

  // Lanzar el navegador con el proxy configurado
  browser = await puppeteer.launch({
    headless: "new", // Ejecutar en modo sin interfaz gráfica
    args: ["--no-sandbox", "--disable-setuid-sandbox", `--proxy-server=${anonymizedProxy}`],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  try {
    await page.setUserAgent(randomUseragent.getRandom()); // Asignar un user agent aleatorio para evitar bloqueos
    console.log(`Navegando a /r/${subreddit}...`);
    await page.goto(`https://www.reddit.com/r/${subreddit}/`, { waitUntil: "networkidle0", timeout: 30000 });

    // Verificar si Reddit ha bloqueado la IP
    const checkIfBlocked = async () => {
      return await page.evaluate(() => document.body?.innerText.includes('Access Denied') || document.body?.innerText.includes('robot check'));
    };

    if (await checkIfBlocked()) {
      console.log("⚠️ Bloqueado por Reddit. Cambiando proxy...");
      return scrapeReddit(subreddit, outputFile, maxPosts, scrolls); // Reintentar con otro proxy
    }

    await page.waitForSelector('a[slot="title"]', { timeout: 10000 });

    let titles = new Set();
    for (let i = 0; i < scrolls && titles.size < maxPosts; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // Desplazar la página hacia abajo
      await setTimeout(2000); // Esperar a que carguen nuevos posts
      
      // Extraer los títulos de los posts
      const newTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[slot="title"]'))
          .map(el => el.textContent.trim())
          .filter(title => title.length >= 15 && title.split(' ').length >= 3);
      });
      newTitles.forEach(title => titles.add(title)); // Agregar títulos a la lista (sin duplicados)
    }

    console.log(`📌 ${titles.size} títulos encontrados`);
    fs.writeFileSync(outputFile, Array.from(titles).join("\n")); // Guardar títulos en un archivo
    console.log(`Títulos guardados en ${outputFile}`);
    return await generateSummary([...titles], subreddit);
  } catch (error) {
    console.error("❌ Error en scraping:", error);
    return "Error al obtener títulos";
  } finally {
    if (page && !page.isClosed()) await page.close();
    if (browser) await browser.close();
    console.log("Limpieza completada");
  }
}

/**
 * Genera un resumen de los títulos obtenidos usando OpenAI
 * @param {Array} titles - Lista de títulos extraídos
 * @param {string} subreddit - Nombre del subreddit analizado
 */
async function generateSummary(titles, subreddit) {
  try {
    // Limpiar los títulos de caracteres especiales
    const cleanTitles = titles.map(title => title.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ¿?¡! ]/g, ''));
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'system', content: `Resume los siguientes títulos en un listado breve para r/${subreddit}` },
                 { role: 'user', content: cleanTitles.join('\n') }]
    });
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("❌ Error en OpenAI:", error);
    return "Error al generar resumen";
  }
}

export { scrapeReddit };