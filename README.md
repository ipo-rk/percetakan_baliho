# percetakan_baliho

Percetakan baliho Kugiyaidimi — **CETAK.OS** (dashboard manajemen) + landing page publik.

## Struktur folder

```
index.html          → Landing page publik (promosi, katalog, form pesan/daftar/masuk)
dashboard.html       → Aplikasi manajemen internal (CETAK.OS)
asset/css/
  ├─ style.css            → Styling landing page (index.html)
  ├─ dashboard.css        → Styling khusus dashboard (animasi, komponen, tema)
  ├─ tailwind.built.css   → Utility classes (build Tailwind) dipakai dashboard.html
  └─ bootstrap.min.css    → Grid & komponen dasar dipakai dashboard.html
asset/js/
  ├─ script.js                 → Logic Alpine.js untuk dashboard.html (seluruh state & fitur)
  ├─ alpine.min.js             → Framework reaktif (Alpine.js)
  ├─ bootstrap.bundle.min.js   → Modal, offcanvas, dropdown, dll.
  └─ chart.min.js              → Grafik (Chart.js) di Dashboard & Laporan
```

Cukup buka `index.html` (landing) atau `dashboard.html` (aplikasi) langsung di
browser — tidak perlu server/build step, semua sudah dalam bentuk file statis.

## Peta GPS Pengantaran (real-time)

Menu **Lacak Pengantaran** (staf) / **Lacak Pesanan Saya** (pelanggan) menampilkan
peta interaktif (Leaflet.js + tile OpenStreetMap, dimuat dari CDN) yang memantau
posisi kurir dari toko menuju alamat pelanggan.

- Order dengan status produksi **Selesai** bisa ditugaskan ke kurir lewat tombol
  **"Kirim untuk Diantar"** pada detail order.
- Setelah dikirim, posisi kurir bergerak otomatis setiap beberapa detik (jarak
  tersisa, ETA, dan progres diperbarui real-time) sampai tiba di tujuan.
- Pelanggan/staf dapat menekan **"Konfirmasi Diterima"** untuk menutup siklus
  pengantaran; staf juga bisa membatalkan pengantaran yang sedang berjalan.
- Karena ini demo front-end tanpa GPS device/backend sungguhan, pergerakan
  kurir disimulasikan secara matematis (bukan data lokasi asli), namun jaraknya
  dihitung nyata (rumus haversine) dan koordinat tujuan tiap pelanggan selalu
  konsisten/sama di setiap sesi.
- **Membutuhkan koneksi internet** untuk memuat tile peta (OpenStreetMap) —
  bagian lain dari aplikasi tetap berfungsi offline seperti biasa.

## Penyimpanan data (localStorage)

Karena ini adalah demo front-end tanpa backend/database, semua data disimpan
di `localStorage` browser sehingga **perubahan tersimpan permanen** selama
Anda memakai browser & perangkat yang sama, walau halaman di-refresh:

| Kunci localStorage                      | Isi                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `kugiyaiCoreData_v1`                    | Data operasional: pelanggan, order, desain, pembayaran, stok, user, pengantaran |
| `kugiyaiLandingSettings`                | Konten landing page (promo, harga, galeri, testimoni, layanan)                  |
| `kugiyaiUserAvatar`                     | Foto profil akun yang sedang login                                              |
| `kugiyaiAuthPrefill` _(sessionStorage)_ | Serah-terima sesi login/daftar dari `index.html` ke `dashboard.html`            |

Owner dapat mengembalikan seluruh data operasional ke kondisi demo awal
melalui tombol **Reset Data** di halaman _User & Hak Akses_. Data landing
page memiliki tombol reset terpisah di tab pengaturan masing-masing.

> Catatan: karena data tersimpan per-browser, membuka aplikasi di
> perangkat/browser lain (atau mode inkognito) akan menampilkan data demo
> bawaan sampai ada perubahan baru yang disimpan di sana.

## Catatan hasil pemeriksaan (audit)

Seluruh file telah diperiksa secara menyeluruh dan konsisten:

- **Sintaks JS**: `script.js`, `alpine.min.js`, `bootstrap.bundle.min.js`, `chart.min.js` — lolos validasi sintaks, tidak ada error.
- **Struktur HTML**: seluruh tag (`div`, `section`, `table`, `form`, `ul/li`, dll.) di `index.html` dan `dashboard.html` seimbang (terbuka/tertutup cocok), tidak ada `id` duplikat.
- **Keterkaitan Alpine.js**: semua pemanggilan fungsi (`@click`, `x-show`, dll.) di `dashboard.html` cocok dengan fungsi yang didefinisikan di `script.js` — tidak ada fungsi hilang.
- **Keterkaitan DOM (`getElementById`/`querySelector`)** di `script.js` dan `index.html` — seluruh `id` yang direferensikan tersedia di HTML.
- **Kunci `localStorage`/`sessionStorage`** (`kugiyaiCoreData_v1`, `kugiyaiLandingSettings`, `kugiyaiUserAvatar`, `kugiyaiAuthPrefill`) — konsisten penamaannya antara `index.html` dan `script.js`.
- **Path asset** (`asset/css/...`, `asset/js/...`) di kedua file HTML — sudah disesuaikan dan diverifikasi cocok dengan struktur folder final di atas.
- **Modal Bootstrap** (`data-bs-target`) — seluruh target cocok dengan `id` modal yang ada.
- Tidak ditemukan sisa `debugger`, `TODO/FIXME`, atau definisi method ganda di dalam objek `app()`.

Dua catatan kecil non-error (housekeeping, tidak memengaruhi fungsi):
- 5 kelas CSS di `dashboard.css` (`.dash-anim`, `.h-20`, `.marquee-track`, `.skeleton`, `.tick-rule`) saat ini tidak dipakai di HTML manapun — aman dibiarkan untuk pemakaian di masa depan, atau dihapus jika ingin dirapikan.
- `asset/css/tailwind.built.min.css` (versi minified) disertakan tapi belum di-`<link>` di `dashboard.html` (yang dipakai saat ini adalah `tailwind.built.css` versi non-minified). Bisa ditukar ke versi minified untuk produksi bila diinginkan.

Kesimpulan: tidak ditemukan error fungsional pada elemen, fitur, atau script yang perlu diperbaiki — kode sudah konsisten dan siap pakai.
