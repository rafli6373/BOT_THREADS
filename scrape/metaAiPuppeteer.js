import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

class MetaAiPuppeteer {
  constructor(cookieString = '') {
    this.rawCookie = cookieString || process.env.META_AI_COOKIE || '';
    this.browser = null;
    this.page = null;
    this.isBusy = false;
  }

  findChromePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
    const defaultPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const p of defaultPaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  parseCookies(rawStr) {
    if (!rawStr) return [];
    const clean = rawStr.replace(/^"|"$/g, '').trim();
    const pairs = clean.split(';').map(s => s.trim()).filter(Boolean);
    const cookies = [];

    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (name) {
        cookies.push({
          name,
          value,
          domain: '.meta.ai',
          path: '/'
        });
      }
    }
    return cookies;
  }

  async getBrowser() {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    const chromePath = this.findChromePath();
    if (!chromePath) {
      throw new Error('Google Chrome / Chromium tidak ditemukan di sistem. Silakan tentukan CHROME_PATH di .env');
    }

    this.browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,800'
      ]
    });

    this.browser.on('disconnected', () => {
      this.browser = null;
      this.page = null;
    });

    return this.browser;
  }

  async getPage() {
    const browser = await this.getBrowser();
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    this.page = await browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await this.page.setViewport({ width: 1280, height: 800 });

    const cookies = this.parseCookies(this.rawCookie);
    if (cookies.length > 0) {
      await this.page.setCookie(...cookies);
    }

    await this.page.goto('https://www.meta.ai/', { waitUntil: 'networkidle2', timeout: 35000 });
    return this.page;
  }

  /**
   * Mengirim pertanyaan ke Meta AI dan mengambil respons teksnya
   * @param {string} prompt - Pertanyaan pengguna
   * @param {object} options - Opsi lampiran { imageBuffer, mimeType }
   */
  async ask(prompt, options = {}) {
    // Antrian jika browser sedang memproses chat sebelumnya
    while (this.isBusy) {
      await new Promise(r => setTimeout(r, 500));
    }

    this.isBusy = true;
    let tempFilePath = null;

    try {
      const page = await this.getPage();

      // Tunggu input textbox tersedia
      const inputSelector = 'div[role="textbox"]';
      await page.waitForSelector(inputSelector, { timeout: 15000 });

      // Jika ada lampiran gambar/file
      if (options.fileBuffer) {
        try {
          const ext = options.mimeType?.includes('png') ? '.png' : '.jpg';
          tempFilePath = path.join(os.tmpdir(), `meta_upload_${Date.now()}${ext}`);
          fs.writeFileSync(tempFilePath, options.fileBuffer);

          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            console.log('[📷] Mengunggah lampiran gambar ke Meta AI...');
            await fileInput.uploadFile(tempFilePath);
            await new Promise(r => setTimeout(r, 2000)); // Tunggu upload selesai
          }
        } catch (uploadErr) {
          console.warn('[!] Gagal mengunggah file ke Meta AI:', uploadErr.message);
        }
      }

      // Hitung jumlah pesan bot sebelumnya di halaman untuk mendeteksi respons baru
      const initialCount = await page.evaluate(() => {
        return document.querySelectorAll('div[dir="auto"], p, div.markdown').length;
      });

      // Ketik prompt ke kotak chat
      await page.click(inputSelector);
      await page.keyboard.type(prompt, { delay: 15 });

      // Tekan tombol Enter untuk mengirim
      await page.keyboard.press('Enter');

      // Tunggu hingga respons mulai muncul dan selesai streaming (maks 25 detik)
      let answerText = '';
      const startTime = Date.now();

      while (Date.now() - startTime < 25000) {
        await new Promise(r => setTimeout(r, 2000));

        const latestState = await page.evaluate((initCount) => {
          const elements = Array.from(document.querySelectorAll('div[dir="auto"], p, div.markdown'));
          const currentCount = elements.length;

          // Ambil elemen yang memiliki teks signifikan setelah prompt dikirim
          const valid = elements
            .map(el => el.innerText?.trim())
            .filter(t => t && t.length > 20 && !t.includes('Tanya Meta AI') && !t.includes('Ask Meta AI'));

          const lastText = valid[valid.length - 1] || '';

          // Cek apakah tombol stop generating masih ada (sedang mengetik)
          const isStreaming = !!document.querySelector('button[aria-label*="Stop"], button[aria-label*="Hentikan"]');

          return { lastText, isStreaming, currentCount };
        }, initialCount);

        if (latestState.lastText && !latestState.isStreaming && latestState.currentCount > initialCount) {
          // Tunggu 1.5 detik lagi untuk memastikan streaming selesai 100%
          await new Promise(r => setTimeout(r, 1500));
          const finalText = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div[dir="auto"], p, div.markdown'));
            const valid = elements
              .map(el => el.innerText?.trim())
              .filter(t => t && t.length > 20 && !t.includes('Tanya Meta AI') && !t.includes('Ask Meta AI'));
            return valid[valid.length - 1] || '';
          });
          answerText = finalText;
          break;
        }
      }

      if (!answerText) {
        throw new Error('Timeout menunggu jawaban dari Meta AI.');
      }

      return {
        answer: answerText,
        provider: 'Meta AI (Web Scraper)'
      };

    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      this.isBusy = false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

export default MetaAiPuppeteer;
