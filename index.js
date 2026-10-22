import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import MetaAiPuppeteer from './scrape/metaAiPuppeteer.js';

// ========================================================
// KONFIGURASI DARI .ENV
// ========================================================
let {
  AI_PROVIDER = 'nvidia',
  NVIDIA_API_KEY,
  NVIDIA_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b',
  ENABLE_FALLBACK = 'true',
  TARGET_USERS = '*',
  THREADS_ACCESS_TOKEN = '',
  BOT_USERNAME = '',
  CHECK_INTERVAL_SECONDS = 30,
  SYSTEM_PROMPT = ''
} = process.env;

// Persona / Instruksi Sistem AI
const AI_SYSTEM_PROMPT = SYSTEM_PROMPT || 
`Anda adalah asisten pakar multidisiplin yang menjunjung tinggi kejujuran, objektivitas, dan profesionalisme. Anda memiliki wawasan luas di berbagai cabang ilmu pengetahuan, dengan keahlian mendalam pada analisis politik dan ekonomi, baik di tingkat nasional (Indonesia) maupun global. Dalam setiap tanggapan, berikan analisis yang tajam, terstruktur, dan berbasis data atau fakta yang valid. Sampaikan kebenaran secara lugas tanpa bias, koreksi asumsi yang keliru secara konstruktif, dan nyatakan secara transparan jika suatu informasi bersifat spekulatif atau belum terverifikasi.

PANDUAN FORMAT (Platform Threads):
- Sampaikan analisis Anda secara padat, lugas, berbobot, tajam, dan tidak bertele-tele.
- Jika menganalisis atau membaca gambar/dokumen/infografis (Vision/OCR), jelaskan poin-poin pentingnya secara rinci dan tuntas. Sistem akan otomatis membagi balasan menjadi rangkaian thread bersambung jika teks panjang.`;

