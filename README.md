# Update terbaru: ManukAPP 3.2.0

Lihat UPDATE_3.2.md untuk instalasi, /help lengkap, /profileset, /top, dan backup otomatis. Dokumen versi lama menjelaskan perilaku saat versi tersebut dirilis.

# Update 1.5.0

Impor Spotify kini memerlukan login pengguna lokal. Baca SPOTIFY.md; jalankan npm run spotify:login sekali, lalu npm start.

# Update 1.4.0: Spotify

Baca SPOTIFY.md untuk pemasangan plugin, penggunaan playlist, dan batas akses Spotify.

## Update musik 1.2.0

YouTube Music/YouTube → SoundCloud → Bandcamp otomatis saat gagal. Baca UPDATE_MUSIK.md untuk pemasangan, perilaku fallback, dan batasannya.

# ManukAPP 1.1.1 — Valorant + Music

Untuk perbaikan pesan error musik, baca **DIAGNOSIS_MUSIK.md**. Instalasi awal: **MULAI_DI_SINI.md**. Disiapkan untuk Windows CMD/Cmder seperti terminal Laragon kamu.

## Yang ditambahkan

- `/play query:<judul atau URL> source:<youtube/soundcloud/bandcamp>`: cari judul, masukkan lagu atau playlist. Pencarian otomatis melewati YouTube Music/YouTube, SoundCloud, lalu Bandcamp jika sumber sebelumnya gagal.
- `/skip`, `/pause`, `/resume`, `/stop`.
- `/queue page:1`, `/nowplaying`, `/volume level:50`.
- Antrean terpisah per server, maksimal 100 lagu termasuk lagu aktif; playlist besar dipotong sesuai kapasitas. /queue 10 lagu per halaman.
- Kontrol hanya dari voice channel yang sama; Stage belum didukung.
- Keluar otomatis setelah antrean kosong 2 menit, atau channel tanpa pendengar manusia 60 detik.
- Antrean hanya di memori; restart/koneksi node terputus menghapus antrean. Ketika bot dipindah paksa, sesi dibersihkan.
- Fitur Valorant lama tetap ada. Musik tidak memerlukan `/link` atau key HenrikDev.
- Semua jawaban command tetap privat, tetapi **audio terdengar oleh semua anggota voice channel**.

## Stack dan kebutuhan

Node.js >=24.17, discord.js 14.22.1, Shoukaku 4.3.0, Lavalink 4.2.2, snapshot youtube-source `f45bbb7`, dan Soundy fork Lochis 1.1.0 dari JitPack. Java 17+ (Java 21 disarankan).

Lavalink 4.2+ diperlukan untuk dukungan voice DAVE. Jangan memakai Lavalink 3 atau konfigurasi lawas. Versi npm dikunci lewat package-lock.json. Lavalink.jar diunduh dari GitHub resmi oleh `npm run setup:lavalink`; file JAR tidak disertakan dalam ZIP. Plugin YouTube snapshot dan Soundy diunduh otomatis saat Lavalink berjalan; SoundCloud bawaan Lavalink dinonaktifkan agar tidak bentrok dengan Soundy. Koneksi internet diperlukan untuk unduhan plugin.

Tidak ada API key musik berbayar. Node/Lavalink berjalan pada PC milikmu; kedua proses perlu tetap hidup. YouTube plugin tidak resmi; ketersediaan pencarian/playback tergantung sumber. OAuth YouTube opsional dan refresh token hanya disimpan di `.env` lokal. Server signature cipher lokal juga opsional; setup ada di [MUSIC_YOUTUBE.md](MUSIC_YOUTUBE.md). Sebagian lagu masih bisa ditolak atau gagal akibat perubahan YouTube. Spotify playlist dan SoundCloud tetap memakai alur audio/fallback yang tersedia.

## Verifikasi

