# ManukAPP 3.1.0 — Listening Profile

Pengembangan dashboard/panel lanjutan ditunda. Rilis ini menambahkan kartu profil PNG seperti referensi, memakai branding Manuk Music. Fitur pemutar yang sudah ada tetap tersedia.

## Pasang

Hentikan bot (Ctrl+C), backup folder data saat bot berhenti, kemudian timpa folder `src`, `scripts`, `test`, `package.json`, `package-lock.json`, dan `tsconfig.json` dari ZIP. Pertahankan `.env`, `data`, `lavalink`, `yt-cipher`.

```cmd
npm install
npm run register
npm start
```

`npm install` wajib: ada dependency baru `sharp` untuk merender kartu PNG. Jangan salin node_modules dari komputer lain. Windows x64 memakai binary bawaan yang dipilih npm. Jika instalasi lama melewatkan paket optional, jalankan `npm install --include=optional`. Pada Linux tanpa font, pasang fontconfig dan fonts-dejavu-core melalui package manager sebelum menjalankan /profile. Dokumentasi renderer: https://sharp.pixelplumbing.com/install/

## Gunakan

- `/profile` — tema merah seperti contoh.
- `/profile theme:purple` — ungu.
- `/profile theme:blue` — biru.

Kartu mengambil avatar dan nama Discord pemanggil, menampilkan total waktu, jumlah server/lagu, 3 server teratas, 3 teman dengar bareng, dan 3 lagu teratas beserta artis. Balasan privat; tidak ada opsi untuk membuka profil milik orang lain. Tema dipilih per pemanggilan, bukan disimpan.

## Cara statistik dihitung

Data mulai dari saat versi ini dipasang. Statistik Wrapped lama berupa pemutaran/request tidak diubah menjadi waktu mendengarkan personal. Saat belum ada data, kartu menampilkan placeholder jujur, bukan angka contoh.

Saat audio bot benar-benar menunjukkan progres, anggota manusia di voice yang sama dan tidak sedang deafen/suppressed mendapatkan waktu terukur. Akun bot tidak dihitung. Mute mic tidak menghalangi mendengarkan. Teman berarti sesama pendengar di voice pada interval yang sama, bukan status pertemanan Discord.

Perhitungan konservatif: hanya anggota yang ada pada kedua sampel berturut-turut; join/leave/deafen mengosongkan baseline agar waktu sebelumnya tidak diberikan ke anggota baru. Pause, seek, koneksi putus, posisi macet, serta gap update lama tidak dianggap waktu mendengarkan. Bisa kurang hitung beberapa detik ketika kondisi berubah. Anggota yang menurunkan volume perangkat atau tidak benar-benar mendengar tidak dapat dideteksi; ini waktu kehadiran voice selama progres audio, bukan bukti perhatian pendengar.

Top server dan lagu dijumlahkan dari semua server tempat akun tersebut mendengarkan Manuk. Top teman dijumlahkan berdasarkan overlap tersebut. Profil bukan bulanan (akumulasi sejak fitur aktif). Data agregat disimpan di SQLite DATABASE_PATH, tanpa audio/percakapan. Nama server/teman yang tidak tersedia memakai placeholder. Avatar gagal diunduh memakai inisial.

`/history clear` tidak menghapus statistik profil. Backup data juga menyimpan statistik ini. Semua balasan profil privat; tidak ada posting otomatis ke channel.

## Preview dan verifikasi

PREVIEW_PROFILE.png hanya contoh desain dengan data demo yang ditandai; bot selalu membaca statistik asli. Build TypeScript dan 103 tes lokal lulus, termasuk render tiga tema/avatar rusak/teks khusus, pemisahan pengguna, overlap teman, pengecualian bot/deafen, dan jalur /profile. Pemanggilan langsung di Discord belum diuji dari lingkungan ini.