// Bersihkan token dan username dari karakter aneh/spasi/tanda kutip
const CLEAN_TOKEN = (THREADS_ACCESS_TOKEN || '').replace(/["'\s]/g, '');
const CLEAN_BOT_USERNAME = (BOT_USERNAME || '').replace(/[@"'\s]/g, '').toLowerCase();

// Waktu bot dinyalakan (untuk menyaring pesan lama)
const BOT_START_TIME = Date.now();

const DB_FILE = './replied_ids.json';

// Inisialisasi Klien OpenAI untuk NVIDIA
const nvidiaClient = NVIDIA_API_KEY
  ? new OpenAI({
      apiKey: NVIDIA_API_KEY.replace(/["'\s]/g, ''),
      baseURL: 'https://integrate.api.nvidia.com/v1'
    })
  : null;

// ========================================================
// FORMAT TAMPILAN COOL ASCII LOGGER
// ========================================================
function logIncomingMessage({ type, from, text }) {
  const now = new Date().toLocaleString('id-ID');

  console.log('\n\x1b[36m╔══════『 PESAN MASUK THREADS 』══════════════════════╗\x1b[0m');
  console.log(`\x1b[36m║\x1b[0m ⏰ \x1b[1mWaktu\x1b[0m : ${now}`);
  console.log(`\x1b[36m║\x1b[0m 👤 \x1b[1mFrom\x1b[0m  : @${from}`);
  console.log(`\x1b[36m║\x1b[0m 💬 \x1b[1mText\x1b[0m  : ${text}`);
  console.log(`\x1b[36m║\x1b[0m 🏷️ \x1b[1mTipe\x1b[0m  : ${type.toUpperCase()}`);
  console.log('\x1b[36m╚═════════════════════════════════════════════════════╝\x1b[0m');
}

function logAiReply({ provider, model, reply, to }) {
  console.log('\x1b[32m╔══════『 BALASAN AI TERKIRIM 』══════════════════════╗\x1b[0m');
  console.log(`\x1b[32m║\x1b[0m ⚡ \x1b[1mEngine\x1b[0m : ${provider.toUpperCase()} (${model})`);
  console.log(`\x1b[32m║\x1b[0m 🎯 \x1b[1mTo\x1b[0m     : @${to}`);
  console.log(`\x1b[32m║\x1b[0m 🤖 \x1b[1mRespon\x1b[0m : ${reply}`);
  console.log(`\x1b[32m║\x1b[0m ✅ \x1b[1mStatus\x1b[0m : Berhasil Terkirim ke Threads`);
  console.log('\x1b[32m╚═════════════════════════════════════════════════════╝\x1b[0m\n');
}

function printBanner() {
  console.log(`\x1b[36m
  ██████╗  █████╗ ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ 
  ██╔══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██║██╔══██╗██╔══██╗
  ██████╔╝███████║ ╚████╔╝ ██╔████╔██║██║██████╔╝███████║
  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║╚██╔╝██║██║██╔══██╗██╔══██║
  ██║     ██║  ██║   ██║   ██║ ╚═╝ ██║██║██║  ██║██║  ██║
  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

             ⚡  P A Y M I R A   B O T   A I  ⚡
\x1b[0m\n`);
}

// ========================================================
// DATABASE PENYIMPAN ID KOMENTAR LOKAL (SET IN-MEMORY + FILE)
// ========================================================
function getRepliedIds() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

const repliedIdsSet = new Set(getRepliedIds());

function hasReplied(id) {
  if (!id) return false;
  return repliedIdsSet.has(id);
}

function saveRepliedId(id) {
  if (!id) return;
  repliedIdsSet.add(id);
  const ids = Array.from(repliedIdsSet);
  if (ids.length > 2000) {
    const toRemove = ids.slice(0, ids.length - 2000);
    for (const rem of toRemove) repliedIdsSet.delete(rem);
  }
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(Array.from(repliedIdsSet), null, 2));
  } catch (err) {
    console.warn('[!] Gagal menulis ke replied_ids.json:', err.message);
  }
}

// Bersihkan respon AI dari tag berpikir <think>
function cleanAiResponse(text) {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// ========================================================
// GENERASI RESPON AI (META AI SCRAPER & NVIDIA NIM)
// ========================================================

// Handler untuk integrasi scraper Meta AI (Puppeteer)
let metaAiInstance = null;

function getMetaAIClient() {
  if (!metaAiInstance) {
    metaAiInstance = new MetaAiPuppeteer(process.env.META_AI_COOKIE);
  }
  return metaAiInstance;
}

async function callMetaAI(prompt, media = null) {
  const client = getMetaAIClient();

  let options = {};
  if (media) {
    if (media.buffer || media.fileBuffer) {
      options.fileBuffer = media.buffer || media.fileBuffer;
      options.mimeType = media.mimeType || 'image/jpeg';
    } else if (typeof media === 'string' && media.startsWith('data:')) {
      const base64Data = media.replace(/^data:[^;]+;base64,/, '');
      const mimeMatch = media.match(/^data:([^;]+);base64,/);
      options.fileBuffer = Buffer.from(base64Data, 'base64');
      options.mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    }
  }

  const result = await client.ask(prompt, options);
  return {
    answer: cleanAiResponse(result.answer),
    provider: 'Meta AI',
    model: 'Web Scraper (Multimodal OCR)'
  };
}

async function callNvidia(prompt, media = null) {
  if (!nvidiaClient) throw new Error('NVIDIA API Key belum dikonfigurasi di .env!');
  
  let userContent = prompt;
  const imageBase64 = media?.base64 || (typeof media === 'string' && media.startsWith('data:') ? media : null);
  // Model NVIDIA Nemotron adalah model teks murni, hanya sertakan image_url jika model mendukung vision
  if (imageBase64 && media?.mimeType?.startsWith('image/') && NVIDIA_MODEL.toLowerCase().includes('vision')) {
    userContent = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageBase64 } }
    ];
  }

  const response = await nvidiaClient.chat.completions.create({
    model: NVIDIA_MODEL,
    messages: [
      {
        role: 'system',
        content: AI_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: userContent
      }
    ],
    temperature: 0.8,
    max_tokens: 800
  });

  const content = response.choices[0]?.message?.content || '';
  return {
    answer: cleanAiResponse(content),
    provider: 'NVIDIA',
    model: NVIDIA_MODEL
  };
}

async function generateAIResponse(prompt, media = null) {
  const isFallbackEnabled = ENABLE_FALLBACK === 'true';

  if (AI_PROVIDER.toLowerCase() === 'meta-ai' || AI_PROVIDER.toLowerCase() === 'meta') {
    try {
      return await callMetaAI(prompt, media);
    } catch (err) {
      console.warn(`[!] Meta AI gagal (${err.message})`);
      if (isFallbackEnabled && nvidiaClient) {
        console.log(`[↺] Beralih otomatis ke Fallback NVIDIA NIM...`);
        return await callNvidia(prompt, media);
      }
      throw err;
    }
  } else {
    try {
      return await callNvidia(prompt, media);
    } catch (err) {
      console.warn(`[!] NVIDIA gagal (${err.message})`);
      if (isFallbackEnabled) {
        console.log(`[↺] Beralih otomatis ke Fallback Meta AI...`);
        return await callMetaAI(prompt, media);
      }
      throw err;
    }
  }
}

// ========================================================
// THREADS GRAPH API
// ========================================================
async function getRecentThreads() {
  const url = `https://graph.threads.net/v1.0/me/threads?fields=id,text,timestamp,media_type,media_url,thumbnail_url&limit=5&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Threads API (getRecentThreads) Error: ${JSON.stringify(data.error || data)}`);
  }
  return data.data || [];
}

