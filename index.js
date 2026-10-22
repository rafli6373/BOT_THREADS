import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import MetaAIMultimodal from './scrape/metaAiMultimodal.js';

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

// Handler untuk integrasi scraper Meta AI
let metaAiInstance = null;

function getMetaAIClient() {
  if (!metaAiInstance) {
    const cookieString = process.env.META_AI_COOKIE || (
      (process.env.datr || process.env.ecto_1_sess || process.env.abra_sess)
        ? `datr=${process.env.datr || ''}; ecto_1_sess=${process.env.ecto_1_sess || ''}; abra_sess=${process.env.abra_sess || ''};`
        : ''
    );
    metaAiInstance = new MetaAIMultimodal(cookieString);
  }
  return metaAiInstance;
}

async function callMetaAI(prompt, imageBase64 = null) {
  const client = getMetaAIClient();

  let options = { thinkingMode: true };
  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const buffer = Buffer.from(base64Data, 'base64');

    options.fileBuffer = buffer;
    options.mimeType = mimeType;
    options.fileName = 'attachment.jpg';
  }

  const result = await client.ask(prompt, options);
  return {
    answer: cleanAiResponse(result.answer),
    provider: imageBase64 ? 'Meta AI (Multimodal)' : 'Meta AI',
    model: 'Llama 3.3 (Meta AI)'
  };
}

async function callNvidia(prompt, imageBase64 = null) {
  if (!nvidiaClient) throw new Error('NVIDIA API Key belum dikonfigurasi di .env!');
  
  // Model NVIDIA Nemotron tidak mendukung image_url (Vision), jadi kirim teks saja agar tidak error
  let userContent = prompt;
  if (imageBase64 && NVIDIA_MODEL.toLowerCase().includes('vision')) {
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

async function generateAIResponse(prompt, imageBase64 = null) {
  const isFallbackEnabled = ENABLE_FALLBACK === 'true';

  if (AI_PROVIDER.toLowerCase() === 'meta-ai' || AI_PROVIDER.toLowerCase() === 'meta') {
    try {
      return await callMetaAI(prompt, imageBase64);
    } catch (err) {
      console.warn(`[!] Meta AI gagal (${err.message})`);
      if (isFallbackEnabled && nvidiaClient) {
        console.log(`[↺] Beralih otomatis ke Fallback NVIDIA NIM...`);
        return await callNvidia(prompt, imageBase64);
      }
      throw err;
    }
  } else {
    try {
      return await callNvidia(prompt, imageBase64);
    } catch (err) {
      console.warn(`[!] NVIDIA gagal (${err.message})`);
      if (isFallbackEnabled) {
        console.log(`[↺] Beralih otomatis ke Fallback Meta AI...`);
        return await callMetaAI(prompt, imageBase64);
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

// Menentukan URL gambar yang valid (menghindari mendownload video mentah jika tipe VIDEO)
function extractImageUrl(mediaObj) {
  if (!mediaObj) return null;
  if (mediaObj.media_type === 'VIDEO') {
    return mediaObj.thumbnail_url || null;
  }
  return mediaObj.media_url || mediaObj.thumbnail_url || null;
}

// Download gambar dan ubah ke format Base64 Data URI untuk dianalisis oleh AI Vision
async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      console.warn(`[!] URL media bukan gambar (${contentType}), diabaikan.`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.warn('[!] Gagal mengunduh gambar:', err.message);
    return null;
  }
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

          // Cek apakah komentar atau postingan memiliki gambar / video
          let imageBase64 = null;
          const mediaUrl = extractImageUrl(reply) || extractImageUrl(post);
          if (mediaUrl) {
            console.log(`[📷] Mendeteksi gambar/video di komentar/postingan, memproses dengan AI Vision...`);
            imageBase64 = await fetchImageAsBase64(mediaUrl);
          }

          let replyText = (reply.text || '').replace(/@\w+/g, '').trim();
          if (!replyText) {
            replyText = imageBase64 ? 'Tolong jelaskan atau baca isi gambar ini.' : 'Halo!';
          }

          let fullPrompt = replyText;
          if (post.text) {
            fullPrompt = `Konteks Postingan: "${post.text}"\nKomentar dari @${reply.username}: "${replyText}"`;
          }

          // GENERASI JAWABAN (VISION / TEKS)
          const aiResult = await generateAIResponse(fullPrompt, imageBase64);

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

        // Ambil teks & gambar dari postingan induk / video agar AI paham konteks visual
        let contextText = '';
        let imageBase64 = null;
        const parentId = mention.replied_to?.id || mention.root_post?.id;

        if (parentId && parentId !== mention.id) {
          const parentDetail = await getPostDetail(parentId);
          if (parentDetail) {
            contextText = parentDetail.text || '';
            const targetMedia = extractImageUrl(parentDetail);
            if (targetMedia) {
              console.log(`[📷] Mendeteksi gambar/video pada postingan induk, memproses dengan AI Vision...`);
              imageBase64 = await fetchImageAsBase64(targetMedia);
            }
          }
        }

        // Jika tidak ada di postingan induk, cek apakah mention langsung melampirkan media
        if (!imageBase64) {
          const directMedia = extractImageUrl(mention);
          if (directMedia) {
            console.log(`[📷] Mendeteksi gambar/video langsung pada mention, memproses dengan AI Vision...`);
            imageBase64 = await fetchImageAsBase64(directMedia);
          }
        }

        // Hilangkan tag @username dari prompt
        let cleanPrompt = (mention.text || '').replace(/@\w+/g, '').trim();
        if (!cleanPrompt) {
          cleanPrompt = imageBase64 ? 'Tolong baca teks pada gambar ini atau jelaskan isinya secara ringkas.' : 'Halo! Ada yang bisa saya bantu?';
        }

        let fullPrompt = cleanPrompt;
        if (contextText) {
          fullPrompt = `Konteks Postingan/Video yang dibahas: "${contextText}"\nPertanyaan/Komentar dari @${mention.username}: "${cleanPrompt}"`;
        }

        // GENERASI JAWABAN (VISION / TEKS)
        const aiResult = await generateAIResponse(fullPrompt, imageBase64);

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
    const [mentions, threads] = await Promise.all([getMentions(), getRecentThreads()]);
    for (const m of mentions) saveRepliedId(m.id);
    for (const t of threads) {
      const replies = await getThreadReplies(t.id);
      for (const r of replies) saveRepliedId(r.id);
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
