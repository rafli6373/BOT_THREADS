import puppeteer from 'puppeteer';
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

  async findChromePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
    const defaultPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/lib/chromium/chrome',
      '/snap/bin/chromium',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of defaultPaths) {
      if (fs.existsSync(p)) return p;
    }

    // Cek biner bawaan Puppeteer (didownload saat npm install)
    try {
      const bundled = await puppeteer.executablePath();
      if (bundled && fs.existsSync(bundled)) return bundled;
    } catch {}

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

    const chromePath = await this.findChromePath();

    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,800',
        '--no-first-run',
        '--no-zygote'
      ]
    };

    if (chromePath) {
      launchOptions.executablePath = chromePath;
    }

    this.browser = await puppeteer.launch(launchOptions);

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

    await this.page.goto('https://www.meta.ai/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    return this.page;
  }

  /**
   * Mengirim pertanyaan ke Meta AI dan mengambil respons teksnya
   * @param {string} prompt - Pertanyaan pengguna
   * @param {object} options - Opsi lampiran { fileBuffer, mimeType, filePath }
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

      // Buka percakapan baru yang bersih untuk setiap permintaan
      try {
        await page.goto('https://www.meta.ai/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (navErr) {
        // Jika navigasi timeout ringan, lanjutkan jika halaman sudah siap
      }

      // Tunggu input textbox tersedia
      const inputSelector = 'div[role="textbox"]';
      await page.waitForSelector(inputSelector, { timeout: 15000 });

      // Jika ada lampiran gambar, video, atau dokumen (OCR Multimodal)
      if (options.fileBuffer || options.filePath) {
        try {
          if (options.filePath && fs.existsSync(options.filePath)) {
            tempFilePath = options.filePath;
          } else if (options.fileBuffer) {
            let ext = '.jpg';
            const mime = (options.mimeType || '').toLowerCase();
            if (mime.includes('png')) ext = '.png';
            else if (mime.includes('webp')) ext = '.webp';
            else if (mime.includes('mp4') || mime.includes('video')) ext = '.mp4';
            else if (mime.includes('pdf')) ext = '.pdf';
            else if (mime.includes('word') || mime.includes('docx')) ext = '.docx';
            else if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('sheet') || mime.includes('xlsx')) ext = '.xlsx';
            else if (mime.includes('text') || mime.includes('csv')) ext = '.txt';

            tempFilePath = path.join(os.tmpdir(), `meta_upload_${Date.now()}${ext}`);
            fs.writeFileSync(tempFilePath, options.fileBuffer);
          }

          const fileInput = await page.$('input[type="file"]');
          if (fileInput && tempFilePath) {
            console.log(`[📎] Mengunggah lampiran (${path.extname(tempFilePath)}) ke Meta AI untuk OCR/Vision...`);
            await fileInput.uploadFile(tempFilePath);
            // Beri jeda agar file selesai diunggah dan preview muncul di kotak input
            await new Promise(r => setTimeout(r, 3000));
          }
        } catch (uploadErr) {
          console.warn('[!] Gagal mengunggah file ke Meta AI:', uploadErr.message);
        }
      }

      // Klik dan ketik prompt ke kotak chat
      await page.click(inputSelector);
      await page.keyboard.type(prompt, { delay: 10 });

      // Kirim pesan: klik tombol Send atau tekan Enter
      const sendClicked = await page.evaluate(() => {
        const sendBtn = document.querySelector('button[aria-label="Send"]');
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }
        return false;
      });

      if (!sendClicked) {
        await page.keyboard.press('Enter');
      }

      // Pantau proses streaming respons hingga selesai
      let started = false;
      let rawAnswer = '';
      const startTime = Date.now();
      const MAX_WAIT_MS = 40000;

      while (Date.now() - startTime < MAX_WAIT_MS) {
        await new Promise(r => setTimeout(r, 1000));

        const state = await page.evaluate(() => {
          const isStreaming = !!document.querySelector('button[aria-label="Stop"]');
          const articles = Array.from(document.querySelectorAll('div[role="article"]'));
          const lastArticle = articles[articles.length - 1];
          const lastText = lastArticle ? lastArticle.innerText.trim() : '';

          return { isStreaming, articleCount: articles.length, lastText };
        });

        if (state.isStreaming) {
          started = true;
        }

        // Jika streaming sudah dimulai dan tombol Stop sudah hilang, berarti AI sudah selesai
        if (started && !state.isStreaming && state.articleCount >= 2 && state.lastText) {
          // Beri jeda 1 detik untuk kestabilan DOM akhir
          await new Promise(r => setTimeout(r, 1000));
          rawAnswer = await page.evaluate(() => {
            const articles = Array.from(document.querySelectorAll('div[role="article"]'));
            const lastArticle = articles[articles.length - 1];
            return lastArticle ? lastArticle.innerText.trim() : '';
          });
          break;
        }
      }

      if (!rawAnswer) {
        throw new Error('Timeout menunggu jawaban dari Meta AI.');
      }

      // Bersihkan teks jawaban dari prefix "Show thinking", "Hide thinking", dan tombol aksi
      let cleanAnswer = rawAnswer
        .replace(/^(Show|Hide)\s*thinking\s*/i, '')
        .replace(/\n*(Copy response|Share|Like this response|Dislike this response)[\s\S]*$/i, '')
        .trim();

      return {
        answer: cleanAnswer,
        provider: 'Meta AI (Web Scraper)'
      };

    } finally {
      // Hapus file sementara jika dibuat dari buffer
      if (tempFilePath && !options.filePath && fs.existsSync(tempFilePath)) {
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
