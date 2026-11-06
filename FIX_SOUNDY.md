# ManukAPP 1.3.2 — pilih hasil terdekat

Sesuai permintaan, hasil SoundCloud kini diurutkan berdasarkan kemiripan judul, query asli, artis, dan durasi. Cover/remix/live yang tidak diminta diberi nilai lebih rendah, bukan diblokir. Tidak ada ambang kecocokan yang menolak semua hasil: bila ada kandidat, bot memilih skor tertinggi, walaupun versi atau lagunya mungkin berbeda. Status menampilkan bahwa kandidat adalah hasil terdekat.

Hasil dari maksimal dua query digabung, duplikat identifier dihapus, hingga 20 hasil dibandingkan. Tiga kandidat terbaik disimpan; bila playback kandidat pertama gagal, bot mencoba berikutnya. Respons pencarian kosong atau error sumber tetap dapat membuat musik tidak tersedia; pemeringkatan tidak memperbaiki codec atau pembatasan provider.

Update dari 1.3.1: stop bot, timpa seluruh src, jalankan npm start. Tidak perlu restart Lavalink atau mengubah .env. Jika memasang paket lengkap, package.json dan lockfile juga tersedia. Embed harus menunjukkan Music v1.3.2.

Verifikasi: TypeScript build dan 39 tes JavaScript hasil kompilasi lolos, termasuk pemilihan kandidat di bawah syarat lama, penggabungan query, deduplikasi, kandidat cadangan, dan hasil dengan kemiripan rendah. Belum diuji audio langsung di Discord pengguna.
