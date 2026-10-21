<div align="center">

```text
  ██████╗  █████╗ ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ 
  ██╔══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██║██╔══██╗██╔══██╗
  ██████╔╝███████║ ╚████╔╝ ██╔████╔██║██║██████╔╝███████║
  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║╚██╔╝██║██║██╔══██╗██╔══██║
  ██║     ██║  ██║   ██║   ██║ ╚═╝ ██║██║██║  ██║██║  ██║
  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

             ⚡  P A Y M I R A   B O T   A I  ⚡
```

# 🧵 PAYMIRA BOT AI — Autonomous Threads AI Assistant

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Threads API](https://img.shields.io/badge/Meta-Threads_API_Official-000000?logo=threads&logoColor=white)](https://developers.facebook.com/)
[![Groq LPUs](https://img.shields.io/badge/Groq-LPU_High_Speed-F55036?logo=groq&logoColor=white)](https://groq.com/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-NIM_Nemotron_550B-76B900?logo=nvidia&logoColor=white)](https://build.nvidia.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Author](https://img.shields.io/badge/Author-rafli6373-purple.svg)](https://github.com/rafli6373)

**PAYMIRA BOT AI** adalah bot asisten cerdas otomatis berbasis AI multidisiplin untuk platform sosial media **Threads (Meta)**. Ditenagai oleh arsitektur **Dual-Engine (Groq Multi-Key & NVIDIA NIM)** dengan kecepatan respons ultra-tinggi (< 1 detik), kemampuan rotasi key otomatis tanpa takut terkena *rate limit*, pemahaman konteks postingan induk (*context-awareness*), serta siap dijalankan 24/7 di **Pterodactyl Panel** maupun server lokal secara **100% Gratis**.

---

</div>

## 🌟 Fitur Utama (Highlights)

- ⚡ **Ultra-Fast Dual AI Engine**: Ditenagai oleh model mutakhir **Qwen 3.8 27B** di jaringan LPUs Groq dan didukung oleh raksasa **NVIDIA Nemotron 550B Ultra**.
- 🎲 **Smart Multi-Key Rotation**: Mendukung hingga puluhan Groq API Key sekaligus dengan sistem acak (*load balancing*) dan *auto-retry* saat ada key yang mencapai batas limit kuota.
- 🛡️ **Zero-Downtime Automatic Fallback**: Jika layanan utama mengalami kendala, bot secara otomatis beralih ke engine cadangan tanpa menghentikan pemantauan pesan.
- 🧠 **Context-Aware Intelligence**: Tidak hanya membaca komentar, bot mampu melacak dan memahami teks/caption dari postingan video atau gambar induknya (*root post*) secara otomatis.
- 🏛️ **Expert Persona (Pakar Multidisiplin)**: Dikonfigurasi dengan karakter analis tajam, objektif, berbasis data, profesional di bidang politik, ekonomi, sosial nasional (Indonesia) dan global.
- 🎨 **Futuristic Cyberpunk Terminal**: Tampilan log interaktif dengan animasi pembuka neon glitch, moving ASCII spinner, serta format kotak pesan cool & estetik.
- 🛑 **Anti-Spam Memory System**: Dilengkapi database deduplikasi lokal (`replied_ids.json`) untuk mencegah bot membalas pesan yang sama berulang kali.
- ☁️ **100% Pterodactyl & Docker Ready**: Dibuat dengan dependensi minimal dan arsitektur ringan yang siap dideploy langsung di panel hosting Pterodactyl.

---

## 🏗️ Alur Kerja Bot (Architecture)

```text
  [ Threads User ]
         │
         ▼  (Mention @bot / Komentar)
  [ Threads Graph API ]
         │
         ▼  (Polling setiap 30 detik)
  [ PAYMIRA BOT Engine ] ──► Cek duplikasi di replied_ids.json
         │
         ├──► Ambil Caption Postingan Induk (Context Awareness)
         │
         ├──► [ Engine 1: Groq LPUs ] ──► Rotasi Acak (Key 1..N)
         │           │
         │           ▼ (Jika limit/error)
         ├──► [ Engine 2: NVIDIA NIM ] ──► Nemotron 550B Ultra
         │
         ▼  (Terapkan Jeda Sinkronisasi Meta 2.5s + Auto-Retry)
  [ Publish Reply ke Threads ]
         │
         ▼
  [ Terminal Cool ASCII Logger ]
```

---

## 🚀 Panduan Instalasi Cepat

### 1. Clone Repository
```bash
git clone https://github.com/rafli6373/BOT_THREADS.git
cd BOT_THREADS
```

### 2. Install Dependensi
```bash
npm install
```

### 3. Konfigurasi Lingkungan (`.env`)
Salin file template `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Lalu buka file `.env` dan lengkapi konfigurasi berikut:

```env
# AI Provider ("groq" atau "nvidia")
AI_PROVIDER=groq

# Kumpulan API Key Groq (pisahkan dengan koma untuk rotasi otomatis)
GROQ_API_KEYS=gsk_key1,gsk_key2,gsk_key3,gsk_key4,gsk_key5
GROQ_MODEL=qwen/qwen3.8-27b

# NVIDIA NIM (build.nvidia.com)
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxx
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
ENABLE_FALLBACK=true

# Pengaturan Akun Threads
TARGET_USERS=*
BOT_USERNAME=username_threads_kamu
THREADS_ACCESS_TOKEN=THAGI_TOKEN_60_HARI_KAMU
CHECK_INTERVAL_SECONDS=30
```

### 4. Jalankan Bot
```bash
node index.js
```

---

## ☁️ Menjalankan di Pterodactyl Panel

1. Masuk ke dashboard server Pterodactyl kamu (gunakan **Node.js Egg** v18 atau v20+).
2. Buka menu **Files / File Manager**.
3. Upload file:
   - `index.js`
   - `package.json`
   - `.env` (isi dengan token & api keys kamu)
4. Buka tab **Console**, jalankan perintah:
   ```bash
   npm install
   ```
5. Klik tombol **Start** server. Bot akan aktif 24/7 memantau Threads!

---

## 🔑 Cara Mendapatkan Token Akses Threads 60 Hari

1. Buka [Meta for Developers](https://developers.facebook.com/) dan buat aplikasi baru dengan use case **Threads**.
2. Masuk ke menu **Kasus Penggunaan** ➔ **Sesuaikan** (pada Akses Threads API).
3. Buka tab **Pengaturan** ➔ scroll ke paling bawah ke bagian **Generator Token Pengguna**.
4. Tambahkan akun Threads kamu sebagai penguji, lalu klik tombol **Generate Token**.
5. Token yang didapatkan dari menu ini adalah token resmi jangka panjang yang **berlaku selama 60 hari**.

---

## 🖥️ Contoh Tampilan Log Terminal

```text
╔══════『 PESAN MASUK THREADS 』══════════════════════╗
║ ⏰ Waktu : 21/10/2026, 21.04.52
║ 👤 From  : @Rafli6373
║ 💬 Text  : @mhmmadcturrr_ menurut mu gimana?
║ 🏷️ Tipe  : MENTION AKUN
╚═════════════════════════════════════════════════════╝

╔══════『 BALASAN AI TERKIRIM 』══════════════════════╗
║ ⚡ Engine : GROQ (qwen/qwen3.8-27b)
║ 🎯 To     : @Rafli6373
║ 🤖 Respon : Fenomena buzzer di ranah politik melemahkan diskursus publik...
║ ✅ Status : Berhasil Terkirim ke Threads
╚═════════════════════════════════════════════════════╝
```

---

## 📄 Struktur Direktori

```text
BOT_THREADS/
├── .env                # File rahasia berisi API keys & token (JANGAN di-push ke publik)
├── .env.example        # Template konfigurasi publik
├── .gitignore          # Proteksi berkas sensitif dari git
├── index.js            # Inti logika bot, polling, AI router, dan Threads API
├── package.json        # Manifest dependensi project
├── README.md           # Dokumentasi resmi
└── replied_ids.json    # Database lokal histori komentar (auto-generated)
```

---

## 🛡️ Lisensi & Kontribusi

Didistribusikan di bawah lisensi **MIT License**. Silakan gunakan, modifikasi, dan kembangkan secara bebas untuk keperluan personal maupun edukasi.

<div align="center">

Dibuat dengan ❤️ oleh **[rafli6373](https://github.com/rafli6373)**

</div>
