# ManukAPP 3.0.0

Rilis tahap pertama roadmap V3: standby 24/7, panel musik dengan kontrol volume, dan statistik bulanan/Wrapped dasar. Dibangun dari 1.7.0; perbaikan akhir lagu dan autoplay 1.6.1 tetap dipertahankan.

## Pasang dari versi sebelumnya

1. Matikan bot dengan Ctrl+C. Cadangkan folder proyek, terutama seluruh folder `data` saat bot berhenti.
2. Salin/timpa `src`, `scripts`, `test`, `package.json`, `package-lock.json`, `tsconfig.json`, dan dokumen Markdown dari ZIP ke folder proyek lama (sejajar dengan .env).
3. Pertahankan `.env`, `data`, `lavalink`, `yt-cipher`, dan konfigurasi sumber musik yang sudah bekerja.
4. Jalankan satu per satu:

```cmd
npm install
npm run register
npm start
```

Register wajib untuk /247 dan /wrapped. Lavalink dan yt-cipher tetap harus berjalan. Paket ini bukan installer Java/Deno/Lavalink dan tidak menyertakan kredensial. Tidak ada dependensi npm baru. Node tetap mengikuti engines package.json (>=24.17.0).

## 24/7

- `/247 mode:on`: masuk voice biasa terlebih dahulu; memerlukan DJ, Administrator, atau Manage Server. Jika bot belum di voice, bot bergabung. Timer keluar ketika idle/voice kosong dibatalkan.
- `/247 mode:off`: kembali menggunakan timer normal. Tidak memotong lagu aktif dan tidak otomatis mematikan autoplay.
- `/247 mode:status`: lihat status tersimpan.
- `/stop` dan tombol Stop: hentikan musik, bersihkan sesi, keluar voice, sekaligus matikan 24/7. Bot tidak diam-diam masuk lagi setelah stop.
- Mode disimpan per server. Saat bot/node siap lagi, mode ON mencoba bergabung kembali ke voice tersimpan jika izin tersedia. Antrean tersimpan disiapkan tetapi tidak diputar otomatis; gunakan `/resume`.
- Jika channel dihapus, izin hilang, atau bot dikeluarkan, tidak ada retry masuk tanpa batas. Perbaiki izin lalu jalankan `/247 mode:on` lagi.
- 24/7 berarti bot tetap standby. Autoplay tetap opsi terpisah. Laptop/PC, jaringan, Lavalink, dan cipher harus tetap aktif; tidak ada hosting otomatis dalam paket ini.

## Panel Discord

Satu pesan publik diperbarui ketika lagu berganti dan sekitar setiap 15 detik. Menampilkan mode 24/7, progres, antrean, volume, loop, autoplay, dan fairqueue. Tombol Volume −10/+10 dibatasi 0–100 dan mengikuti izin DJ serta voice yang sama, seperti pause/replay. Tombol antrean menampilkan daftar dengan navigasi halaman. Saat standby, panel menjelaskan /play atau /resume.

Kontrol yang sudah ada (pause/resume, skip, shuffle, loop, replay, favorit, lirik, simpan antrean) tetap tersedia. Penambahan lagu tetap lewat /play atau /playnext; tidak ada browser/dashboard web dalam rilis ini.

## Wrapped bulanan

- `/wrapped`: bulan berjalan.
- `/wrapped month:2026-11`: bulan tertentu, format YYYY-MM.
- Semua batas bulan memakai WIB (UTC+7).
- Menampilkan total pemutaran, durasi progres audio terukur, 5 lagu teratas, 5 artis berdasarkan durasi, dan 5 requester berdasarkan pemutaran lagu yang mereka minta.
- Setiap loop natural dihitung sebagai pemutaran baru. Replay/seek dalam pemutaran yang sama tidak menambah hitungan pemutaran.
- Autoplay masuk statistik lagu/artis/durasi tetapi tidak diatribusikan ke anggota.
- Statistik menghitung audio bot, termasuk ketika voice kosong, bukan akumulasi jam mendengarkan tiap anggota. Tidak merekam percakapan atau siapa yang mendengar.
- Durasi dihitung konservatif dari selisih posisi dan waktu antar pembaruan. Pause, posisi macet, lompatan seek, serta jeda pembaruan lebih dari 15 detik tidak menambah durasi. Ada kemungkinan kurang hitung beberapa detik saat pindah lagu/koneksi terputus. Tidak menganggap seluruh panjang lagu sudah didengar.
- Data baru dimulai setelah V3 aktif. Riwayat lama tidak diubah menjadi estimasi durasi. Tabel agregat per bulan tersimpan di DATABASE_PATH yang sudah ada; otomatis dibuat saat startup. /history clear tidak menghapus statistik bulanan.

## Yang belum masuk

Rekomendasi berdasarkan genre membutuhkan metadata genre dan belum diimplementasikan. Autoplay artist/mix dari 1.7.0 tetap digunakan. Web dashboard dengan Discord OAuth2, kontrol melalui browser, dan publikasi website adalah tahap berikutnya. Wrapped di rilis ini berupa panel teks perintah, belum kartu gambar atau kiriman bulanan otomatis.

## Validasi

Build TypeScript dan 95 tes lokal lulus: regresi autoplay/auto-next, queue persistence, 24/7 timer dan pemulihan standby, stop mematikan 24/7, izin, clamp volume, perhitungan pause/seek/loop, isolasi server dan batas bulan WIB. Pemutaran suara langsung melalui Discord belum diuji dari lingkungan ini.
