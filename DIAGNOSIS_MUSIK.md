# Pembaruan diagnosis musik 1.1.1

Pembaruan ini memperlihatkan penyebab gagal dari Lavalink. Ini belum menjamin sumber YouTube/SoundCloud bisa diputar: penyebab kegagalan SoundCloud sebelumnya hilang karena kode hanya menampilkan pesan generik.

## Update tanpa mengubah token atau setting

1. Hentikan terminal bot (`npm start`) dengan Ctrl+C. Terminal Lavalink boleh tetap berjalan.
2. Ekstrak ZIP. Salin **seluruh folder src** dari proyek hasil ekstrak ke proyek aktif, Replace file yang sama. Pastikan `src/music-diagnostics.ts` ikut tersalin.
3. Jangan mengubah `.env`, folder `data`, atau konfigurasi Lavalink untuk pembaruan diagnosis ini.
4. Pada terminal bot, jalankan satu per satu:

```cmd
npm run build
```

```cmd
npm start
```

Tidak perlu npm run register: definisi command tidak berubah. Tidak ada dependency baru. Startup harus menampilkan **ManukAPP v1.1.1 online**. Jika tidak muncul, kemungkinan masih menjalankan build/folder lama.

## Uji sekali lalu baca hasil

Masuk voice channel. Jalankan `/play`, isi query judul lagu dan pilih opsi source **SoundCloud**.

Di terminal **npm start** (bukan hanya terminal Lavalink) akan muncul:

```text
[MUSIC REQUEST] source=SoundCloud input=search
[MUSIC RESULT] source=SoundCloud loadType=...
```

Jika Lavalink mengembalikan error, bot juga mencetak dan menampilkan pesan seperti:

```text
[MUSIC LOAD SoundCloud] message=... | cause=... | severity=...
```

Contoh di atas adalah format, bukan hasil diagnosis nyata. Jangan mengetiknya sebagai command.

Kirim baris yang berawalan `[MUSIC` setelah percobaan gagal. Jika tidak ada baris REQUEST sama sekali, pastikan startup v1.1.1 terlihat dan kamu melihat terminal bot yang tepat. Error validasi sebelum request tetap muncul di Discord.

Log hanya memilih field error, menyamarkan nilai rahasia dari environment dan URL. Raw headers/request, token, serta objek track tidak dicetak. Tetap periksa hasil sebelum membagikannya.

Informasi baru ini membedakan error pencarian sumber, timeout jaringan, kegagalan pemutaran, dan koneksi node. Tidak ada fallback diam-diam ke sumber lain.