async function getThreadReplies(threadId) {
  const url = `https://graph.threads.net/v1.0/${threadId}/conversation?fields=id,text,username,timestamp,media_type,media_url,thumbnail_url&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return [];
  return data.data || [];
}

async function getMentions() {
  const url = `https://graph.threads.net/v1.0/me/mentions?fields=id,text,username,timestamp,replied_to,root_post,media_type,media_url,thumbnail_url&limit=10&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return [];
  return data.data || [];
}

// Mengambil balasan yang pernah dikirim oleh bot (untuk memantau balasan lanjutan dari user)
async function getMyRecentReplies() {
  const url = `https://graph.threads.net/v1.0/me/replies?fields=id,text,timestamp&limit=10&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return [];
  return data.data || [];
}

// Mengambil balasan langsung ke sebuah postingan / balasan bot
async function getRepliesToMedia(mediaId) {
  if (!mediaId) return [];
  const url = `https://graph.threads.net/v1.0/${mediaId}/replies?fields=id,text,username,timestamp,media_type,media_url,thumbnail_url&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return [];
  return data.data || [];
}

// Mengambil detail lengkap postingan induk (teks + gambar/video thumbnail)
async function getPostDetail(postId) {
  if (!postId) return null;
  try {
    const res = await fetch(`https://graph.threads.net/v1.0/${postId}?fields=id,text,username,media_type,media_url,thumbnail_url&access_token=${CLEAN_TOKEN}`);
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

// ========================================================
// MEDIA ATTACHMENT & OCR FETCHER (GAMBAR, VIDEO, DOKUMEN)
// ========================================================

// Download media (gambar, video, dokumen) dari URL dan siapkan buffer & base64
async function fetchMediaAttachment(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // Batasi file maks 25MB agar hemat memori & cepat diproses
    if (buffer.length > 25 * 1024 * 1024) {
      console.warn(`[!] Ukuran media melebihi 25MB (${(buffer.length / 1024 / 1024).toFixed(1)}MB), diabaikan.`);
      return null;
    }

    const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;
    return {
      buffer,
      mimeType: contentType,
      base64,
      size: buffer.length
    };
  } catch (err) {
    console.warn('[!] Gagal mengunduh lampiran media/dokumen:', err.message);
    return null;
  }
}

// Mendeteksi dan mengunduh lampiran dari objek Threads (Gambar, Video, atau Link Dokumen)
async function detectMediaAttachment(targetObj, relatedText = '') {
  if (!targetObj) return null;

  // 1. Cek apakah ada link dokumen di dalam teks (PDF, DOCX, XLSX, TXT, CSV)
  const combinedText = `${targetObj.text || ''} ${relatedText || ''}`;
  const docUrlMatch = combinedText.match(/https?:\/\/[^\s]+?\.(pdf|docx|xlsx|txt|csv)(\?[^\s]*)?/i);
  if (docUrlMatch) {
    const docUrl = docUrlMatch[0].replace(/[),.]+$/, '');
    console.log(`[📄] Mendeteksi link dokumen di dalam teks: ${docUrl}`);
    const docMedia = await fetchMediaAttachment(docUrl);
    if (docMedia) return docMedia;
  }

  // 2. Cek apakah ada media video (VIDEO)
  if (targetObj.media_type === 'VIDEO') {
    if (targetObj.media_url) {
      console.log(`[🎥] Mendeteksi video pada Threads, mengunduh media video...`);
      const videoMedia = await fetchMediaAttachment(targetObj.media_url);
      if (videoMedia) return videoMedia;
    }
    // Jika video gagal diunduh atau terlalu besar, gunakan cover thumbnail-nya
    if (targetObj.thumbnail_url) {
      console.log(`[📷] Menggunakan cover thumbnail video untuk OCR visual...`);
      return await fetchMediaAttachment(targetObj.thumbnail_url);
    }
  }

  // 3. Cek apakah ada gambar langsung di Threads (IMAGE / CAROUSEL)
  const imageUrl = targetObj.media_url || targetObj.thumbnail_url;
  if (imageUrl && targetObj.media_type !== 'TEXT_POST') {
    console.log(`[📷] Mendeteksi gambar pada postingan Threads, mengunduh untuk analisis OCR...`);
    return await fetchMediaAttachment(imageUrl);
  }

  // 4. Cek apakah ada link gambar langsung di dalam teks (.jpg, .png, .webp)
  const imgUrlMatch = combinedText.match(/https?:\/\/[^\s]+?\.(jpg|jpeg|png|webp)(\?[^\s]*)?/i);
  if (imgUrlMatch) {
    const directImgUrl = imgUrlMatch[0].replace(/[),.]+$/, '');
    console.log(`[📷] Mendeteksi link gambar di dalam teks: ${directImgUrl}`);
    return await fetchMediaAttachment(directImgUrl);
  }

  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendThreadReply(replyToId, text) {
  // Step 1: Buat Media Container Reply
  const createUrl = `https://graph.threads.net/v1.0/me/threads`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'TEXT',
      text: text,
      reply_to_id: replyToId,
      access_token: CLEAN_TOKEN
    })
  });

  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) {
    throw new Error(`Gagal membuat container reply: ${JSON.stringify(createData.error || createData)}`);
  }

  const containerId = createData.id;

  // Jeda agar server Meta selesai memproses container (mencegah error 4279009 / Media Not Found)
  await sleep(2500);

  // Step 2: Publish Reply dengan sistem Retry Otomatis
  const publishUrl = `https://graph.threads.net/v1.0/me/threads_publish`;
  let lastPublishError = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const publishRes = await fetch(publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: CLEAN_TOKEN
        })
      });

      const publishData = await publishRes.json();

      if (publishRes.ok && publishData.id) {
        return publishData.id;
      }

      // Jika error 4279009 (Media belum siap di server Meta), tunggu dan coba lagi
      if (publishData.error?.error_subcode === 4279009 || publishData.error?.code === 24) {
        console.log(`[-] Sinkronisasi server Meta (percobaan ${attempt}/4)...`);
        await sleep(2000 * attempt);
        lastPublishError = publishData.error;
        continue;
      }

      throw new Error(`Gagal publish reply: ${JSON.stringify(publishData.error || publishData)}`);
    } catch (err) {
      lastPublishError = err;
      await sleep(2000);
    }
  }

  throw new Error(`Gagal publish reply setelah retry: ${JSON.stringify(lastPublishError)}`);
}