Build TypeScript lolos pada Node 26.13.0. `node --test` pada hasil build menjalankan 60 tes yang lolos, dan tes redaksi Lavalink lolos terpisah dari sumber (total 61). `npm test` melalui `tsx` pada lingkungan Codex dapat berhenti sebelum tes mulai karena `uv_os_get_passwd ... ENOMEM`; gunakan build lalu `node --test dist/test/<nama-test>.js` untuk verifikasi di lingkungan ini.

Unduhan JAR resmi berhasil diuji. Uji startup Java terhenti ketika lingkungan pengujian tidak dapat me-resolve host `maven.lavalink.dev` untuk mengunduh plugin; startup penuh belum terverifikasi.

Startup OAuth langsung, server yt-cipher, dan playback voice belum diuji live: flow OAuth membutuhkan persetujuan akun, cipher lokal memerlukan Deno dan checkout terpisah, dan tidak ada token bot/server uji. Unit test memakai player palsu; itu tidak membuktikan audio terdengar. Ikuti pengujian manual di [MUSIC_YOUTUBE.md](MUSIC_YOUTUBE.md) dan [MULAI_DI_SINI.md](MULAI_DI_SINI.md).

## File penting

- `src/music.ts`: integrasi Discord voice/Shoukaku dan command musik.
- `src/music-core.ts`: antrean, penguncian per server, validasi sumber.
- `src/index.ts`: router command Valorant + musik.
- `src/register.ts`: upsert 15 slash command dan diagnosis aman tanpa token.
- `lavalink/application.yml`: konfigurasi lokal, hanya bind 127.0.0.1:2333.
- `scripts/setup-lavalink.mjs`: unduh JAR resmi, validasi ukuran serta digest bila GitHub menyediakannya.
- `scripts/start-lavalink.mjs`: menjalankan Java dengan password dari .env tanpa meletakkannya di argumen proses.
- `VALORANT.md`: dokumentasi fitur/API Valorant sebelumnya.

Config default untuk **bot dan Lavalink pada PC yang sama**. Jangan membuka port Lavalink ke internet. Password default hanya untuk localhost; jika memindahkan node ke server lain, konfigurasikan password kuat, TLS dan firewall terlebih dahulu.

## Referensi yang diperiksa 5 November 2026

- https://shoukaku.shipgirl.moe/documents/Guide.Getting_Started.html
- https://github.com/shipgirlproject/Shoukaku
- https://github.com/lavalink-devs/Lavalink/releases/tag/4.2.2
- https://lavalink.dev/configuration/
- https://github.com/lavalink-devs/youtube-source/releases/tag/1.18.2
- https://github.com/lavalink-devs/youtube-source
# Manuk Music V2 progress

The music subsystem now creates SQLite tables automatically in `DATABASE_PATH` for guild playback snapshots and up to 100 history entries per guild. No separate migration command is required. `/resume` restores a saved snapshot only after a member invokes it from a voice channel; unavailable old tracks are skipped. `VOTE_SKIP_THRESHOLD` defaults to `0.5` (50% of current human listeners). Existing deployments can keep their current `.env`; this setting is optional.

Fitur musik V2 yang tersedia: snapshot SQLite, /resume, loop song/queue, autoplay, pengelolaan antrean, vote skip, riwayat, favorit pribadi, playlist server, role DJ, dan panel publik /panel. Lihat UPDATE_V2.md untuk pemasangan dan perilaku fitur.

## Update 1.7.0
Tujuh peningkatan musik dan panduan perintah tersedia di UPDATE_1.7.md. Perbaikan auto-next/autoplay 1.6.1 dipertahankan.

## ManukAPP V3.0
Mode 24/7, panel volume, serta Wrapped bulanan tersedia. Baca UPDATE_V3.md sebelum pemasangan. Web dashboard dan rekomendasi genre belum termasuk rilis ini.

## Profil 3.1.0
Gunakan /profile untuk kartu avatar, nama, top server, teman dengar bareng, dan lagu teratas. Baca UPDATE_PROFILE.md. Pengembangan dashboard ditunda; pemutar yang sudah ada tetap tersedia.
