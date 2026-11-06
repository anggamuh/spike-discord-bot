# ManukAPP 1.5.0 — login pengguna Spotify

## Mengapa berubah
Log terakhir gagal dengan HTTP 401 pada pembacaan playlist items. Token aplikasi (Client Credentials) tidak mewakili akun pengguna. Bot sekarang membaca metadata langsung melalui Spotify Web API dengan Authorization Code + PKCE, lalu memakai alur audio YouTube → SoundCloud yang sudah ada. Impor Spotify tidak lagi bergantung pada token anonim atau token aplikasi LavaSrc. Plugin LavaSrc boleh tetap terpasang.

## Pasang
Stop bot. Timpa seluruh src, test, package.json, dan package-lock.json. Pertahankan .env dan data. Tidak perlu mengubah atau restart Lavalink untuk pembaruan ini.

1. Pastikan .env memiliki SPOTIFY_CLIENT_ID dari app yang benar. Client Secret lama boleh tetap ada; alur PKCE baru tidak membutuhkannya.
2. Di Spotify Developer Dashboard → app → Settings, daftar Redirect URI tepat berikut:
http://127.0.0.1:8888/callback
3. Di folder bot, jalankan npm run spotify:login.
4. Buka URL yang muncul di browser PADA KOMPUTER YANG SAMA. Login ke akun pemilik/kolaborator playlist. Setujui izin baca playlist; tidak ada izin mengubah playlist atau memutar Spotify account yang diminta. Pada app Development Mode, akun login harus diizinkan pada Users and Access jika diperlukan.
5. Setelah terminal menyatakan Spotify terhubung, jalankan npm start. Pastikan Music v1.5.0.
6. Gunakan /play dengan link playlist Spotify publik milik akun tersebut atau yang akun tersebut kolaborasikan.

Lavalink tetap harus berjalan untuk audio. Maksimal antrean 50 lagu. Import memeriksa maksimal 100 entri dan mengambil maksimal 50 track; episode dan file lokal diabaikan.

## Batas akses
API Spotify membatasi Get Playlist Items ke pemilik/kolaborator playlist. Bot ini tidak menjanjikan semua playlist publik milik orang lain bisa diakses. Jika playlist bukan milikmu, buat playlist milikmu dan tambahkan lagu yang diinginkan melalui aplikasi Spotify, lalu gunakan link playlist baru. Tetapkan playlist publik: bot sengaja menolak playlist privat agar izin akun pemilik bot tidak membocorkan koleksi privat ke pengguna Discord lain.

Izin login mencakup playlist-read-private dan playlist-read-collaborative sebagaimana endpoint terkait; pemeriksaan public dilakukan sebelum mengambil isinya. Jika izin dicabut, login ulang. Sesi disimpan di data/spotify-auth.json dan otomatis refresh; jangan bagikan file itu atau masukkan ke ZIP. Hapus file itu saat bot berhenti untuk keluar dari sesi lokal; izin app juga bisa dicabut melalui pengaturan akun Spotify.

401 sesudah refresh → login ulang. 403/404 → cek kepemilikan/kolaborasi, Users and Access, dan batas API app. 429 → tunggu. Batas Premium/Development Mode Spotify tetap berlaku.

## Verifikasi
Build dan 54 tests lolos: PKCE/state callback, impor urut/duplikasi, blok playlist privat, refresh token sekali saat 401, 403/429, cap 50, serta fallback audio sebelumnya. Login dan akses API akun pengguna belum diuji langsung; tahap persetujuan harus dijalankan di komputer pengguna. Tidak ada token/kredensial pengguna dalam paket.

Referensi:
https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