// Membagi teks panjang menjadi beberapa bagian thread (looping) jika melebihi batas karakter Threads (~430 karakter)
function splitTextIntoChunks(text, maxChunkLength = 430) {
  if (!text) return [];
  if (text.length <= maxChunkLength) return [text];

  const rawChunks = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkLength) {
      rawChunks.push(remaining);
      break;
    }

    // Cari titik potong alami: enter (\n), titik kalimat (. ), atau spasi
    let sliceIndex = remaining.lastIndexOf('\n', maxChunkLength);
    if (sliceIndex === -1 || sliceIndex < maxChunkLength * 0.5) {
      sliceIndex = remaining.lastIndexOf('. ', maxChunkLength);
      if (sliceIndex !== -1 && sliceIndex >= maxChunkLength * 0.4) {
        sliceIndex += 1;
      }
    }
    if (sliceIndex === -1 || sliceIndex < maxChunkLength * 0.4) {
      sliceIndex = remaining.lastIndexOf(' ', maxChunkLength);
    }
    if (sliceIndex === -1) {
      sliceIndex = maxChunkLength;
    }

    const chunk = remaining.substring(0, sliceIndex).trim();
    if (chunk) rawChunks.push(chunk);
    remaining = remaining.substring(sliceIndex).trim();
  }

  // Jika terbagi lebih dari 1 bagian, tambahkan indikator [1/N], [2/N]
  if (rawChunks.length > 1) {
    return rawChunks.map((c, i) => `${c}\n\n[${i + 1}/${rawChunks.length}]`);
  }

  return rawChunks;
}

