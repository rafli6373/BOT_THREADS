import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

class MetaAIMultimodal {
  /**
   * @param {string} cookieString - Cookie akun Meta AI (wajib berisi datr & abra_sess / ecto_1_sess)
   */
  constructor(cookieString = '') {
    this.cookies = cookieString || process.env.META_AI_COOKIE || (
      (process.env.datr || process.env.ecto_1_sess)
        ? `datr=${process.env.datr || ''}; ecto_1_sess=${process.env.ecto_1_sess || ''};`
        : ''
    );
    this.lsd = null;
    this.fb_dtsg = null;
    this.initialized = false;

    this.DOC_ID_SEND_MESSAGE = '7783822248314888';

    this.client = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.meta.ai',
        'Referer': 'https://www.meta.ai/'
      }
    });
  }

  /**
   * 1. Inisialisasi Token LSD & FB_DTSG
   */
  async init() {
    if (this.initialized) return;

    try {
      const res = await this.client.get('https://www.meta.ai/', {
        headers: this.cookies ? { 'Cookie': this.cookies } : {}
      });

      const html = res.data;
      const lsdMatch = html.match(/"LSD",\s*\[\],\s*\{"token":"([^"]+)"\}/) || html.match(/["LSD",[],\{"token":"([^"]+)"\}/);
      this.lsd = lsdMatch ? lsdMatch[1] : 'AVp_default_lsd';

      const dtsgMatch = html.match(/"DTSGInitialData",\s*\[\],\s*\{"token":"([^"]+)"\}/);
      this.fb_dtsg = dtsgMatch ? dtsgMatch[1] : '';
    } catch (err) {
      if (err.response && err.response.status === 403) {
        throw new Error('Meta AI 403 Forbidden / Challenge. Cookie (datr & ecto_1_sess) belum diisi atau sudah kedaluwarsa.');
      }
      this.lsd = this.lsd || 'AVp_default_lsd';
    }

    this.initialized = true;
  }

  /**
   * 2. Upload Satu Gambar ke RUpload Meta
   */
  async uploadSingleImage(imageBuffer, mimeType = 'image/jpeg') {
    await this.init();

    const uploadId = `upload_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const uploadUrl = `https://rupload.facebook.com/messenger_image/${uploadId}`;

    const res = await this.client.post(uploadUrl, imageBuffer, {
      headers: {
        'Cookie': this.cookies,
        'Content-Type': mimeType,
        'X-Entity-Length': imageBuffer.length.toString(),
        'X-Entity-Name': `media_${Date.now()}.jpg`,
        'X-Entity-Type': mimeType,
        'Offset': '0',
        ...(this.fb_dtsg ? { 'X-FB-DTSG': this.fb_dtsg } : {})
      }
    });

    if (!res.data || !res.data.media_id) {
      throw new Error(`Gagal upload media ke Meta AI: ${JSON.stringify(res.data)}`);
    }

    return res.data.media_id;
  }

  /**
   * 3. Ekstrak Keyframes dari Video untuk OCR Visual Video
   */
  async extractVideoFrames(videoBuffer, frameCount = 4) {
    let ffmpegMod;
    try {
      const ffmpegPkg = await import('fluent-ffmpeg');
      const installerPkg = await import('@ffmpeg-installer/ffmpeg');
      ffmpegMod = ffmpegPkg.default || ffmpegPkg;
      const installer = installerPkg.default || installerPkg;
      if (installer && installer.path) {
        ffmpegMod.setFfmpegPath(installer.path);
      }
    } catch {
      console.warn('[!] Modul fluent-ffmpeg / @ffmpeg-installer/ffmpeg belum terinstal. Melewati ekstraksi video.');
      return [];
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta_vid_'));
    const inputPath = path.join(tempDir, 'input.mp4');
    fs.writeFileSync(inputPath, videoBuffer);

    return new Promise((resolve, reject) => {
      ffmpegMod(inputPath)
        .on('end', () => {
          try {
            const files = fs.readdirSync(tempDir)
              .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
              .sort();

            const buffers = files.map(f => fs.readFileSync(path.join(tempDir, f)));
            fs.rmSync(tempDir, { recursive: true, force: true });
            resolve(buffers);
          } catch (e) {
            reject(e);
          }
        })
        .on('error', (err) => {
          fs.rmSync(tempDir, { recursive: true, force: true });
          reject(err);
        })
        .screenshots({
          count: frameCount,
          folder: tempDir,
          filename: 'frame_%i.jpg',
          size: '1280x?'
        });
    });
  }

  /**
   * 4. Konversi Halaman PDF Hasil Scan menjadi Gambar
   */
  async renderPdfPagesToImages(pdfBuffer, maxPages = 4) {
    let sharpMod;
    try {
      const s = await import('sharp');
      sharpMod = s.default || s;
    } catch {
      return [];
    }

    try {
      const { pdf } = await import('pdf-to-img');
      const images = [];
      const document = await pdf(pdfBuffer, { scale: 2.0 });

      let pageNum = 0;
      for await (const pageBuffer of document) {
        if (pageNum >= maxPages) break;
        const jpegBuffer = await sharpMod(pageBuffer).jpeg({ quality: 85 }).toBuffer();
        images.push(jpegBuffer);
        pageNum++;
      }
      return images;
    } catch {
      return [];
    }
  }

  /**
   * 5. Pipeline Pre-Processing Universal (Gambar, Video, PDF, DOCX, XLSX, TXT)
   */
  async preprocessFile(fileBuffer, mimeType = '', fileName = '') {
    const ext = path.extname(fileName).toLowerCase();
    const imageBuffers = [];
    let extractedText = '';
    let mediaTypeLabel = 'Teks';

    // A. GAMBAR (JPG, PNG, WebP)
    if (mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      mediaTypeLabel = 'Gambar';
      try {
        const sharpMod = (await import('sharp')).default;
        const cleanJpeg = await sharpMod(fileBuffer).jpeg({ quality: 90 }).toBuffer();
        imageBuffers.push(cleanJpeg);
      } catch {
        // Fallback jika sharp belum terpasang: gunakan buffer asli langsung
        imageBuffers.push(fileBuffer);
      }
    }

    // B. VIDEO (MP4, MKV, MOV, WEBM)
    else if (mimeType.startsWith('video/') || ['.mp4', '.mkv', '.mov', '.webm'].includes(ext)) {
      mediaTypeLabel = 'Video (Diekstrak menjadi urutan Frame untuk OCR)';
      const frames = await this.extractVideoFrames(fileBuffer, 4);
      imageBuffers.push(...frames);
    }

    // C. DOKUMEN PDF (Teks Digital maupun PDF Hasil Scan)
    else if (mimeType === 'application/pdf' || ext === '.pdf') {
      try {
        const pdfParseMod = (await import('pdf-parse')).default;
        const pdfData = await pdfParseMod(fileBuffer);
        const rawText = (pdfData.text || '').trim();

        if (rawText.length < 30) {
          mediaTypeLabel = 'Dokumen PDF Hasil Scan (OCR Visual per Halaman)';
          const pageImages = await this.renderPdfPagesToImages(fileBuffer, 4);
          imageBuffers.push(...pageImages);
        } else {
          mediaTypeLabel = `Dokumen PDF Digital (${pdfData.numpages} halaman)`;
          extractedText = rawText;
        }
      } catch (err) {
        mediaTypeLabel = 'Dokumen PDF';
        extractedText = `[Gagal parsing PDF: ${err.message}]`;
      }
    }

    // D. MICROSOFT WORD (.docx)
    else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      mediaTypeLabel = 'Dokumen Word (DOCX)';
      try {
        const mammothMod = (await import('mammoth')).default;
        const result = await mammothMod.extractRawText({ buffer: fileBuffer });
        extractedText = result.value.trim();
      } catch (err) {
        extractedText = `[Gagal parsing DOCX: ${err.message}]`;
      }
    }

    // E. EXCEL / SPREADSHEET (.xlsx, .xls, .csv)
    else if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType === 'text/csv' ||
      ['.xlsx', '.xls', '.csv'].includes(ext)
    ) {
      mediaTypeLabel = 'Dokumen Spreadsheet (Excel/CSV)';
      try {
        const XLSX = (await import('xlsx')).default || (await import('xlsx'));
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetTexts = workbook.SheetNames.map(name => {
          const csvData = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
          return `--- Sheet: ${name} ---\n${csvData}`;
        });
        extractedText = sheetTexts.join('\n\n');
      } catch (err) {
        extractedText = `[Gagal parsing Excel/CSV: ${err.message}]`;
      }
    }

    // F. FILE TEKS / KODE LAINNYA (.txt, .json, .js, .html, .log, dll.)
    else {
      mediaTypeLabel = `File Teks/Dokumen (${fileName || mimeType || 'Raw'})`;
      extractedText = fileBuffer.toString('utf-8');
    }

    return {
      mediaTypeLabel,
      imageBuffers,
      extractedText
    };
  }

  /**
   * 6. Fungsi Utama: Ask Meta AI (Mendukung Text-to-Text + Multi-Format OCR)
   */
  async ask(prompt, options = {}) {
    await this.init();

    const {
      fileBuffer = null,
      mimeType = '',
      fileName = '',
      thinkingMode = true,
      conversationId = crypto.randomUUID()
    } = options;

    let attachments = [];
    let documentContext = '';

    // Jika ada file (Gambar, Video, PDF, DOCX, XLSX, dll.)
    if (fileBuffer) {
      const processed = await this.preprocessFile(fileBuffer, mimeType, fileName);

      // 1. Jika menghasilkan gambar (Gambar asli, Frame Video, atau Halaman PDF Scan), upload semua ke Meta AI
      if (processed.imageBuffers.length > 0) {
        const mediaIds = await Promise.all(
          processed.imageBuffers.map(buf => this.uploadSingleImage(buf, 'image/jpeg'))
        );

        attachments = mediaIds.map(id => ({
          media_id: id,
          attachment_type: 'IMAGE'
        }));
      }

      // 2. Jika menghasilkan teks hasil ekstraksi dokumen
      if (processed.extractedText) {
        const clippedText = processed.extractedText.slice(0, 25000);
        documentContext = `\n\n[ISI DOKUMEN (${processed.mediaTypeLabel})]:\n"""\n${clippedText}\n"""\n`;
      } else {
        documentContext = `\n\n[INFO MEDIA: Lampiran berupa ${processed.mediaTypeLabel} dengan ${attachments.length} visual.]\n`;
      }
    }

    // Susun Prompt dengan instruksi Berpikir (Chain-of-Thought) & OCR
    const systemInstruction = thinkingMode
      ? `[Instruksi Sistem: Berpikirlah secara mendalam dan sistematis tahap demi tahap (Chain-of-Thought).\n` +
        `1. Jika terdapat gambar, frame video, atau halaman dokumen scan, lakukan OCR (baca seluruh teks, angka, tabel, atau subtitle di dalamnya) secara teliti.\n` +
        `2. Jika terdapat isi dokumen teks/tabel, analisis datanya secara akurat.\n` +
        `3. Berikan proses analisis diikuti kesimpulan akhir yang jelas.]\n\n`
      : '';

    const finalPrompt = `${systemInstruction}Pertanyaan/Instruksi: ${prompt}${documentContext}`;
    const offlineThreadingId = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;

    const variables = {
      message: { sensitive_string_value: finalPrompt },
      externalConversationId: conversationId,
      offlineThreadingId: offlineThreadingId,
      suggestedPromptIndex: null,
      flashVideoRecapInput: { images: [] },
      flashPreviewInput: null,
      promptPrefix: null,
      entrypoint: 'ABRA__CHAT__TEXT',
      icebreaker_type: 'TEXT',
      attachments: attachments,
      mode: thinkingMode ? 'think_hard' : 'think_fast',
      __relay_internal__pv__AbraDebugDevOnlyrelayprovider: false,
      __relay_internal__pv__WebPixelRatiorelayprovider: 1
    };

    const payload = new URLSearchParams({
      lsd: this.lsd,
      ...(this.fb_dtsg ? { fb_dtsg: this.fb_dtsg } : {}),
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'useAbraSendMessageMutation',
      variables: JSON.stringify(variables),
      server_timestamps: 'true',
      doc_id: this.DOC_ID_SEND_MESSAGE
    });

    const response = await this.client.post('https://www.meta.ai/api/graphql/', payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-LSD': this.lsd,
        'X-FB-Friendly-Name': 'useAbraSendMessageMutation',
        'Cookie': this.cookies
      },
      responseType: 'text'
    });

    return this.parseStreamResponse(response.data);
  }

  /**
   * 7. Parser Stream Multipart JSON dari Meta AI
   */
  parseStreamResponse(rawText) {
    const lines = rawText.split(/\r?\n/);
    let latestText = '';
    let reasoningText = '';

    for (const line of lines) {
      const cleaned = line.replace(/^for\s*\(;;\);/, '').trim();
      if (!cleaned.startsWith('{')) continue;

      try {
        const json = JSON.parse(cleaned);
        const botMsg =
          json?.data?.node?.bot_response_message ||
          json?.data?.xab_abra_send_message?.bot_response_message;

        if (botMsg) {
          if (botMsg.snippet) {
            latestText = botMsg.snippet;
          } else if (botMsg.content?.text) {
            latestText = botMsg.content.text;
          }

          if (botMsg.reasoning_steps || botMsg.thought_summary) {
            reasoningText = botMsg.thought_summary || JSON.stringify(botMsg.reasoning_steps);
          }
        }
      } catch (e) {
        // Lewati baris non-JSON
      }
    }

    if (!latestText) {
      throw new Error('Respons Meta AI kosong. Pastikan Cookie (abra_sess/ecto_1_sess) masih aktif.');
    }

    return {
      thinking: reasoningText || null,
      answer: latestText
    };
  }
}

export default MetaAIMultimodal;
