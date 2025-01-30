import puppeteer from 'puppeteer';
import fs from 'fs';
import { setTimeout } from 'timers/promises';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

let browser;

async function cleanup() {
  if (browser) {
    console.log("Cerrando navegador...");
    await browser.close();
    console.log("Navegador cerrado correctamente");
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function scrapeReddit(subreddit, outputFile = 'titulos.txt', maxPosts = 50, scrolls = 10) {
  console.log("Iniciando scraping de Reddit...");
  browser = await puppeteer.launch({
    headless: "new", // Navegador en segundo plano
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    console.log("Configurando user agent...");
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    console.log(`Navegando a /r/${subreddit}...`);
    await page.goto(`https://www.reddit.com/r/${subreddit}/`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    const checkIfBlocked = async () => {
      return await page.evaluate(() => {
        return document.querySelector('body')?.innerText.includes('Access Denied');
      });
    };

    if (await checkIfBlocked()) {
      console.log("Bloqueado por Reddit. Reintentando en 5 minutos...");
      await setTimeout(300000);
      await page.reload({ waitUntil: "networkidle0", timeout: 30000 });
    }

    await page.waitForFunction(() => document.querySelectorAll('a[slot="title"]').length > 0, { timeout: 10000 });

    let postsCount = 0;
    let titles = [];

    for (let i = 0; i < scrolls && postsCount < maxPosts; i++) {
      console.log(`Desplazando... Posts recolectados: ${postsCount}`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await setTimeout(3000);

      const newTitles = await page.evaluate((currentCount) => {
        return Array.from(document.querySelectorAll('a[slot="title"]'))
          .slice(currentCount)
          .map(el => {
            const title = el.textContent.trim();
            return title.length >= 15 && 
                   title.split(' ').length >= 3 &&
                   !title.toLowerCase().includes('highlights') ? title : null;
          })
          .filter(title => title);
      }, postsCount);

      if (newTitles.length > 0) {
        titles = [...titles, ...newTitles];
        postsCount = titles.length;
      } else {
        console.log("No se detectaron nuevos títulos. Intentando otro desplazamiento...");
      }

      if (postsCount >= maxPosts || newTitles.length === 0) break;
    }

    console.log(`📌 ${postsCount} títulos encontrados`);
    
    if (titles.length > 0) {
      fs.writeFileSync(outputFile, titles.join("\n"));
      console.log(`Títulos guardados en ${outputFile}`);
      const summary = await generateSummary(titles, subreddit);
      return summary;
    } else {
      const message = "No se encontraron títulos para analizar";
      console.log(message);
      return message;
    }

  } catch (error) {
    console.error("❌ Error durante el scraping:", error.stack || error);
    if (page) {
      console.log("URL de la página:", page.url());
      console.log("Título de la página:", await page.title().catch(() => "No se pudo obtener el título"));
    }
    throw error;
  } finally {
    try {
      if (page && !page.isClosed()) await page.close();
      if (browser) await browser.close();
      console.log("Limpieza completada");
    } catch (cleanupError) {
      console.error("Error durante la limpieza:", cleanupError);
    }
  }
}

async function generateSummary(titles, subreddit) {
  try {
    const cleanTitles = titles
      .map(title => title.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ¿?¡! ]/g, ''))
      .filter(title => title.split(' ').length >= 3)
      .filter((v, i, a) => a.indexOf(v) === i);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: `Eres traductor profesional y analista de tendencias. Sigue estos pasos:
          1. TRADUCE al español de España manteniendo significado y contexto
          2. ANALIZA relevancia para el subreddit r/${subreddit}
          3. GENERA lista numerada con formato:
             "Título adaptado (Categoría) - Explicación contextual (12-15 palabras)"
          
          Categorías válidas: Tecnología, Negocios, Cultura, Educación, Salud, Política, Medio Ambiente, Entretenimiento, Deportes, Otros`
        },
        {
          role: 'user',
          content: `Subreddit: r/${subreddit}
          
          Títulos a procesar (${cleanTitles.length}):
          ${cleanTitles.slice(0, 100).join('\n')}`
        }
      ],
      max_tokens: 600,
      temperature: 0.25
    });

    return validateSummary(completion.choices[0].message.content);
  } catch (error) {
    console.error("Error generando resumen:", error.message);
    return "No se pudo generar el resumen";
  }
}

function validateSummary(summary) {
  const items = summary.split('\n')
    .filter(line => line.match(/^\d+\.\s.+(\(.+\))\s-\s.+/))
    .slice(0, 10);

  if (items.length < 10) {
    const placeholder = (index) => 
      `${index}. Análisis no disponible - título no cumplió los criterios`;
    return Array.from({length: 10}, (_, i) => placeholder(i+1)).join('\n');
  }
  
  return items.join('\n');
}

export { scrapeReddit };