// Mengirim balasan berantai (thread chain) jika teks terbagi menjadi beberapa bagian
async function sendThreadReplyChain(targetId, text) {
  const chunks = splitTextIntoChunks(text, 430);
  let parentReplyId = targetId;
  const sentIds = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    if (i > 0) {
      console.log(`[⏳] Jeda 2 detik sebelum mengirim bagian berikutnya (${i + 1}/${chunks.length})...`);
      await sleep(2000);
    }
    const newReplyId = await sendThreadReply(parentReplyId, chunkText);
    saveRepliedId(newReplyId); // tandai id balasan sendiri agar bot tidak membalas dirinya sendiri
    sentIds.push(newReplyId);
    parentReplyId = newReplyId; // sambungkan thread ke postingan balasan sebelumnya
  }

  return { sentIds, totalParts: chunks.length };
}

function isUserAllowed(username) {
  if (!username) return false;
  if (TARGET_USERS.trim() === '*') return true;
  const allowedList = TARGET_USERS.toLowerCase().split(',').map(u => u.trim());
  return allowedList.includes(username.toLowerCase());
}

// ========================================================
// LOOP UTAMA POLLING
// ========================================================
let isProcessing = false;

async function checkAndReply() {
  if (!CLEAN_TOKEN || CLEAN_TOKEN.includes('masukkan_')) {
    console.warn('[!] THREADS_ACCESS_TOKEN belum diisi di file .env');
    return;
  }

  const now = new Date().toLocaleTimeString('id-ID');

  try {
    let foundNew = 0;

    // 1. Cek komentar di postingan akun bot sendiri
    const myThreads = await getRecentThreads();
    for (const post of myThreads) {
      const replies = await getThreadReplies(post.id);

      for (const reply of replies) {
        if (hasReplied(reply.id)) continue;
        if (reply.username && reply.username.toLowerCase() === CLEAN_BOT_USERNAME) continue;
        if (!isUserAllowed(reply.username)) continue;

        // Jika komentar tersebut menyebut @bot, serahkan ke handler getMentions()
        // agar konteks postingan induk dan gambar/video diproses secara lengkap tanpa duplikasi
        if (reply.text && reply.text.toLowerCase().includes('@' + CLEAN_BOT_USERNAME)) {
          continue;
        }

        // Abaikan pesan masa lalu yang dibuat sebelum bot dinyalakan
        const replyTime = new Date(reply.timestamp).getTime();
        if (replyTime < BOT_START_TIME - 30000) {
          saveRepliedId(reply.id);
          continue;
        }

        isProcessing = true;
        try {
          foundNew++;
          logIncomingMessage({
            type: 'Komentar Postingan',
            from: reply.username,
            text: reply.text
          });

          // Cek apakah komentar atau postingan memiliki media (gambar, video, atau link dokumen)
          let mediaAttachment = await detectMediaAttachment(reply, post.text);
          if (!mediaAttachment && post) {
            mediaAttachment = await detectMediaAttachment(post, reply.text);
          }

          let replyText = (reply.text || '').replace(/@\w+/g, '').trim();
          if (!replyText) {
            replyText = mediaAttachment
              ? 'Tolong baca dan lakukan OCR terhadap teks pada lampiran (gambar/video/dokumen) ini serta jelaskan isinya secara tuntas.'
              : 'Halo!';
          }

          let fullPrompt = replyText;
          if (post.text) {
            fullPrompt = `Konteks Postingan: "${post.text}"\nKomentar dari @${reply.username}: "${replyText}"`;
          }

          // GENERASI JAWABAN (VISION / OCR / MULTIMODAL / TEKS)
          const aiResult = await generateAIResponse(fullPrompt, mediaAttachment);

          // KIRIM REPLY BERANTAI (LOOPING/CHUNKING)
          const chainResult = await sendThreadReplyChain(reply.id, aiResult.answer);
          saveRepliedId(reply.id);

          // LOG BALASAN AI (ASCII BOX)
          logAiReply({
            provider: aiResult.provider,
            model: aiResult.model,
            reply: aiResult.answer + (chainResult.totalParts > 1 ? ` (${chainResult.totalParts} bagian bersambung)` : ''),
            to: reply.username
          });
        } catch (itemErr) {
          console.error(`[!] Gagal memproses komentar dari @${reply.username}:`, itemErr.message);
          saveRepliedId(reply.id);
        } finally {
          isProcessing = false;
        }
      }
    }

    // 2. Cek mention (@username) dari pengguna lain
    const mentions = await getMentions();
    for (const mention of mentions) {
      if (hasReplied(mention.id)) continue;
      if (mention.username && mention.username.toLowerCase() === CLEAN_BOT_USERNAME) continue;
      if (!isUserAllowed(mention.username)) continue;

      // Abaikan pesan masa lalu yang dibuat sebelum bot dinyalakan
      const mentionTime = new Date(mention.timestamp).getTime();
      if (mentionTime < BOT_START_TIME - 30000) {
        saveRepliedId(mention.id);
        continue;
      }

      isProcessing = true;
      try {
        foundNew++;
        logIncomingMessage({
          type: 'Mention Akun',
          from: mention.username,
          text: mention.text
        });

        // Ambil teks & media dari postingan induk agar AI paham konteks visual / dokumen
        let contextText = '';
        let mediaAttachment = null;
        const parentId = mention.replied_to?.id || mention.root_post?.id;

        if (parentId && parentId !== mention.id) {
          const parentDetail = await getPostDetail(parentId);
          if (parentDetail) {
            contextText = parentDetail.text || '';
            mediaAttachment = await detectMediaAttachment(parentDetail, mention.text);
          }
        }

        // Jika tidak ada di postingan induk, cek apakah mention langsung melampirkan media/dokumen
        if (!mediaAttachment) {
          mediaAttachment = await detectMediaAttachment(mention, contextText);
        }

        // Hilangkan tag @username dari prompt
        let cleanPrompt = (mention.text || '').replace(/@\w+/g, '').trim();
        if (!cleanPrompt) {
          cleanPrompt = mediaAttachment
            ? 'Tolong baca dan lakukan OCR terhadap teks pada lampiran (gambar/video/dokumen) ini serta jelaskan isinya secara tuntas.'
            : 'Halo! Ada yang bisa saya bantu?';
        }

        let fullPrompt = cleanPrompt;
        if (contextText) {
          fullPrompt = `Konteks Postingan/Media yang dibahas: "${contextText}"\nPertanyaan/Komentar dari @${mention.username}: "${cleanPrompt}"`;
        }

        // GENERASI JAWABAN (VISION / OCR / MULTIMODAL / TEKS)
        const aiResult = await generateAIResponse(fullPrompt, mediaAttachment);

        // KIRIM REPLY BERANTAI (LOOPING/CHUNKING)
        const chainResult = await sendThreadReplyChain(mention.id, aiResult.answer);
        saveRepliedId(mention.id);

        // LOG BALASAN AI (ASCII BOX)
        logAiReply({
          provider: aiResult.provider,
          model: aiResult.model,
          reply: aiResult.answer + (chainResult.totalParts > 1 ? ` (${chainResult.totalParts} bagian bersambung)` : ''),
          to: mention.username
        });
      } catch (itemErr) {
        console.error(`[!] Gagal memproses mention dari @${mention.username}:`, itemErr.message);
        saveRepliedId(mention.id);
      } finally {
        isProcessing = false;
      }
    }

    // 3. Cek balasan lanjutan (sub-reply) ke komentar yang pernah dikirim oleh bot
    const myReplies = await getMyRecentReplies();
    for (const botReply of myReplies) {
      const subReplies = await getRepliesToMedia(botReply.id);
      for (const sub of subReplies) {
        if (hasReplied(sub.id)) continue;
        if (sub.username && sub.username.toLowerCase() === CLEAN_BOT_USERNAME) continue;
        if (!isUserAllowed(sub.username)) continue;

        // Abaikan pesan yang dibuat sebelum bot dinyalakan
        const subTime = new Date(sub.timestamp).getTime();
        if (subTime < BOT_START_TIME - 30000) {
          saveRepliedId(sub.id);
          continue;
        }

        isProcessing = true;
        try {
          foundNew++;
          logIncomingMessage({
            type: 'Balasan Komentar Bot (Thread Sub-Reply)',
            from: sub.username,
            text: sub.text
          });

          // Cek apakah balasan ini melampirkan media/gambar/dokumen
          let mediaAttachment = await detectMediaAttachment(sub, botReply.text);

          let cleanText = (sub.text || '').replace(/@\w+/g, '').trim();
          if (!cleanText) {
            cleanText = mediaAttachment
              ? 'Tolong baca dan lakukan OCR terhadap teks pada lampiran (gambar/video/dokumen) ini.'
              : 'Halo!';
          }

          let fullPrompt = cleanText;
          if (botReply.text) {
            fullPrompt = `Konteks Pesan Bot Sebelumnya: "${botReply.text}"\nBalasan Lanjutan dari @${sub.username}: "${cleanText}"`;
          }

          // GENERASI JAWABAN (VISION / OCR / MULTIMODAL / TEKS)
          const aiResult = await generateAIResponse(fullPrompt, mediaAttachment);

          // KIRIM REPLY BERANTAI (LOOPING/CHUNKING)
          const chainResult = await sendThreadReplyChain(sub.id, aiResult.answer);
          saveRepliedId(sub.id);

          // LOG BALASAN AI (ASCII BOX)
          logAiReply({
            provider: aiResult.provider,
            model: aiResult.model,
            reply: aiResult.answer + (chainResult.totalParts > 1 ? ` (${chainResult.totalParts} bagian bersambung)` : ''),
            to: sub.username
          });
        } catch (itemErr) {
          console.error(`[!] Gagal memproses balasan lanjutan dari @${sub.username}:`, itemErr.message);
          saveRepliedId(sub.id);
        } finally {
          isProcessing = false;
        }
      }
    }

  } catch (err) {
    isProcessing = false;
    console.error(`\n[!] Error saat polling [${now}]:`, err.message);
  }
}

