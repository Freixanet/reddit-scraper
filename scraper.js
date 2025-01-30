import puppeteer from 'puppeteer';
import fs from 'fs';
import { setTimeout } from 'timers/promises';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import randomUseragent from 'random-useragent';

dotenv.config();

let browser;

/**
 * Cierra el navegador y finaliza el proceso de manera segura.
 */
async function cleanup() {
  if (browser) {
    console.log("Cerrando navegador...");
    await browser.close();
    browser.disconnect();
    console.log("Navegador cerrado correctamente");
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Scrapea un subreddit concreto, guarda los títulos en un archivo
 * y genera un resumen usando la API de OpenAI.
 *
 * @param {string} subreddit - Nombre del subreddit (sin '/r/').
 * @param {string} [outputFile='titulos.txt'] - Nombre del archivo de salida.
 * @param {number} [maxPosts=50] - Número máximo de títulos a recolectar.
 * @param {number} [scrolls=10] - Cantidad de "scrolls" para cargar más posts.
 */
async function scrapeReddit(subreddit, outputFile = 'titulos.txt', maxPosts = 50, scrolls = 10) {
  console.log("Iniciando scraping de Reddit...");

  browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    // Asignar un User-Agent móvil aleatorio para mitigar bloqueos básicos
    await page.setUserAgent(randomUseragent.getRandom(ua => ua.deviceType === 'mobile'));
    
    console.log(`Navegando a /r/${subreddit}...`);
    await page.goto(`https://www.reddit.com/r/${subreddit}/`, {
      waitUntil: "networkidle0",
      timeout: 30000
    });

    // Verifica si Reddit ha bloqueado el acceso
    const checkIfBlocked = async () => {
      return await page.evaluate(() =>
        document.body?.innerText.includes('Access Denied') ||
        document.body?.innerText.includes('robot check')
      );
    };

    if (await checkIfBlocked()) {
      console.log("⚠️ Bloqueado por Reddit. Intenta nuevamente más tarde o ajusta tu configuración.");
      return null; // O puedes lanzar un error: throw new Error("Bloqueado por Reddit");
    }

    // Esperamos a que aparezcan enlaces de títulos de publicaciones
    await page.waitForSelector('a[slot="title"]', { timeout: 10000 });

    let titles = new Set();
    for (let i = 0; i < scrolls && titles.size < maxPosts; i++) {
      // Hacer scroll para cargar más posts
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await setTimeout(2000); // Espera un poco a que se cargue contenido

      const newTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[slot="title"]'))
          .map(el => el.textContent.trim())
          .filter(title => title.length >= 15 && title.split(' ').length >= 3);
      });
      newTitles.forEach(title => titles.add(title));
    }

    console.log(`📌 Se han encontrado ${titles.size} títulos.`);
    fs.writeFileSync(outputFile, Array.from(titles).join("\n"));

    // Generar resumen con OpenAI
    const summary = await generateSummary([...titles], subreddit);
    return summary;

  } catch (error) {
    console.error("❌ Error en el proceso de scraping:", error);
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
    }
    if (browser) {
      await browser.close();
      browser.disconnect();
    }
    console.log("Limpieza completada");
  }
}

/**
 * Recibe un array de títulos y el nombre del subreddit,
 * y devuelve un resumen breve usando la API de OpenAI.
 *
 * @param {string[]} titles - Lista de títulos.
 * @param {string} subreddit - Nombre del subreddit.
 */
async function generateSummary(titles, subreddit) {
  try {
    // Limpiamos los títulos de caracteres extraños para un mejor procesamiento
    const cleanTitles = titles.map(title =>
      title.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ¿?¡! ]/g, '')
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Resume los siguientes títulos en un listado breve para r/${subreddit}.`
        },
        {
          role: 'user',
          content: cleanTitles.join('\n')
        }
      ]
    });
    
    return completion.choices[0].message.content;
    
  } catch (error) {
    console.error("❌ Error al generar resumen con OpenAI:", error);
    throw new Error("Error al generar resumen");
  }
}

export { scrapeReddit };
