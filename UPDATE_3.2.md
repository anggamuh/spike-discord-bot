# ManukAPP 3.2.0 — Help, profil, leaderboard & backup

## Instalasi (Windows / Laragon)

1. Hentikan bot dengan Ctrl+C. Salin folder data sebagai cadangan saat bot berhenti.
2. Dari folder spike-discord-bot di ZIP ini, timpa src/, scripts/, test/, package.json, package-lock.json, dan tsconfig.json di folder bot lama. Jangan membuat folder spike-discord-bot bersarang.
3. Pertahankan .env, data/, lavalink/, yt-cipher/. ZIP ini tidak memuat token atau database pengguna.
4. Jalankan satu per satu:

```cmd
npm install
npm run register
npm start
```

Lavalink dan yt-cipher tetap dijalankan seperti biasa. Registrasi memakai DISCORD_GUILD_ID; ulangi untuk server lain yang ingin menerima command baru. Node mengikuti engines package.json (>=24.17.0).

## Command baru / diperbarui

- /help: daftar slash command dan fungsi singkat, dengan dropdown 6 kategori. Subcommand playlist/favorite/history/dj juga ditampilkan. Opsi category bisa dipilih saat memanggil /help. Lirik saat ini melalui tombol Lirik, bukan command slash.
- /profileset theme:purple background:waves accent:#a78bfa bio:Musik dulu: simpan tema, pola latar, aksen hex, dan bio maksimal 60 karakter. Latar vinyl/waves/plain; tema red/purple/blue. Ini pola bawaan, belum unggah gambar latar.
- /profile: memakai pengaturan tersimpan. Opsi theme di /profile hanya mengubah tampilan satu kali.
- /profileset reset:true: reset seluruh tampilan (opsi lainnya diabaikan); statistik tetap ada.
- /top type:listeners: 10 pendengar berdasarkan waktu mendengar terukur, hanya di server saat command dipanggil.
- /top type:tracks atau artists: 10 lagu/artis berdasarkan durasi pemutaran bot di server ini, tidak dikalikan jumlah pendengar.

Top adalah akumulasi sepanjang data tersimpan, bukan bulanan. /wrapped tetap untuk statistik bulanan. Data profil lama yang sudah tersimpan ikut digunakan; tidak ada data demo dalam database. Statistik pendengar mulai sejak V3.1, pemutaran bot sejak V3.0. Hasil command privat, tanpa mention notifikasi. Leaderboard menampilkan nama pengguna server dari data mendengar; profil individual tetap milik pemanggil.

## Backup otomatis

Saat bot mulai dan setiap 24 jam selama proses hidup, snapshot seluruh database SQLite disimpan di folder backups di samping file DATABASE_PATH (default data/backups). Tujuh snapshot terakhir per lokasi database disimpan. Backup memakai API SQLite agar data WAL yang sudah committed ikut tercakup; tidak menyalin file database aktif secara mentah. Snapshot yang gagal tidak menggantikan cadangan lama. Snapshot tidak mencakup .env, Lavalink atau yt-cipher, dan antrean yang masih dalam debounce belum tentu tercakup.

Backup berada di disk yang sama; salin cadangan penting ke perangkat lain. Startup berulang dapat merotasi tujuh snapshot lebih cepat dari tujuh hari. Terminal menampilkan [BACKUP] jika berhasil/gagal.

### Pemulihan manual

Hentikan seluruh proses bot yang memakai database. Pindahkan file database aktif beserta file -wal dan -shm (jika ada) ke folder cadangan terpisah. Salin snapshot .sqlite yang dipilih ke path DATABASE_PATH, menggunakan nama file database semula. Jangan mencampur snapshot dengan -wal/-shm lama. Jalankan bot kembali. Pemulihan mengembalikan data ke waktu snapshot, bukan menggabungkan data baru.

## Validasi

Build TypeScript dan 109 tes lokal lulus, termasuk semua command terwakili dalam help, subcommand, isolasi statistik antarserver, persistensi/reset profil, backup WAL yang bisa dibuka ulang, rotasi, dan kegagalan backup. Kartu PNG telah dirender dan diperiksa. PREVIEW_PROFILE.png berisi contoh berlabel DATA DEMO. Belum diuji langsung di server Discord pengguna.

Rilis ini mencakup tiga prioritas: backup, kustomisasi profil, leaderboard, ditambah /help. Badge, /match, dan /search pilihan lagu belum ditambahkan.
