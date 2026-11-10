# ManukAPP 1.7.0

## Pasang dari 1.6.1

Hentikan bot dengan Ctrl+C dan cadangkan folder data saat bot berhenti. Timpa `src`, `test`, `package.json`, `package-lock.json`, `README.md`, dan dokumen update dari ZIP. Jangan hapus `.env`, `data`, `lavalink`, atau `yt-cipher`.

```cmd
npm install
npm run register
npm start
```

Register diperlukan untuk command dan opsi baru. Terminal Lavalink serta yt-cipher tetap berjalan. Tidak ada dependensi baru. Node tetap mengikuti engines package.json. Tidak perlu migrasi manual; tabel preferensi server dibuat otomatis.

## Fitur

| Fitur | Contoh |
|---|---|
| Autoplay satu artis | `/autoplay mode:on style:artist` |
| Autoplay campuran | `/autoplay mode:on style:mix` |
| Request berikutnya | `/playnext query:judul lagu` |
| Lompat posisi | `/seek position:1:30` atau `/seek position:90` |
| Ulang dari awal | `/replay` atau tombol Replay |
| Simpan antrean | `/savequeue name:Malam Minggu` atau tombol Simpan antrean |
| Antrean bergantian | `/fairqueue mode:on` |
| Pengaturan server | `/musicsettings` |
| Status pemutar | `/status` |

### Autoplay

Mode artist memilih hasil dari artis yang sama; mode mix memilih artis berbeda dengan bantuan riwayat artis server dan pencarian teks. Kandidat dipilih acak dari hasil yang lolos, menghindari judul aktif dan hingga 100 judul riwayat. Live stream serta kompilasi >=15 menit tidak dipilih. Ini pencarian teks, bukan API rekomendasi resmi. Campuran mungkin belum menghasilkan kandidat jika riwayat minim atau hasil sumber terbatas; status menampilkan catatan kegagalan. Antrean manual selalu didahulukan. Loop song/queue tetap berlaku sebelum autoplay.

### Playnext dan antrean adil

Playnext memasukkan request ke kelompok prioritas di depan antrean tanpa memotong lagu aktif. Beberapa request prioritas tetap FIFO. Batas total 100 termasuk lagu aktif. Request playlist dipotong sesuai ruang tersedia.

Fairqueue mengatur ulang lagu menunggu bergantian per requester, mempertahankan urutan tiap orang. Lagu aktif tidak dipotong. Request baru ikut pengaturan ini; playnext tetap paling depan. Mematikan fairqueue mempertahankan urutan yang sudah terlihat. Shuffle dan move mematikan fairqueue agar urutan acak/manual tidak ditimpa saat request berikutnya. Metadata requester dari versi lama yang tidak tersedia dikelompokkan sebagai unknown. Replay/seek tidak mengubah urutan.

### Simpan antrean

Menyimpan lagu aktif dan semua lagu menunggu sesuai urutan saat itu ke playlist server baru. Tidak menimpa playlist bernama sama. Tombol membuat nama `Antrean <timestamp>`; gunakan `/playlist list` lalu `/playlist play` untuk memutarnya. Data berupa metadata; audio dicari lagi saat giliran diputar. Batas PLAYLIST_MAX_TRACKS tetap dihormati.

### Pengaturan per server

Hanya Administrator/Manage Server dapat mengubah `/musicsettings`. Tanpa opsi, tampilkan nilai saat ini.

- `volume`: 0–100, default 50.
- `autoplay`: True/False, default False.
- `style`: artist atau mix, default artist.
- `fair`: True/False, default False.
- `idle`: 30–3600 detik sebelum keluar ketika pemutar kosong, default 120.
- `empty`: 30–3600 detik sebelum keluar dari voice tanpa pendengar manusia, default 60.
- `channel`: channel teks tetap untuk panel; bot harus punya izin membaca, mengirim, dan riwayat pesan.
- `auto_channel:True`: kembali mengikuti channel request. Jangan gabungkan dengan channel.

Default diterapkan ke sesi baru. Timer memakai nilai ketika dibuat. Sesi/timer aktif tidak direset. Resume menggunakan snapshot loop/autoplay/fair/volume sesi lama; pengaturan default tidak menghapus snapshot. `/panel` memindahkan sekaligus menetapkan channel tetap.

### Izin dan status

Playnext, seek/replay, fairqueue mengikuti pembatasan DJ bila role DJ diatur. Simpan playlist selalu memerlukan DJ/admin/Manage Server, sama dengan mutasi playlist server. Kontrol audio memerlukan voice yang sama. Status dapat dibaca tanpa masuk voice: koneksi node, progres pemutar, antrean, mode, sumber aktif, dan catatan terakhir. Tidak menguji semua sumber dengan request tambahan dan tidak menjamin setiap lagu tersedia.

Seek/replay hanya untuk sumber seekable dan bukan live. Seek saat pause mempertahankan pause. Posisi harus sebelum akhir lagu.

## Validasi

TypeScript build dan 83 tes lokal lulus, termasuk regresi macet akhir lagu 1.6.1, prioritas vs fairqueue, seek mundur, playlist tidak tertimpa, persistensi preferensi, izin pengaturan, dan pemilihan autoplay. Playback Discord langsung belum diuji dari lingkungan ini.