// ========================================================
// START BOT
// ========================================================
async function start() {
  printBanner();

  // Sinkronisasi otomatis saat bot baru diupload/dinyalakan
  // Ini menandai semua mention & komentar lama agar bot TIDAK membalas pesan masa lalu
  console.log('[*] Menyelaraskan pesan lama Threads agar tidak terjadi spam...');
  try {
    const [mentions, threads, myReplies] = await Promise.all([
      getMentions(),
      getRecentThreads(),
      getMyRecentReplies()
    ]);
    for (const m of mentions) saveRepliedId(m.id);
    for (const t of threads) {
      const replies = await getThreadReplies(t.id);
      for (const r of replies) saveRepliedId(r.id);
    }
    for (const r of myReplies) {
      const subReplies = await getRepliesToMedia(r.id);
      for (const s of subReplies) saveRepliedId(s.id);
    }
    console.log('[✓] Sinkronisasi selesai. Bot siap merespon pesan baru!\n');
  } catch (e) {
    console.warn('[!] Catatan sinkronisasi awal:', e.message);
  }

  console.log(`[i] ⚡ PAYMIRA BOT AI aktif & memantau setiap ${CHECK_INTERVAL_SECONDS} detik...`);
  console.log('[i] Menunggu mention atau komentar masuk dari Threads...\n');

  checkAndReply();
  setInterval(checkAndReply, parseInt(CHECK_INTERVAL_SECONDS, 10) * 1000);
}

start();
