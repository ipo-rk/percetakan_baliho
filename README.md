# CETAK.OS — KugiyaiTobe Digital Printing

> Sistem Informasi Manajemen Percetakan Digital, Monitoring Produksi, dan Pelacakan Pengantaran Real-Time Berbasis Web.
> **Lokasi Operasional:** Mugou · Waghete · Kabupaten Deiyai · Provinsi Papua Tengah.

---

## 📋 Daftar Isi

1. [Tentang Sistem](#-tentang-sistem)
2. [Arsitektur & Struktur Berkas](#-arsitektur--struktur-berkas)
3. [Peran Pengguna & Kontrol Akses (RBAC)](#-peran-pengguna--kontrol-akses-rbac)
4. [Analisis & Perancangan Sistem (Mermaid Diagrams)](#-analisis--perancangan-sistem-mermaid-diagrams)
   - [4.1 DFD Level 0 (Context Diagram)](#41-dfd-level-0-context-diagram)
   - [4.2 DFD Level 1 (Data Flow Diagram Terinci)](#42-dfd-level-1-data-flow-diagram-terinci)
   - [4.3 Use Case Diagram](#43-use-case-diagram)
   - [4.4 Entity Relationship Diagram (ERD)](#44-entity-relationship-diagram-erd)
   - [4.5 Flowchart Alur Operasional Bisnis](#45-flowchart-alur-operasional-bisnis)
   - [4.6 Diagram Komponen (Component Diagram)](#46-diagram-komponen-component-diagram)
   - [4.7 Sequence Diagram (Siklus Order & Pengantaran)](#47-sequence-diagram-siklus-order--pengantaran)
5. [Peta GPS & Manajemen Armada Kurir (CartoDB Voyager HD)](#-peta-gps--manajemen-armada-kurir-cartodb-voyager-hd)
6. [Skema Penyimpanan & Sinkronisasi Lintas-Halaman](#-skema-penyimpanan--sinkronisasi-lintas-halaman)
7. [Hasil Audit & Pembaruan Terakhir](#-hasil-audit--pembaruan-terakhir)
8. [Panduan Penggunaan & Uji Coba](#-panduan-penggunaan--uji-coba)

---

## 🏢 Tentang Sistem

**CETAK.OS** adalah sistem perancangan dan operasional digital-printing terpadu yang dirancang khusus untuk memenuhi kebutuhan produksi baliho flexi, spanduk vinyl, roll up banner, dan stiker cutting di **KugiyaiTobe Digital-Printing**, Waghete, Deiyai, Papua Tengah.

Aplikasi ini menggabungkan dua lingkungan kerja dalam satu ekosistem:

1. **Landing Page Publik (`index.html`)**: Katalog interaktif, showcase portofolio dinamis, kalkulator estimasi harga, running ticker pesanan, dan modal autentikasi mandiri terintegrasi.
2. **Dashboard Internal CETAK.OS (`dashboard.html`)**: Panel manajemen lengkap dengan 11 modul operasional terpadu (Order, Pelanggan, Desain Proofing, Kanban Produksi, Peta Pengantaran GPS, Manajemen Driver Armada, Keuangan/Kasir, Stok Bahan, Laporan Analitik, Manajemen Pengguna, dan CMS Landing Page).

Sistem berjalan **100% Client-Side** tanpa ketergantungan server runtime backend (zero-backend architecture), memanfaatkan kekuatan **Alpine.js reaktif**, **HTML5 Web Storage**, dan **Leaflet.js HD Maps**.

---

## 📂 Arsitektur & Struktur Berkas

```
percetakan_baliho/
├── index.html                 # Landing page promosi & katalog publik
├── login.html                 # Halaman autentikasi mandiri & quick-demo switch
├── dashboard.html             # Single-Page Application (SPA) manajemen CETAK.OS
├── README.md                  # Dokumentasi teknis & perancangan sistem
├── asset/
│   ├── css/
│   │   ├── style.css          # Desain landing page & custom pin peta Leaflet
│   │   ├── dashboard.css      # Tema gelap, kartu glassmorphism, & layout dashboard
│   │   ├── tailwind.built.css # Tailwind CSS utilities build
│   │   └── bootstrap.min.css  # Grid system & modal scaffolding
│   ├── js/
│   │   ├── script.js          # Core business logic Alpine.js & simulasi real-time
│   │   ├── alpine.min.js      # Alpine.js framework reaktif v3
│   │   ├── bootstrap.bundle.min.js # Bootstrap UI engine (Modal, Dropdown, Offcanvas)
│   │   └── chart.min.js       # Chart.js library visualisasi analitik
│   └── img/
│       ├── banner-ticket/     # Asset tiket banner preview HD (ticket-1 s/d ticket-6)
│       └── gallery/           # Asset portofolio cetak real (gallery-1 s/d gallery-6)
```

---

## 👥 Peran Pengguna & Kontrol Akses (RBAC)

Aplikasi menerapkan sistem **Role-Based Access Control (RBAC)** ketat untuk memastikan integritas data operasional:

| Peran (Role)          | Hak Akses & Tanggung Jawab Utama                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner (Pimpinan)**  | Akses seluruh modul sistem tanpa batasan, manajemen pengguna & peran staf, reset basis data, serta CMS Landing Page.                                                                  |
| **Admin**             | Pengelolaan order masuk, registrasi pelanggan, kontrol inventaris bahan/tinta, serta rekapitulasi laporan pendapatan.                                                                 |
| **Designer**          | Pengunggahan file master cetak (`.ai`, `.cdr`, `.pdf`), manajemen revisi desain, pembuatan proof-sheet visual.                                                                        |
| **Operator Produksi** | Pembaruan status kanban produksi (_Tunggu Desain_ → _Tunggu Setuju_ → _Siap Cetak_ → _Cetak_ → _Finishing_ → _Selesai_), penugasan kurir.                                             |
| **Kasir**             | Penerimaan pembayaran uang muka (DP), pelunasan sisa tagihan, pencetakan Surat Perintah Kerja (SPK) & kuitansi faktur.                                                                |
| **Driver (Kurir)**    | Menerima daftar pengantaran, navigasi peta CartoDB Voyager HD menuju koordinat pelanggan, konfirmasi status tiba.                                                                     |
| **Pelanggan**         | Akses dibatasi ke data miliknya sendiri (_Self-Service Portal_): buat order baru + penentuan koordinat kirim, review & setujui desain, pantau progress cetak, dan lacak posisi kurir. |

---

## 📊 Analisis & Perancangan Sistem (Mermaid Diagrams)

### 4.1 DFD Level 0 (Context Diagram)

Diagram konteks mendefinisikan batasan sistem CETAK.OS beserta entitas luar yang berinteraksi secara langsung:

```mermaid
flowchart TD
    subgraph EKSTERNAL["Entitas Luar"]
        P["Pelanggan"]
        O["Owner / Pimpinan"]
        A["Admin & Kasir"]
        D["Desainer Grafis"]
        OP["Operator Produksi"]
        DR["Kurir / Driver"]
    end

    SYS(("SISTEM CETAK.OS\n(KugiyaiTobe Digital Printing)"))

    P -- "1. Form Order Baru, Titik GPS, Bukti Bayar, Konfirmasi Terima" --> SYS
    SYS -- "1. Kuitansi Invoice, Lembar Proof Desain, Posisi Kurir Real-Time" --> P

    O -- "2. Konfigurasi Sistem, Konten CMS, Manajemen Pengguna" --> SYS
    SYS -- "2. Laporan Laba/Rugi, Metrik KPI, Rekap Produksi" --> O

    A -- "3. Data Pelanggan, Order Masuk, Transaksi DP/Pelunasan" --> SYS
    SYS -- "3. Invoice Siap Cetak, Notifikasi Piutang, Status Order" --> A

    D -- "4. Unggah File Master Cetak, Versi Revisi Desain" --> SYS
    SYS -- "4. Daftar Antrean Desain, Feedback Revisi Pelanggan" --> D

    OP -- "5. Update Tahapan Produksi, Pemakaian Bahan/Stok" --> SYS
    SYS -- "5. SPK Cetak, Notifikasi Stok Menipis" --> OP

    DR -- "6. Konfirmasi Berangkat, Koordinat GPS, Selesai Antar" --> SYS
    SYS -- "6. Rute Pengantaran, Data Alamat & No. HP Pelanggan" --> DR
```

---

### 4.2 DFD Level 1 (Data Flow Diagram Terinci)

DFD Level 1 menguraikan sistem menjadi 6 proses utama dan 4 lumbung data (_data stores_):

```mermaid
flowchart TD
    %% Entitas
    P["Pelanggan"]
    S["Staf / Kasir"]
    DS["Desainer"]
    OP["Operator"]
    DR["Kurir"]

    %% Data Stores
    D1[("DS-1: Core Data\nkugiyaiCoreData_v1")]
    D2[("DS-2: Sesi Pengguna\nkugiyaiSession_v1")]
    D3[("DS-3: CMS Landing\nkugiyaiLandingSettings")]
    D4[("DS-4: Tracking GPS\nPengantaran & Rute")]

    %% Proses
    P1["1.0 Manajemen Akun\n& Otentikasi Sesi"]
    P2["2.0 Pengelolaan Order\n& Titik Lokasi Kirim"]
    P3["3.0 Proofing Desain\n& Persetujuan"]
    P4["4.0 Alur Produksi\n& Kontrol Bahan"]
    P5["5.0 Kasir, DP\n& Pelunasan"]
    P6["6.0 Dispatching Kurir\n& Pelacakan GPS"]

    P -- "Kredensial / Daftar" --> P1
    P1 -- "Tulis Sesi" --> D2
    D2 -- "Baca Peran & ID" --> P1
    P1 -- "Akses Dashboard" --> P

    P -- "Input Pesanan & Pin Peta" --> P2
    S -- "Verifikasi Order" --> P2
    P2 -- "Simpan Order" --> D1
    D1 -- "Ambil Data Order" --> P2

    DS -- "Upload Master Cetak" --> P3
    P3 -- "Simpan Status Desain" --> D1
    P -- "Approval / Revisi Desain" --> P3

    OP -- "Update Status Cetak & Bahan" --> P4
    P4 -- "Update Stok & Status" --> D1

    S -- "Input DP / Pelunasan" --> P5
    P5 -- "Catat Transaksi" --> D1
    P5 -- "Cetak Invoice / SPK" --> P

    OP -- "Siap Antar" --> P6
    DR -- "Update Koordinat" --> P6
    P6 -- "Tulis Status Kurir" --> D4
    D4 -- "Render Posisi Kurir" --> P
```

---

### 4.3 Use Case Diagram

Diagram use case memetakan hubungan antara berbagai aktor sistem dengan fungsionalitas aplikasi:

```mermaid
flowchart LR
    subgraph ACTORS["Aktor Pengguna"]
        Pelanggan(("Pelanggan"))
        Kasir(("Kasir / Admin"))
        Desainer(("Desainer"))
        Operator(("Operator Produksi"))
        Driver(("Driver / Kurir"))
        Owner(("Owner / Pimpinan"))
    end

    subgraph SYSTEM["Batasan Sistem CETAK.OS"]
        UC1(["Buat Pesanan & Tandai Koordinat"])
        UC2(["Persetujuan / Revisi Desain"])
        UC3(["Lacak Kurir Real-Time di Peta"])
        UC4(["Konfirmasi Penerimaan Barang"])

        UC5(["Catat Pembayaran DP / Lunas"])
        UC6(["Cetak SPK & Kuitansi Invoice"])
        UC7(["Kelola Data Pelanggan & Stok"])

        UC8(["Unggah Master Desain & Proofing"])

        UC9(["Perbarui Alur Kanban Produksi"])
        UC10(["Assign Kurir & Pengantaran"])

        UC11(["Simulasi Lokasi & Selesai Kirim"])

        UC12(["Manajemen Pengguna & Staf"])
        UC13(["Kelola Konten CMS Landing Page"])
        UC14(["Laporan Keuangan & Reset Data"])
    end

    Pelanggan --> UC1
    Pelanggan --> UC2
    Pelanggan --> UC3
    Pelanggan --> UC4

    Kasir --> UC5
    Kasir --> UC6
    Kasir --> UC7

    Desainer --> UC8

    Operator --> UC9
    Operator --> UC10

    Driver --> UC11

    Owner --> UC12
    Owner --> UC13
    Owner --> UC14
    Owner --> UC7
    Owner --> UC6
```

---

### 4.4 Entity Relationship Diagram (ERD)

Struktur relasi data dalam basis data `kugiyaiCoreData_v1`:

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : "melakukan"
    ORDER ||--o| DESIGN : "memiliki"
    ORDER ||--o{ PAYMENT : "dibayar lewat"
    ORDER ||--o| PENGANTARAN : "dikirim via"
    DRIVER ||--o{ PENGANTARAN : "mengantar"
    USER ||--o{ ORDER : "memproses"
    STOK ||--o{ ORDER : "digunakan dalam"

    CUSTOMER {
        int id PK "Auto-increment Integer"
        string nama "Nama Pelanggan"
        string hp "Nomor WhatsApp"
        string alamat "Alamat Domisili"
        string instansi "Perusahaan / Instansi"
        object koordinat "{lat, lng} Titik Peta"
    }

    ORDER {
        string no PK "Format: ORD-YYYY-NNNN"
        string pelanggan "Nama Relasi Pelanggan"
        string jenis "Baliho Flexi, Spanduk, dll"
        string ukuran "Contoh: 3x4 m"
        int jumlah "Kuantitas Pesanan"
        int total "Nilai Transaksi (Rp)"
        int dp "Uang Muka (Rp)"
        int sisa "Sisa Tagihan (Rp)"
        date deadline "Tenggat Waktu Selesai"
        string catatan "Instruksi Khusus"
        string statusProduksi "tunggu_desain, cetak, selesai"
        string statusAntar "menunggu, dikirim, selesai"
    }

    DESIGN {
        string orderNo PK, FK "Relasi ke ORDER.no"
        string pelanggan "Nama Pelanggan"
        string file "Nama File Master (.ai/.cdr/.pdf)"
        int versi "Nomor Versi Proofing"
        string status "menunggu, revisi, disetujui"
        string thumbBg "CSS Gradient Thumbnail"
        array log "Riwayat Perubahan Desain"
    }

    PAYMENT {
        string no PK "Format: TRX-NNNN"
        string order FK "Relasi ke ORDER.no"
        string pelanggan "Nama Pelanggan"
        string jenis "DP atau Pelunasan"
        string metode "Tunai, Transfer Bank, QRIS"
        date tanggal "Tanggal Transaksi"
        int jumlah "Nominal Pembayaran (Rp)"
    }

    PENGANTARAN {
        string id PK "Format: PGT-DEMO-NN"
        string orderNo FK "Relasi ke ORDER.no"
        string pelanggan "Nama Penerima"
        string kurir "Nama Driver Pengantar"
        string kendaraan "Motor Box / Pick-up"
        string status "proses, tiba, selesai, batal"
        object asal "{lat, lng} Toko KugiyaiTobe"
        object tujuan "{lat, lng} Alamat Kirim"
        object posisi "{lat, lng} Lokasi Terkini"
        float jarakTotalKm "Jarak Haversine Toko ke Tujuan"
        float jarakSisaKm "Sisa Jarak Real-Time"
        int kecepatanKmh "Kecepatan Armada (km/jam)"
        int etaMenit "Perkiraan Waktu Tiba (menit)"
        float progress "Rasio Selesai (0.0 s/d 1.0)"
        array riwayat "Milestone Pengantaran"
    }

    DRIVER {
        int id PK "Identifikasi Kurir"
        string nama "Nama Lengkap Driver"
        string kendaraan "Tipe Armada & No. Polisi"
        string hp "Nomor Kontak Telepon"
        string rating "Skor Kepuasan (contoh: 4.9)"
        string inisial "Inisial Avatar Bulat"
        string warna "Warna Indikator Pin"
        string status "Aktif atau Nonaktif"
    }

    STOK {
        string nama PK "Nama Bahan Baku / Tinta"
        string kategori "Bahan Cetak, Tinta, Finishing"
        int sisa "Stok Tersisa Saat Ini"
        int kapasitas "Kapasitas Maksimal Gudang"
        string satuan "meter, liter, pcs"
        int minStok "Ambang Batas Peringatan"
        int masuk "Total Akumulasi Masuk"
        int keluar "Total Akumulasi Keluar"
    }

    USER {
        string email PK "Alamat Email Staf"
        string nama "Nama Lengkap Staf"
        string role "Owner, Admin, Designer, dll"
        boolean aktif "Status Akun Aktif"
    }
```

---

### 4.5 Flowchart Alur Operasional Bisnis

Bagan alur terintegrasi dari pelanggan membuat order hingga kurir menyerahkan pesanan:

```mermaid
flowchart TD
    Start([Mulai]) --> A[Pelanggan Masuk / Buka Landing Page]
    A --> B[Pilih Menu Buat Order Baru]
    B --> C[Isi Ukuran, Bahan, & Tentukan Pin Alamat di Peta GPS]
    C --> D[Kasir Verifikasi & Terima DP Pesanan]
    D --> E{Apakah Desain Sudah Siap?}

    E -- Tidak --> F[Desainer Unggah Draft Desain Awal]
    F --> G[Pelanggan Tinjau Proofing Desain]
    G --> H{Apakah Disetujui Pelanggan?}
    H -- Revisi --> F
    H -- Setuju --> I[Status Berubah: Siap Cetak]

    E -- Ya --> I
    I --> J[Operator Produksi Cetak Bahan Sesuai Antrean]
    J --> K[Finishing: Mata Ayam / Seaming / Laminasi]
    K --> L[Status Berubah: Produksi Selesai]

    L --> M{Pilihan Pengambilan}
    M -- Ambil di Toko --> N[Pelanggan Lunasi & Ambil Barang]
    M -- Antar Kurir --> O[Operator Tugaskan Kurir & Pilih Armada]

    O --> P[Kurir Berangkat: Leaflet Engine Simulasi Jalur GPS]
    P --> Q[Pelanggan & Staf Lacak Pergerakan Kurir di Peta]
    Q --> R[Kurir Tiba di Titik Koordinat Tujuan]
    R --> S[Pelanggan Lunasi Tagihan & Tekan Konfirmasi Diterima]
    S --> T[Siklus Pengantaran Tuntas & Simpan Riwayat]
    N --> T
    T --> End([Selesai])
```

---

### 4.6 Diagram Komponen (Component Diagram)

Arsitektur modular aplikasi front-end pada peramban web:

```mermaid
flowchart TD
    subgraph BROWSER["Lingkungan Web Browser Client-Side"]
        subgraph UI_LAYER["Presentation Layer"]
            C_LANDING["Landing Page View\n(index.html)"]
            C_LOGIN["Auth Module View\n(login.html)"]
            C_DASHBOARD["Single Page App Shell\n(dashboard.html)"]
            C_MAP_VIEW["Interactive Map Widget\n(Leaflet Map Container)"]
        end

        subgraph LOGIC_LAYER["State & Business Logic Layer (Alpine.js)"]
            C_STATE["Core Store State\n(app() Reactive Object)"]
            C_ROUTER["Tab & RBAC View Router\n(page, loginRole)"]
            C_CRUD["CRUD Controllers\n(Order, Desain, Bayar, Stok, Driver)"]
            C_GPS_ENGINE["GPS Simulator & Haversine Calc\n(clockTick 1000ms loop)"]
        end

        subgraph INTEGRATION_LAYER["Third-Party Service Layer"]
            C_LEAFLET["Leaflet Engine v1.9.4"]
            C_CARTO["CartoDB Voyager HD Tiles"]
            C_CHART["Chart.js Analytics Renderer"]
        end

        subgraph STORAGE_LAYER["Persistent Storage Layer"]
            S_CORE[("kugiyaiCoreData_v1\n(Operational DB)")]
            S_SESSION[("kugiyaiSession_v1\n(Active Session)")]
            S_CMS[("kugiyaiLandingSettings\n(CMS Content)")]
            S_BUS["Storage Event Bus\n(Cross-Tab Synchronization)"]
        end
    end

    C_LANDING --> S_CMS
    C_LANDING --> S_SESSION
    C_LOGIN --> S_SESSION
    C_DASHBOARD --> C_ROUTER
    C_ROUTER --> C_STATE
    C_STATE --> C_CRUD
    C_CRUD --> C_GPS_ENGINE
    C_GPS_ENGINE --> C_LEAFLET
    C_LEAFLET --> C_CARTO
    C_STATE --> C_CHART

    C_CRUD <--> S_CORE
    C_STATE <--> S_SESSION
    C_CRUD <--> S_CMS
    S_BUS <--> C_LANDING
    S_BUS <--> C_DASHBOARD
```

---

### 4.7 Sequence Diagram (Siklus Order & Pengantaran)

Interaksi sekuensial antar-komponen saat order diproses dan diantar:

```mermaid
sequenceDiagram
    autonumber
    actor Pelanggan
    actor Kasir
    actor Operator
    actor Kurir
    participant Dashboard as dashboard.html (SPA)
    participant Script as script.js (Alpine State)
    participant Storage as localStorage (Core DB)
    participant MapEngine as Leaflet / CartoDB

    Pelanggan->>Dashboard: Input Order Baru + Tandai Titik Peta
    Dashboard->>Script: simpanOrder()
    Script->>Storage: Update kugiyaiCoreData_v1 (orders)
    Storage-->>Dashboard: Data Tersimpan & Refresh Tabel

    Kasir->>Dashboard: Input Pembayaran DP
    Dashboard->>Script: simpanBayar()
    Script->>Storage: Update sisa tagihan order & log payment

    Operator->>Dashboard: Ubah status produksi -> 'selesai'
    Operator->>Dashboard: Buka Form Pengantaran (pilih Kurir & titik tujuan)
    Operator->>Script: prosesKirim()
    Script->>Storage: Buat entitas pengantaran baru (status: 'proses')

    loop Setiap Detik (clockTick 1000ms)
        Script->>Script: Hitung posisi intermediate, sisa km, & ETA
        Script->>MapEngine: Geser marker kurir (.peta-pin-kurir)
        MapEngine-->>Dashboard: Perbarui garis lintasan polylines
    end

    Kurir->>Dashboard: Tiba di tujuan (progress 100%)
    Script->>Storage: Status pengantaran berubah -> 'tiba'

    Pelanggan->>Dashboard: Klik tombol 'Konfirmasi Diterima'
    Dashboard->>Script: konfirmasiTerima(orderNo)
    Script->>Storage: Status order & pengantaran -> 'selesai'
    Storage-->>Dashboard: Notifikasi Sukses & Tutup Siklus
```

---

## 🗺️ Peta GPS & Manajemen Armada Kurir (CartoDB Voyager HD)

Seluruh peta dalam aplikasi menggunakan pustaka **Leaflet.js** yang telah ditingkatkan ke layer tile **CartoDB Voyager HD**:

```
https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png
Subdomains: ['a', 'b', 'c', 'd'] | Max Zoom: 19
```

### Keunggulan & Konfigurasi Tile:

- **Tampilan Tajam & Modern**: Memiliki kontras tinggi, visual jalan bersih, serta render label toponimi wilayah Papua Tengah yang presisi.
- **Marker Kustom CSS Interaktif**:
  - `Pin Toko`: Warna merah tua aksen logo KugiyaiTobe (`.peta-pin-toko`).
  - `Pin Kurir`: Ikon motor/mobil dinamis dengan label nama kurir (`.peta-pin-kurir`).
  - `Pin Tujuan Pelanggan`: Pin lokasi tujuan dengan efek pulsing radar (`.peta-pin-tujuan`).
- **Validasi Wajib Koordinat**: Pengantaran **hanya dapat dimulai** apabila titik koordinat tujuan telah dipilih secara pasti melalui Map Picker interaktif atau lokasi tersimpan pelanggan.

---

## 💾 Skema Penyimpanan & Sinkronisasi Lintas-Halaman

Aplikasi menggunakan skema **Dual-Format Session & Storage Engine** untuk memastikan integrasi mulus antara `index.html`, `login.html`, dan `dashboard.html`:

| Storage Key                      | Lingkup          | Format Data & Keterangan                                                                                                                                                    |
| -------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kugiyaiCoreData_v1`             | `localStorage`   | Menyimpan 8 koleksi utama: `customers`, `orders`, `designs`, `payments`, `stok`, `users`, `pengantaran`, `kurirAktif`.                                                      |
| `kugiyaiSession_v1`              | `localStorage`   | **Dual-Format Object**: Menyimpan properti `loginRole` & `loginUserName` (untuk script.js) sekaligus `role`, `user`, & `username` (untuk login.html dan navbar index.html). |
| `kugiyaiLandingSettings`         | `localStorage`   | Menyimpan 30 atribut konfigurasi landing page CMS (hero, banner slideshow, promosi, galeri, layanan, testimoni, harga).                                                     |
| `kugiyaiLandingSettingsSyncedAt` | `localStorage`   | Timestamp pemicu event `storage` browser untuk sinkronisasi realtime lintas tab.                                                                                            |
| `kugiyaiAuthPrefill`             | `sessionStorage` | Payload serah-terima satu-kali pakai dari formulir auth `index.html` ke dashboard.                                                                                          |

---

## 🔍 Hasil Audit & Pembaruan Terakhir

Pada pembaharuan versi final ini, telah diselesaikan audit kode menyeluruh dengan rincian perbaikan sebagai berikut:

1. ✅ **Sinkronisasi Skema Sesi Lintas Berkas**: `saveSession()` dan `loadSession()` di `script.js` kini mendukung skema ganda, mencegah sesi pengguna reset ke default saat berpindah halaman.
2. ✅ **Normalisasi Tipe Data ID Pelanggan**: Pembuatan akun di `login.html` telah diperbaiki dari string acak (`CST-...`) menjadi _numeric auto-increment_ yang konsisten dengan `script.js`, mencegah _bug_ kalkulasi `NaN`.
3. ✅ **Fallback Penuh Gambar GitHub Pages**: `index.html` kini dibekali objek `LANDING_DEFAULTS` lengkap sehingga portofolio galeri dan banner ticket tetap tampil sempurna di perangkat baru yang belum memiliki riwayat `localStorage`.
4. ✅ **Standardisasi Konstanta CMS**: `CMS_KEY` dan `CMS_SYNC_KEY` telah didokumentasikan dan diikat ke konstanta baku di awal `script.js`.
5. ✅ **Navbar Auth Overlay**: Tautan masuk pada navbar `index.html` kini otomatis membuka modal interaktif saat belum login, dan langsung mengarahkan ke dashboard jika sesi sudah aktif.
6. ✅ **Tampilan Hero Typography**: Penekanan visual `<em>tajam,</em>` pada judul hero dipertahankan secara utuh pada template dinamis.

---

## 🚀 Panduan Penggunaan & Uji Coba

1. **Menjalankan Proyek**:
   - Cukup buka file `index.html` atau `dashboard.html` langsung menggunakan web browser modern (Google Chrome, Microsoft Edge, Mozilla Firefox, atau Safari).
   - Tidak memerlukan Node.js, Python server, database server, maupun build command tambahan.

2. **Mencoba Berbagai Peran Pengguna**:
   - Buka menu profil di pojok kiri bawah dashboard (`@click="openModalProfil()"`).
   - Pada bagian **Simulator Peran**, klik tombol peran yang diinginkan (_Owner_, _Admin_, _Designer_, _Operator_, _Kasir_, atau _Pelanggan_).
   - Antarmuka navigasi dan hak akses akan langsung beradaptasi secara dinamis.

3. **Menguji Lacak Pengantaran**:
   - Masuk sebagai Operator Produksi atau Admin.
   - Buka menu **Pemesanan**, pilih pesanan yang berstatus produksi **Selesai**.
   - Klik tombol **"Kirim untuk Diantar"**, tentukan kurir dan pastikan titik koordinat tujuan dipilih di peta.
   - Buka menu **Lacak Pengantaran** untuk melihat animasi pergerakan kurir secara real-time.
