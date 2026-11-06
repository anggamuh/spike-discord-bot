# ManukAPP 1.2.0 — YouTube utama, SoundCloud cadangan

## SoundCloud melalui Soundy

Konfigurasi Lavalink memakai Soundy fork Lochis 1.1.0 dari JitPack. Source SoundCloud bawaan dinonaktifkan supaya tidak bentrok dengan plugin; konfigurasi plugin YouTube dan sources lain tetap satu daftar dan tidak diduplikasi. Restart Lavalink agar dependency diunduh dan dimuat.

Kegagalan satu track tidak lagi mengosongkan antrean setelah tiga kegagalan request playback. Bot mencoba item satu per satu sampai ada yang diterima player atau antrean habis. Log membedakan pencarian, load track, request playback, event playback, dan fallback.

Lanjut otomatis ke item antrean berikutnya tetap ada. Repository ini tidak memiliki mode rekomendasi autoplay yang menambahkan track baru sendiri.

Pencarian `dan bandung` dan beberapa track SoundCloud belum teruji live di lingkungan ini karena koneksi Lavalink ke JitPack ditolak. Jalankan pencarian tersebut setelah Lavalink berhasil memuat plugin pada mesin dengan akses internet.

YouTube source memakai snapshot upstream `f45bbb7` (bukan rilis 1.18.2), termasuk perbaikan stream untuk format yang tidak menyertakan panjang konten. Dependency snapshot ditetapkan di `lavalink/application.yml` dan diunduh dari Maven Lavalink saat Lavalink dijalankan. Pencarian judul mengutamakan YouTube Music, lalu YouTube biasa; jika kandidat gagal, bot mencoba SoundCloud, dan terakhir Bandcamp. Bandcamp menggunakan source bawaan Lavalink (`bcsearch:`), tanpa plugin atau token tambahan. SoundCloud juga beralih ke Bandcamp jika pencarian atau playback gagal.

OAuth YouTube aktif. Saat pertama kali login, biarkan `YOUTUBE_REFRESH_TOKEN` kosong di `.env`; selesaikan device flow pada terminal Lavalink, lalu simpan refresh token di `.env` lokal. Jangan tempelkan token ke Discord atau commit ke repository. Gunakan akun YouTube cadangan. OAuth tidak menjamin semua video dapat diputar. Panduan OAuth, diagnosis HTTP 400, dan cipher lokal opsional ada di `MUSIC_YOUTUBE.md`. Error signature `must find sig function` bisa memerlukan server yt-cipher lokal; perubahan versi plugin tidak dilakukan tanpa alasan teknis.

## Pasang di Windows CMD
1. Hentikan bot dengan Ctrl+C. Lavalink boleh tetap berjalan.
2. Ekstrak ZIP. Salin isi folder spike-discord-bot ke folder proyek lama, pilih replace untuk file kode yang sama. Jangan hapus .env, data, atau Lavalink.jar milikmu. ZIP tidak membawa file-file tersebut. Jika application.yml milikmu sudah disesuaikan, pertahankan konfigurasi itu.
3. Jalankan satu per satu di folder proyek:

```bat
npm install
npm run build
npm start
```

Tidak perlu register ulang karena definisi command tidak berubah.

## Cara pakai
`/play query: judul lagu nama artis`

Biarkan source kosong: bot mencari YouTube terlebih dahulu. Jika pencarian gagal/kosong, bot mencoba SoundCloud memakai kata pencarian yang sama. Jika YouTube berhasil dimuat tetapi gagal diputar atau macet menurut event Lavalink, bot mencoba SoundCloud berdasarkan judul dan artis track.

`/play query: judul lagu nama artis source: SoundCloud` tetap bisa dipakai untuk langsung memilih SoundCloud.

Pencarian SoundCloud meminta satu kandidat per request (`scsearch[offset,1]:...`), maksimal lima kandidat. Ini mengisolasi kegagalan parsing format pada satu hasil agar hasil lain masih bisa dicoba. Bukan perbaikan codec: bila semua kandidat gagal, bot tetap menampilkan error.

Fallback dari track YouTube yang sudah dimuat memeriksa kecocokan kata judul dan durasi (selisih maksimal 15% atau 15 detik). Judul + artis dipakai sebagai kata pencarian. Versi cover/remix masih mungkin terpilih; bukan jaminan rekaman identik. Jika tidak cocok, bot tidak memaksakan pengganti.

Saat fallback terjadi, posisi mulai dari awal. Lagu berikutnya tetap berada di antrean. SoundCloud tidak kembali ke YouTube; tidak ada retry tanpa batas. Skip/stop tidak memicu fallback. Jika cadangan gagal diputar, antrean dilanjutkan.

`/nowplaying` menampilkan sumber aktual dan catatan pergantian. Terminal menampilkan `[MUSIC FALLBACK]` serta error sumber yang telah disensor.

## Batasan
- Link YouTube yang gagal bahkan sebelum metadata tersedia belum dapat dialihkan otomatis. Gunakan judul + artis untuk kasus ini. Link yang sudah menghasilkan track mendukung fallback saat pemutaran gagal.
- Fallback dipicu error pemuatan, exception/loadFailed, atau track stuck. Bot tidak mengukur suara yang benar-benar terdengar oleh pendengar. Server mute, volume nol, atau masalah voice transport tetap harus diperiksa terpisah.
- Pembatasan login, region, dan format YouTube masih dapat mencegah playback meskipun plugin snapshot telah dimuat.
- Belum diuji dengan token Discord/voice server pengguna. TypeScript check, build, dan 27 unit tests lolos.

## Referensi implementasi
- https://github.com/lavalink-devs/lavaplayer/blob/2.2.6/main/src/main/java/com/sedmelluq/discord/lavaplayer/source/soundcloud/SoundCloudAudioSourceManager.java
- https://github.com/lavalink-devs/youtube-source/releases
