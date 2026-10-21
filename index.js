import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';

// ========================================================
// KONFIGURASI DARI .ENV
// ========================================================
let {
  AI_PROVIDER = 'groq',
  GROQ_API_KEYS = '',
  GROQ_MODEL = 'qwen/qwen3.8-27b',
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

PENTING (Batasan Platform Threads):
- Sampaikan analisis Anda secara padat, lugas, berbobot, tajam, dan tidak bertele-tele.
- Panjang tanggapan MAKSIMAL 420 karakter agar muat sempurna dalam batas karakter postingan Threads.`;

// Bersihkan token dan username dari karakter aneh/spasi/tanda kutip
const CLEAN_TOKEN = (THREADS_ACCESS_TOKEN || '').replace(/["'\s]/g, '');
const CLEAN_BOT_USERNAME = (BOT_USERNAME || '').replace(/[@"'\s]/g, '').toLowerCase();

// Waktu bot dinyalakan (untuk menyaring pesan lama)
const BOT_START_TIME = Date.now();

const DB_FILE = './replied_ids.json';

// Kumpulkan dan parsing semua Groq API Keys
const groqKeyPool = (GROQ_API_KEYS || '')
  .split(',')
  .map(k => k.replace(/["'\s[\]]/g, '').trim())
  .filter(k => k.startsWith('gsk_'));

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

const BANNER_FRAMES = [
  // Frame 1: Cyan
  `\x1b[36m
  ██████╗  █████╗ ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ 
  ██╔══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██║██╔══██╗██╔══██╗
  ██████╔╝███████║ ╚████╔╝ ██╔████╔██║██║██████╔╝███████║
  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║╚██╔╝██║██║██╔══██╗██╔══██║
  ██║     ██║  ██║   ██║   ██║ ╚═╝ ██║██║██║  ██║██║  ██║
  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

             ⚡  P A Y M I R A   B O T   A I  ⚡
\x1b[0m`,

  // Frame 2: Magenta
  `\x1b[35m
  ██████╗  █████╗ ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ 
  ██╔══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██║██╔══██╗██╔══██╗
  ██████╔╝███████║ ╚████╔╝ ██╔████╔██║██║██████╔╝███████║
  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║╚██╔╝██║██║██╔══██╗██╔══██║
  ██║     ██║  ██║   ██║   ██║ ╚═╝ ██║██║██║  ██║██║  ██║
  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

             ⚡  P A Y M I R A   B O T   A I  ⚡
\x1b[0m`,

  // Frame 3: Yellow
  `\x1b[33m
  ██████╗  █████╗ ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ 
  ██╔══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██║██╔══██╗██╔══██╗
  ██████╔╝███████║ ╚████╔╝ ██╔████╔██║██║██████╔╝███████║
  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║╚██╔╝██║██║██╔══██╗██╔══██║
  ██║     ██║  ██║   ██║   ██║ ╚═╝ ██║██║██║  ██║██║  ██║
  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

             ⚡  P A Y M I R A   B O T   A I  ⚡
\x1b[0m`,

  // Frame 4: Bright Green
  `\x1b[32m
  ██████╗  █████╗ ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ 
  ██╔══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██║██╔══██╗██╔══██╗
  ██████╔╝███████║ ╚████╔╝ ██╔████╔██║██║██████╔╝███████║
  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║╚██╔╝██║██║██╔══██╗██╔══██║
  ██║     ██║  ██║   ██║   ██║ ╚═╝ ██║██║██║  ██║██║  ██║
  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

             ⚡  P A Y M I R A   B O T   A I  ⚡
\x1b[0m`
];

async function playAnimatedBanner() {
  // Animasi Glitch Neon Pembuka Tanpa Border
  for (let i = 0; i < BANNER_FRAMES.length * 2; i++) {
    console.clear();
    console.log(BANNER_FRAMES[i % BANNER_FRAMES.length]);
    await sleep(150);
  }

  // Tampilan Final PAYMIRA BOT AI
  console.clear();
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
// DATABASE PENYIMPAN ID KOMENTAR LOKAL
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

function saveRepliedId(id) {
  const ids = getRepliedIds();
  ids.push(id);
  if (ids.length > 2000) ids.shift();
  fs.writeFileSync(DB_FILE, JSON.stringify(ids, null, 2));
}

// Bersihkan respon AI
function cleanAiResponse(text) {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (cleaned.length > 480) {
    cleaned = cleaned.substring(0, 477) + '...';
  }
  return cleaned;
}

// ========================================================
// GENERASI RESPON AI (GROQ ROTASI & NVIDIA)
// ========================================================
async function callGroqWithRotation(prompt) {
  if (groqKeyPool.length === 0) {
    throw new Error('Tidak ada Groq API Key valid yang tersedia di .env!');
  }

  const shuffledKeys = [...groqKeyPool].sort(() => Math.random() - 0.5);

  let lastError = null;
  for (let i = 0; i < shuffledKeys.length; i++) {
    const activeKey = shuffledKeys[i];
    const maskedKey = `${activeKey.substring(0, 7)}...${activeKey.slice(-4)}`;

    try {
      const groqClient = new OpenAI({
        apiKey: activeKey,
        baseURL: 'https://api.groq.com/openai/v1'
      });

      const response = await groqClient.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: AI_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 350
      });

      const content = response.choices[0]?.message?.content || '';
      return {
        answer: cleanAiResponse(content),
        provider: 'Groq',
        model: GROQ_MODEL
      };
    } catch (err) {
      console.warn(`[!] Groq Key (${maskedKey}) error: ${err.message}. Mencoba key lain...`);
      lastError = err;
    }
  }

  throw lastError || new Error('Semua Groq API Keys yang dipasang gagal!');
}

async function callNvidia(prompt) {
  if (!nvidiaClient) throw new Error('NVIDIA API Key belum dikonfigurasi di .env!');
  
  const response = await nvidiaClient.chat.completions.create({
    model: NVIDIA_MODEL,
    messages: [
      {
        role: 'system',
        content: AI_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.8,
    max_tokens: 350
  });

  const content = response.choices[0]?.message?.content || '';
  return {
    answer: cleanAiResponse(content),
    provider: 'NVIDIA',
    model: NVIDIA_MODEL
  };
}

async function generateAIResponse(prompt) {
  const isFallbackEnabled = ENABLE_FALLBACK === 'true';

  if (AI_PROVIDER.toLowerCase() === 'groq') {
    try {
      return await callGroqWithRotation(prompt);
    } catch (err) {
      console.warn(`[!] Seluruh key Groq gagal (${err.message})`);
      if (isFallbackEnabled && nvidiaClient) {
        console.log(`[↺] Beralih otomatis ke Fallback NVIDIA NIM...`);
        return await callNvidia(prompt);
      }
      throw err;
    }
  } else {
    try {
      return await callNvidia(prompt);
    } catch (err) {
      console.warn(`[!] NVIDIA gagal (${err.message})`);
      if (isFallbackEnabled && groqKeyPool.length > 0) {
        console.log(`[↺] Beralih otomatis ke Fallback Groq (Key Rotasi)...`);
        return await callGroqWithRotation(prompt);
      }
      throw err;
    }
  }
}

// ========================================================
// THREADS GRAPH API
// ========================================================
async function getRecentThreads() {
  const url = `https://graph.threads.net/v1.0/me/threads?fields=id,text,timestamp&limit=5&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Threads API (getRecentThreads) Error: ${JSON.stringify(data.error || data)}`);
  }
  return data.data || [];
}

async function getThreadReplies(threadId) {
  const url = `https://graph.threads.net/v1.0/${threadId}/conversation?fields=id,text,username,timestamp&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return [];
  return data.data || [];
}

async function getMentions() {
  const url = `https://graph.threads.net/v1.0/me/mentions?fields=id,text,username,timestamp,replied_to,root_post&limit=10&access_token=${CLEAN_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return [];
  return data.data || [];
}

// Mengambil teks dari postingan induk / video yang sedang dikomentari
async function getPostText(postId) {
  if (!postId) return '';
  try {
    const res = await fetch(`https://graph.threads.net/v1.0/${postId}?fields=text,username&access_token=${CLEAN_TOKEN}`);
    const data = await res.json();
    return data.text || '';
  } catch {
    return '';
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

function isUserAllowed(username) {
  if (!username) return false;
  if (TARGET_USERS.trim() === '*') return true;
  const allowedList = TARGET_USERS.toLowerCase().split(',').map(u => u.trim());
  return allowedList.includes(username.toLowerCase());
}

// ========================================================
// LOOP UTAMA POLLING
// ========================================================
async function checkAndReply() {
  if (!CLEAN_TOKEN || CLEAN_TOKEN.includes('masukkan_')) {
    console.warn('[!] THREADS_ACCESS_TOKEN belum diisi di file .env');
    return;
  }

  const now = new Date().toLocaleTimeString('id-ID');

  try {
    const repliedIds = getRepliedIds();
    let foundNew = 0;

    // 1. Cek balasan di thread yang diposting akun bot sendiri
    const myThreads = await getRecentThreads();
    for (const post of myThreads) {
      const replies = await getThreadReplies(post.id);

      for (const reply of replies) {
        if (repliedIds.includes(reply.id)) continue;
        if (reply.username && reply.username.toLowerCase() === CLEAN_BOT_USERNAME) continue;
        if (!isUserAllowed(reply.username)) continue;

        // Abaikan pesan masa lalu yang dibuat sebelum bot dinyalakan
        const replyTime = new Date(reply.timestamp).getTime();
        if (replyTime < BOT_START_TIME - 30000) {
          saveRepliedId(reply.id);
          continue;
        }

        isProcessing = true;
        foundNew++;
        // LOG PESAN MASUK (ASCII BOX)
        logIncomingMessage({
          type: 'Komentar Postingan',
          from: reply.username,
          text: reply.text
        });

        // Susun prompt dengan konteks postingan utama jika ada
        let fullPrompt = reply.text;
        if (post.text) {
          fullPrompt = `Konteks Postingan: "${post.text}"\nKomentar dari @${reply.username}: "${reply.text}"`;
        }

        // GENERASI JAWABAN
        const aiResult = await generateAIResponse(fullPrompt);

        // KIRIM REPLY
        await sendThreadReply(reply.id, aiResult.answer);
        saveRepliedId(reply.id);

        // LOG BALASAN AI (ASCII BOX)
        logAiReply({
          provider: aiResult.provider,
          model: aiResult.model,
          reply: aiResult.answer,
          to: reply.username
        });
        isProcessing = false;
      }
    }

    // 2. Cek mention (@username) dari pengguna lain
    const mentions = await getMentions();
    for (const mention of mentions) {
      if (repliedIds.includes(mention.id)) continue;
      if (mention.username && mention.username.toLowerCase() === CLEAN_BOT_USERNAME) continue;
      if (!isUserAllowed(mention.username)) continue;

      // Abaikan pesan masa lalu yang dibuat sebelum bot dinyalakan
      const mentionTime = new Date(mention.timestamp).getTime();
      if (mentionTime < BOT_START_TIME - 30000) {
        saveRepliedId(mention.id);
        continue;
      }

      isProcessing = true;
      foundNew++;
      // LOG PESAN MASUK (ASCII BOX)
      logIncomingMessage({
        type: 'Mention Akun',
        from: mention.username,
        text: mention.text
      });

      // Hilangkan tag @username dari prompt
      const cleanPrompt = mention.text.replace(/@\w+/g, '').trim() || mention.text;

      // Ambil teks postingan induk / video agar AI paham konteks yang sedang dibahas
      let contextText = '';
      const parentId = mention.replied_to?.id || mention.root_post?.id;
      if (parentId && parentId !== mention.id) {
        contextText = await getPostText(parentId);
      }

      let fullPrompt = cleanPrompt;
      if (contextText) {
        fullPrompt = `Konteks Postingan/Video yang dibahas: "${contextText}"\nPertanyaan/Komentar dari @${mention.username}: "${cleanPrompt}"`;
      }

      const aiResult = await generateAIResponse(fullPrompt);

      // KIRIM REPLY
      await sendThreadReply(mention.id, aiResult.answer);
      saveRepliedId(mention.id);

      // LOG BALASAN AI (ASCII BOX)
      logAiReply({
        provider: aiResult.provider,
        model: aiResult.model,
        reply: aiResult.answer,
        to: mention.username
      });
      isProcessing = false;
    }

  } catch (err) {
    isProcessing = false;
    console.error(`\n[!] Error saat polling [${now}]:`, err.message);
  }
}

// ========================================================
// START BOT DENGAN ANIMASI ASCII
// ========================================================
let isProcessing = false;
let spinnerIndex = 0;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Animasi Spinner Bergerak Real-Time
setInterval(() => {
  if (!isProcessing) {
    const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
    spinnerIndex++;
    const now = new Date().toLocaleTimeString('id-ID');
    process.stdout.write(`\r\x1b[36m[ ${frame} ]\x1b[0m \x1b[35m[${now}]\x1b[0m \x1b[1m⚡ PAYMIRA BOT AI\x1b[0m memantau Threads...   `);
  }
}, 150);

async function start() {
  await playAnimatedBanner();

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
    console.log('[✓] Sinkronisasi selesai. Bot hanya merespon pesan BARU mulai sekarang!\n');
  } catch (e) {
    console.warn('[!] Catatan sinkronisasi awal:', e.message);
  }

  checkAndReply();
  setInterval(checkAndReply, parseInt(CHECK_INTERVAL_SECONDS, 10) * 1000);
}

start();
