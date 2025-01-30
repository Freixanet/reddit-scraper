import puppeteer from 'puppeteer';
import fs from 'fs';
import { setTimeout } from 'timers/promises';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import randomUseragent from 'random-useragent';
import proxyChain from 'proxy-chain';

dotenv.config();

let browser;
const PROXIES = process.env.PROXIES?.split(',') || [];

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

async function scrapeReddit(subreddit, outputFile = 'titulos.txt', maxPosts = 50, scrolls = 10) {
  console.log("Iniciando scraping de Reddit...");
  
  if (PROXIES.length === 0) throw new Error("No hay proxies configurados");
  const proxyUrl = PROXIES[Math.floor(Math.random() * PROXIES.length)];
  const anonymizedProxy = await proxyChain.anonymizeProxy(proxyUrl);

  browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", `--proxy-server=${anonymizedProxy}`],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  try {
    await page.setUserAgent(randomUseragent.getRandom(ua => ua.deviceType === 'mobile'));
    console.log(`Navegando a /r/${subreddit}...`);
    await page.goto(`https://www.reddit.com/r/${subreddit}/`, { waitUntil: "networkidle0", timeout: 30000 });

    const checkIfBlocked = async () => {
      return await page.evaluate(() => document.body?.innerText.includes('Access Denied') || document.body?.innerText.includes('robot check'));
    };

    if (await checkIfBlocked()) {
      console.log("⚠️ Bloqueado por Reddit. Cambiando proxy...");
      return scrapeReddit(subreddit, outputFile, maxPosts, scrolls);
    }

    await page.waitForSelector('a[slot="title"]', { timeout: 10000 });

    let titles = new Set();
    for (let i = 0; i < scrolls && titles.size < maxPosts; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await setTimeout(2000);
      
      const newTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[slot="title"]'))
          .map(el => el.textContent.trim())
          .filter(title => title.length >= 15 && title.split(' ').length >= 3);
      });
      newTitles.forEach(title => titles.add(title));
    }

    console.log(`📌 ${titles.size} títulos encontrados`);
    fs.writeFileSync(outputFile, Array.from(titles).join("\n"));
    return await generateSummary([...titles], subreddit);
  } catch (error) {
    console.error("❌ Error en scraping:", error);
    throw error;
  } finally {
    if (page && !page.isClosed()) await page.close();
    if (browser) {
      await browser.close();
      browser.disconnect();
    }
    console.log("Limpieza completada");
  }
}

async function generateSummary(titles, subreddit) {
  try {
    const cleanTitles = titles.map(title => title.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ¿?¡! ]/g, ''));
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `Resume los siguientes títulos en un listado breve para r/${subreddit}` },
        { role: 'user', content: cleanTitles.join('\n') }
      ]
    });
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("❌ Error en OpenAI:", error);
    throw new Error("Error al generar resumen");
  }
}

export { scrapeReddit };