# Pasang pembaruan musik ManukAPP — Windows CMD/Cmder

## 1. Update proyek lama

Hentikan bot dengan Ctrl+C. Backup folder proyek lama lebih dahulu.

Ekstrak ZIP ini ke folder sementara. Salin isi folder `spike-discord-bot` hasil ekstrak ke folder proyek lama kamu; izinkan Replace untuk file kode.

**Pertahankan `.env` dan folder `data` milikmu.** ZIP tidak menyertakan keduanya sehingga token dan akun tersimpan tidak perlu dibuat ulang. Jangan menyalin `.env.example` menimpa `.env` yang sudah terisi.

Buka terminal pada folder proyek lama yang kini sudah diperbarui:

```cmd
cd /d C:\Users\angga\Downloads\spike-discord-bot
npm ci
```

Jika nama/lokasi folder kamu berbeda, sesuaikan perintah cd. `npm ci` memperbarui dependencies dari lockfile.

## 2. Tambahkan setting musik

```cmd
notepad .env
```

Tambahkan baris berikut jika belum ada (jangan duplikasi):

```dotenv
MUSIC_ENABLED=true
LAVALINK_URL=127.0.0.1:2333
LAVALINK_PASSWORD=manuk-local-only
LAVALINK_SECURE=false
```

Biarkan DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID dan pengaturan Valorant yang lama tetap terisi. Jika belum punya Henrik key, boleh gunakan DATA_MODE=demo; **musik tetap memutar sumber asli**, tidak mengikuti mode demo Valorant.

Simpan Ctrl+S.

## 3. Siapkan Java

```cmd
java -version
```

Harus Java 17 atau lebih baru. Jika belum ada, install Temurin JDK 21 untuk Windows dari https://adoptium.net/temurin/releases/?version=21 lalu buka terminal baru. Pastikan opsi PATH dipasang, cek `java -version` lagi.

Node juga harus sesuai:

```cmd
node -v
```

Minimal 24.17.0. Jika bot Valorant sebelumnya sudah berjalan dengan versi tersebut, tidak perlu install ulang.

## 4. Unduh Lavalink dan register command

Di root folder bot:

```cmd
npm run setup:lavalink
npm run register
npm run build
```

Unduhan Lavalink memerlukan internet. Jika script gagal, buka https://github.com/lavalink-devs/Lavalink/releases/tag/4.2.2 → Assets → unduh `Lavalink.jar`, lalu simpan sebagai `lavalink\Lavalink.jar`. Jangan unduh Source code ZIP sebagai pengganti JAR.

Register seharusnya menampilkan **15 slash command**. Jika gagal, baca kode error dan status TERISI/KOSONG. Tidak perlu membagikan token. Command hanya diregister ke server DISCORD_GUILD_ID yang sudah kamu isi.

## 5. Periksa izin Discord

Bot membutuhkan View Channel, Connect, Speak di voice channel tujuan, serta izin normal Send Messages dan Embed Links. Periksa juga permission override kategori/channel. Tidak perlu Administrator, Message Content Intent, atau Server Members Intent.

## 6. Jalankan dua terminal

**Terminal 1** — dari root folder proyek:

```cmd
npm run lavalink
```

Tunggu log Lavalink siap. Startup pertama lebih lama karena mengunduh plugin. Biarkan terminal ini terbuka.

**Terminal 2** — dari root folder proyek yang sama:

```cmd
npm start
```

Tunggu `Lavalink tersambung` dan `SPIKE online`. Jika bot sudah telanjur berjalan sebelum Lavalink siap dan tidak tersambung setelah beberapa percobaan, restart bot setelah Lavalink siap.

## 7. Coba di Discord

Masuk voice channel biasa (bukan Stage), lalu ketik:

```text
/play query:judul lagu
```

Kamu bisa mencoba judul lagu band 501 yang ingin didengar. Untuk mencari di SoundCloud:

```text
/play query:judul lagu source:SoundCloud
```

Gunakan pilihan yang muncul di UI slash command. `source` mengatur pencarian judul; URL YouTube tetap memakai YouTube walaupun source dipilih SoundCloud.

```text
/queue
/nowplaying
/pause
/resume
/skip
/volume level:50
/stop
```

Tunggu 5 detik antarcommand (cooldown bot). Tambah lagu kedua dengan `/play` lagi. Uji bahwa pause/resume terdengar, skip berpindah lagu, dan stop membuat bot keluar voice. Coba `/rank` untuk memastikan fitur Valorant tetap berjalan.

## Jika tidak berbunyi

- **Lavalink belum terhubung**: terminal 1 harus hidup; password .env harus sama dengan yang launcher kirim. Restart kedua terminal setelah mengubah password.
- **Bot tidak bisa masuk**: cek Connect, Speak, channel penuh, serta kamu berada di voice yang sama.
- **Bot masuk tetapi diam**: lihat `/nowplaying` dan terminal Lavalink; cek bot di-server-mute dan volume pengguna Discord. YouTube bisa memuat judul tetapi gagal mengambil audio. Coba lagu/sumber SoundCloud. Tidak ada jaminan semua lagu tersedia.
- **TrackException / sign-in / bot detection**: sumber menolak pemutaran. Gunakan SoundCloud atau tunggu perbaikan resmi plugin. Jangan bagikan cookie atau token akun Google.
- **JAR/plugin gagal download**: cek internet dan akses GitHub/Maven; gunakan tautan unduhan resmi di atas.
- **Port 2333 sudah dipakai**: hentikan proses Lavalink lama sebelum menjalankan instance baru.
- **Command musik belum ada**: ulangi `npm run register`, cek server ID, lalu muat ulang Discord.
- **Error tak dikenal**: kirim bagian error terminal setelah menyembunyikan token/password. Jangan kirim seluruh `.env`.

Untuk menonaktifkan musik sementara: set MUSIC_ENABLED=false lalu restart bot. Fitur Valorant tetap tersedia.
