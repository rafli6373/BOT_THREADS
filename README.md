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
[![Meta AI](https://img.shields.io/badge/Meta_AI-Scraper_Ready-0084FF?logo=meta&logoColor=white)](https://www.meta.ai/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-NIM_Nemotron_550B-76B900?logo=nvidia&logoColor=white)](https://build.nvidia.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Author](https://img.shields.io/badge/Author-rafli6373-purple.svg)](https://github.com/rafli6373)

**PAYMIRA BOT AI** adalah bot asisten cerdas otomatis berbasis AI multidisiplin untuk platform sosial media **Threads (Meta)**. Ditenagai oleh arsitektur **Meta AI Scraper & NVIDIA NIM** dengan kecepatan respons tinggi, pemahaman konteks postingan induk (*context-awareness*), dukungan balasan thread berantai (*looping*), serta siap dijalankan 24/7 di **Pterodactyl Panel** maupun server lokal secara **100% Gratis**.

---

</div>

## 🌟 Fitur Utama (Highlights)

- ⚡ **Multi-Engine AI**: Mendukung integrasi **Meta AI Web Scraper** (Multimodal Vision & OCR) serta didukung oleh raksasa **NVIDIA Nemotron 550B Ultra**.
- 👁️ **Multimodal OCR Lengkap**: Mampu membaca teks secara akurat dari **Gambar** (`.png`, `.jpg`, `.webp`), **Video** (`.mp4`), serta tautan **Dokumen** (`.pdf`, `.docx`, `.xlsx`, `.txt`, `.csv`) yang dikirim atau dimention di Threads.
- 🛡️ **Zero-Downtime Automatic Fallback**: Jika layanan utama mengalami kendala, bot secara otomatis beralih ke engine cadangan tanpa menghentikan pemantauan pesan.
- 🧵 **Auto-Thread Looping**: Jawaban panjang (>430 karakter) otomatis dipecah menjadi rangkaian balasan berantai (`[1/2]`, `[2/2]`) agar tidak terpotong.
- 🧠 **Context-Aware Intelligence**: Tidak hanya membaca komentar, bot mampu melacak dan memahami teks/caption dari postingan video atau gambar induknya (*root post*) secara otomatis.
- 🏛️ **Expert Persona (Pakar Multidisiplin)**: Dikonfigurasi dengan karakter analis tajam, objektif, berbasis data, profesional di bidang politik, ekonomi, sosial nasional (Indonesia) dan global.
- 🎨 **Futuristic Terminal UI**: Tampilan log interaktif dengan format kotak pesan cool & estetik.
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
         ├──► [ Engine 1: Meta AI Scraper ]
         │           │
         │           ▼ (Jika kendala/fallback aktif)
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
# AI Provider ("meta-ai" atau "nvidia")
AI_PROVIDER=meta-ai

# Meta AI Session Cookie (Untuk OCR Gambar, Video & Dokumen)
META_AI_COOKIE="datr=...; ecto_1_sess=...;"

# Fallback NVIDIA NIM (build.nvidia.com)
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
3. Upload file berikut:
   - `index.js`
   - `package.json`
   - Folder `scrape/` (berisi file scraping Meta AI)
   - `.env` (isi dengan cookie & token Threads kamu)
4. Buka tab **Console**, jalankan perintah:
   ```bash
   npm install
   ```
5. Klik tombol **Start** server. Bot akan aktif 24/7 memantau Threads! Jika lingkungan server Pterodactyl tidak memiliki Chromium, bot secara otomatis beralih (*fallback*) ke **NVIDIA NIM** secara mulus tanpa error.

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
║ ⚡ Engine : NVIDIA (nvidia/nemotron-3-ultra-550b-a55b)
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
