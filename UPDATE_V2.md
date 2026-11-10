# ManukAPP 1.6.1 — hasil review

## Cara pasang di Windows

1. Hentikan terminal bot dengan Ctrl+C. Cadangkan folder proyek, terutama seluruh folder `data`.
2. Ekstrak ZIP ini. Timpa folder `src`, `scripts`, `test`, serta `package.json`, `package-lock.json`, `tsconfig.json`, `README.md`, dan `UPDATE_V2.md` di proyek lama.
3. Pertahankan `.env`, folder `data`, `lavalink`, dan `yt-cipher` yang sudah bekerja. ZIP ini tidak memuat kredensial atau database.
4. Jalankan dari folder proyek:

```cmd
npm install
npm run register
npm start
```

Lavalink dan yt-cipher tetap perlu berjalan seperti sebelumnya. Gunakan Node sesuai `engines` package.json (>=24.17.0).

## Perbaikan

- Kapasitas 100 termasuk lagu aktif. Import Spotify API juga sampai 100; playlist publik tetap menggunakan importer yang ada.
- Playlist server tidak lagi berhenti di 25 pertama. Audio dicari saat giliran lagu, sehingga tidak memuat seluruh audio sekaligus.
- `/playlist play name:... start:101` mulai dari urutan tertentu bila playlist tersimpan lebih dari kapasitas antrean. Default start 1.
- Auto-next cadangan mengikuti loop dan autoplay. Loop menggunakan identitas pemutaran baru agar event lama tidak melewati lagu berikutnya.
- Snapshot terbaru dapat langsung dibaca sebelum debounce menulis database; shutdown normal menyimpan antrean. `/stop` sengaja menghapus sesi.
- Riwayat dicatat setelah posisi audio mulai maju; kegagalan sebelum audio berjalan tidak masuk riwayat.
- Panel publik otomatis muncul dan diperbarui ketika audio mulai maju. Panel memakai satu pesan, memperbarui saat pergantian lagu dan kira-kira setiap 15 detik, dengan tombol pause, skip, shuffle, stop, antrean, lirik, favorit, loop, autoplay.
- Tombol publik tidak memakai batas collector 14 menit. Setelah restart, `/resume` mengaktifkan kembali sesi dan panel. `/panel` memindahkan panel ke channel saat ini. Bot memerlukan View Channel, Send Messages, dan Read Message History.

## Fitur dan batasan

| Fitur | Cara pakai |
|---|---|
| Pulihkan antrean | `/resume` dari voice channel; mulai dari awal lagu terakhir, bukan detik tersimpan |
| Ulang lagu/antrean | `/loop mode:song` atau `queue`; skip manual tetap melewati lagu |
| Autoplay | `/autoplay mode:on`; pencarian lagu lain berdasarkan artis, menghindari judul di riwayat; hasil bergantung sumber |
| Kelola antrean | `/queue`, `/remove`, `/move`, `/jump`, `/shuffle`, `/clear` |
| Favorit | `/favorite add`, `list`, `play`, `remove`; pribadi per pengguna |
| Playlist server | `/playlist create`, `add`, `remove`, `show`, `list`, `play`, `delete` |
| Riwayat | `/history list page:1`, `play`, `clear`; 100 lagu per server |
| Role DJ | `/dj set`, `remove`, `status`; pengaturan oleh admin/Manage Server |
| Vote skip | `/skip` atau `/voteskip`; default 50% pendengar manusia, dibulatkan ke atas; DJ/admin bisa skip langsung |

Mutasi playlist server dan penghapusan riwayat memerlukan DJ/admin. Kontrol pemutar dibatasi DJ bila role dikonfigurasi; favorit tetap boleh untuk pendengar. Antrean, playlist, pengaturan, dan riwayat disimpan pada DATABASE_PATH yang sudah ada. Tidak perlu migrasi manual.

Resume tidak otomatis masuk voice setelah restart. Spotify menyediakan daftar/metadata; audio tetap dicari melalui sumber Lavalink. Lagu yang tidak tersedia bisa dilewati. Autoplay bukan jaminan rekomendasi resmi atau audio tersedia.

## Validasi

TypeScript build dan 70 tes lokal lulus, termasuk penyimpanan snapshot, loop, autoplay, pemulihan metadata, serta panel publik yang mengedit pesan yang sama. Pengujian Discord voice langsung belum dijalankan dari lingkungan review.

## Perbaikan 1.6.1
Watchdog menerima respons Lavalink tanpa voice.connected; state.connected menjadi acuan utama. Uji regresi posisi 209/213 detik berhasil memicu autoplay. Guard tetap mengabaikan pause dan koneksi putus eksplisit.
