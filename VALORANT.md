# SPIKE — Bot Discord Valorant

TypeScript + discord.js. Bahasa Indonesia. Untuk PC Valorant. Status: kode siap dikonfigurasi; bot belum dipasang atau online di server Discord. Build dan unit test dapat dijalankan tanpa token. Koneksi Discord dan respons API live belum diuji dengan kredensial nyata.

## Mulai di Windows / PowerShell

1. Install Node.js **24.17 atau lebih baru** (disarankan Node 24 LTS). Cek `node -v`.
2. Ekstrak ZIP, buka folder `spike-discord-bot` di VS Code, lalu Terminal → New Terminal.
3. Jalankan:

```powershell
npm ci
copy .env.example .env
notepad .env
```

4. Isi token dan ID Discord sesuai petunjuk di bawah. Biarkan `DATA_MODE=demo` untuk awal.
5. Jalankan:

```powershell
npm run register
npm run build
npm start
```

Bot aktif selama terminal dan komputer menyala. Untuk pengembangan: `npm run dev`. Untuk pengecekan: `npm run check` dan `npm test`.

## Buat aplikasi Discord

Buka https://discord.com/developers/applications → New Application → beri nama **SPIKE**.
- General Information: salin **Application ID** ke `DISCORD_CLIENT_ID`.
- Bot: buat/reset token, simpan sendiri ke `DISCORD_TOKEN` di `.env`. Jangan kirim token ke chat atau commit ke Git.
- Tidak membutuhkan Message Content Intent atau privileged intent lain.
- Discord Settings → Advanced → Developer Mode. Klik kanan server milikmu → Copy Server ID → `DISCORD_GUILD_ID`.
- OAuth2 URL Generator: scopes `bot` + `applications.commands`; permission `View Channels`, `Send Messages`, `Embed Links`. Buka URL hasil generator dan pilih server uji yang kamu kelola. Jangan beri Administrator.
- `npm run register` memasang 15 command di server itu. Script upsert per nama dan tidak menghapus command lain. Jalankan ulang jika definisi command berubah.

## Coba mode demo

```text
/help
/link riot_id:Angga#IDN setuju:True region:ap
/rank
/stats
/matches
/unlink
/ping
```

Gunakan pemilih opsi Discord untuk `setuju` dan `region`. Tunggu 5 detik antarcommand. Demo mendukung hanya `Angga#IDN`; statistik berlabel DEMO dan bukan data asli Angga. /stats berisi K/D, win rate, HS%, ACS. /matches menampilkan maksimal 5 hasil.

## Aktifkan data asli

Proyek memakai adapter **HenrikDev**, API pihak ketiga/tidak resmi, bukan API key Riot langsung. Dokumentasi: https://docs.henrikdev.xyz/general/auth . Ikuti prosedur mendapatkan API key provider dan periksa ketentuan serta kuota akunmu. Tidak ada janji akses gratis atau permanen.

Ubah `.env`:

```dotenv
DATA_MODE=henrik
HENRIK_API_KEY=isi_key_provider_di_sini
```

Restart bot lalu `/link` ulang dengan Riot ID milikmu dan region yang benar (Indonesia biasanya `ap`). Record demo dan live dipisahkan. Tidak ada fallback ke angka demo jika API live gagal.

Endpoint yang dipakai, sesuai spesifikasi https://api.henrikdev.xyz/openapi.json (diperiksa 5 November 2026):
- GET `/valorant/v2/account/{name}/{tag}`
- GET `/valorant/v3/mmr/{affinity}/pc/{name}/{tag}`
- GET `/valorant/v4/matches/{affinity}/pc/{name}/{tag}?mode=competitive&size=10`
- Header `Authorization: <HENRIK_API_KEY>`.

Provider dapat menolak akun, membatasi akses, atau mengubah format. Bot menangani timeout, 401, 403, 404, 429, data kosong dan format penting yang hilang. Cache 60 detik membatasi request berulang.

## Data, hitungan, dan batasan

- `/link` adalah bookmark ID yang dinyatakan milik pengguna, **bukan** login Riot/RSO atau bukti kepemilikan. Bot tidak meminta password, cookie, atau token sesi Riot.
- Semua balasan ephemeral (terlihat hanya oleh pemakai command). Tidak ada lookup member lain, leaderboard publik, atau pengumuman otomatis.
- Persetujuan `/link` menyimpan Discord user ID + Riot ID + region + PUUID di SQLite lokal dan mengambil statistik dari provider. `/unlink` menghapus pemetaan di semua mode. Cache statistik proses kedaluwarsa dalam 60 detik; ini tidak menghapus data milik provider.
- Database `data/spike.sqlite` harus berada pada disk persisten; jangan masukkan ke repositori. Backup database termasuk file WAL saat bot berjalan, atau hentikan bot sebelum backup.
- Statistik memakai maksimal 10 pertandingan Competitive **selesai dan tersedia**, bukan seluruh akun/season. K/D = total kill ÷ total death; jika death nol tampil ∞ atau —. HS% = headshots ÷ seluruh hit, bukan kill. ACS = total score ÷ total ronde. Seri masuk denominator win rate dan ditampilkan terpisah.
- Peak rank adalah yang diberikan provider, tidak dihitung ulang. Tidak ada kalkulator hidden MMR.
- Untuk aplikasi publik, evaluasi persetujuan pemain dan kebijakan Riot/RSO sebelum memperluas akses. https://developer.riotgames.com/docs/valorant . /link sederhana ini bukan pengganti RSO.
- Bot Gateway membutuhkan proses Node yang terus menyala. Cocok dijalankan lokal dulu atau pada server dengan proses jangka panjang; bukan hosting halaman statis. Belum ada deployment 24/7.

## Struktur

`src/index.ts`: handler Discord; `commands.ts`: definisi slash command; `register.ts`: registrasi; `provider.ts`: adapter API/demo; `domain.ts`: kalkulasi; `store.ts`: SQLite; `test/bot.test.ts`: pengujian offline.

## Jika bermasalah

- Token invalid: reset lewat Developer Portal, ganti `.env`, restart; jangan tempel token ke chat.
- Command belum muncul: cek Application ID, Guild ID, izin instalasi, lalu `npm run register` dan muat ulang Discord.
- 401/403 API: periksa key/akses provider. 404: cek nama, tag, region. 429: tunggu kuota pulih.
- Mode henrik tetap meminta /link: memang record demo terpisah, link ulang.
- `node:sqlite` memunculkan experimental warning pada beberapa versi Node: warning runtime, bukan error bot. Gunakan versi Node sesuai syarat.

Referensi: https://discord.js.org/docs/packages/discord.js/14.22.1 ; https://discordjs.guide/legacy/app-creation/deploying-commands ; https://docs.henrikdev.xyz ; https://developer.riotgames.com/docs/valorant .
