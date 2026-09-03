function rupiah(n) {
    return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}
window.rupiah = rupiah;

console.info('[CETAK.OS] script.js loaded — build 2026-08-25 (pilih lokasi pengantaran manual)');

// Kunci localStorage tempat seluruh data operasional (pelanggan, order, desain,
// pembayaran, stok, user) disimpan permanen di browser. Diberi akhiran versi
// supaya kalau struktur data berubah di rilis berikutnya, kita bisa menaikkan
// versinya tanpa bentrok dengan data lama yang formatnya berbeda.
const CORE_DATA_KEY = 'kugiyaiCoreData_v1';
const CORE_DATA_FIELDS = ['customers', 'orders', 'designs', 'payments', 'stok', 'users', 'pengantaran', 'kurirAktif'];

// Kunci localStorage tempat sesi login AKTIF disimpan (siapa yang sedang login
// & sebagai peran apa). Dulu sesi hanya "titip lewat" sessionStorage sekali
// pakai (kugiyaiAuthPrefill) dari index.html lalu langsung dihapus begitu
// dibaca — akibatnya begitu halaman dashboard di-refresh, tidak ada lagi
// jejak siapa yang login sehingga aplikasi selalu jatuh balik ke sesi
// default (Owner). Sekarang begitu login/beralih peran berhasil, sesi
// disimpan permanen di sini juga supaya bertahan lintas refresh & lintas tab.
const SESSION_KEY = 'kugiyaiSession_v1';

// Kunci localStorage tempat pengaturan konten CMS Landing Page disimpan.
// Dipisah dari data operasional supaya perubahan landing page (promo, galeri, teks)
// tidak memicu reload data order/pelanggan, dan agar index.html bisa mendengarkan
// hanya perubahan CMS tanpa menginterpretasi seluruh data operasional.
const CMS_KEY = 'kugiyaiLandingSettings';
const CMS_SYNC_KEY = 'kugiyaiLandingSettingsSyncedAt';
const LANDING_ASSET_PATHS = {
    banner: [
        'asset/img/banner-ticket/ticket-1.jpeg',
        'asset/img/banner-ticket/ticket-2.jpg',
        'asset/img/banner-ticket/ticket-3.jpeg',
        'asset/img/banner-ticket/ticket-4.jpg',
        'asset/img/banner-ticket/ticket-5.png',
        'asset/img/banner-ticket/ticket-6.jpeg',
    ],
    gallery: [
        'asset/img/gallery/gallery-1.jpeg',
        'asset/img/gallery/gallery-2.jpeg',
        'asset/img/gallery/gallery-3.png',
        'asset/img/gallery/gallery-4.png',
        'asset/img/gallery/gallery-5.jpeg',
        'asset/img/gallery/gallery-6.jpeg',
    ],
};

function canonicalAssetPath(path, type) {
    const paths = LANDING_ASSET_PATHS[type];
    return typeof path === 'string' && paths.includes(path) ? path : null;
}

function canonicalLandingImages(saved, defaults) {
    const normalized = { ...saved };
    const bannerImages = Array.isArray(saved.heroBannerGaleri) && saved.heroBannerGaleri.length
        ? saved.heroBannerGaleri : defaults.heroBannerGaleri;
    normalized.heroBannerGaleri = bannerImages
        .map(path => canonicalAssetPath(path, 'banner'))
        .filter(Boolean);
    if (!normalized.heroBannerGaleri.length) normalized.heroBannerGaleri = [...LANDING_ASSET_PATHS.banner];
    normalized.heroBannerGambar = normalized.heroBannerGaleri[0];

    const galleryItems = Array.isArray(saved.galeri) && saved.galeri.length ? saved.galeri : defaults.galeri;
    normalized.galeri = galleryItems.map(item => {
        const gambar = canonicalAssetPath(item && item.gambar, 'gallery');
        return gambar ? { ...item, gambar } : null;
    }).filter(Boolean);
    if (!normalized.galeri.length) normalized.galeri = defaults.galeri.map((item, index) => ({
        ...item,
        gambar: LANDING_ASSET_PATHS.gallery[index],
    }));
    return normalized;
}

// ============================================================
// PETA GPS PENGANTARAN — konstanta & helper murni (bisa dipakai
// ulang di luar Alpine, dan hasilnya selalu konsisten/deterministik
// untuk input yang sama).
// ============================================================

// Titik keberangkatan (asal) seluruh pengantaran: lokasi toko/percetakan
// di Waghete, Deiyai, Papua Tengah.
const TOKO_LOKASI = { lat: -4.0346375, lng: 136.2877969, label: 'Percetakan KugiyaiTobe — Jl. Mugou Kebo, Waghete II, Kec. Tigi, Kab. Deiyai, Papua Tengah 98764' };
window.TOKO_LOKASI = TOKO_LOKASI;

// Jarak garis-lurus antar 2 koordinat (haversine), hasil dalam kilometer.
function haversineKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}
window.haversineKm = haversineKm;

// Menghasilkan koordinat "tujuan pengantaran" yang DETERMINISTIK dari sebuah
// teks kunci (nama pelanggan, dsb). Karena murni fungsi dari string yang sama,
// setiap pelanggan selalu jatuh di titik yang sama pada peta — konsisten
// walau data di-reset atau dibuka ulang di sesi lain, tanpa perlu disimpan.
function seedCoordFromString(str, center) {
    let hash = 0;
    const s = String(str || 'pelanggan');
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0;
    }
    const r1 = Math.abs(Math.sin(hash));
    const r2 = Math.abs(Math.cos(hash * 1.37 + 1));
    const radiusDeg = 0.006 + r1 * 0.035; // ± sekitar 0.7 km - 4.5 km dari toko
    const angle = r2 * Math.PI * 2;
    return {
        lat: center.lat + radiusDeg * Math.sin(angle),
        lng: center.lng + (radiusDeg * Math.cos(angle)) / Math.cos(center.lat * Math.PI / 180),
    };
}
window.seedCoordFromString = seedCoordFromString;

// ============================================================
// RUTE JALAN SUNGGUHAN (OSRM) — dipakai supaya jalur & posisi kurir di peta
// mengikuti bentuk jalan yang sebenarnya (bukan garis lurus udara), dan
// jarak/ETA dihitung dari jarak tempuh jalan yang riil.
// ============================================================

// Cache hasil rute per pasangan asal→tujuan supaya tidak fetch berulang
// untuk kombinasi yang sama persis dalam satu sesi halaman.
const _ruteCache = {};

// Ambil rute jalan antara dua titik lewat OSRM (Open Source Routing Machine),
// layanan routing publik gratis berbasis data jalan OpenStreetMap — sumber
// data yang sama dengan tile peta yang sudah dipakai Leaflet di aplikasi ini.
// Hasil: daftar titik koordinat mengikuti bentuk jalan sungguhan, jarak
// tempuh riil (km), estimasi durasi berkendara (menit), dan jarak kumulatif
// tiap titik (untuk menempatkan posisi kurir tepat di sepanjang jalan sesuai
// persentase progress). Kalau gagal — tidak ada internet, atau OSRM tidak
// menemukan jalur yang menghubungkan kedua titik (mis. daerah yang jalannya
// belum lengkap terpetakan di OpenStreetMap) — fungsi ini mengembalikan
// null, dan pemanggilnya otomatis jatuh balik ke garis lurus (haversine)
// supaya pelacakan tetap berjalan walau tanpa rute jalan.
async function fetchRuteJalan(asal, tujuan) {
    const key = asal.lat.toFixed(5) + ',' + asal.lng.toFixed(5) + '>' + tujuan.lat.toFixed(5) + ',' + tujuan.lng.toFixed(5);
    if (Object.prototype.hasOwnProperty.call(_ruteCache, key)) return _ruteCache[key];
    try {
        const url = 'https://router.project-osrm.org/route/v1/driving/' +
            asal.lng + ',' + asal.lat + ';' + tujuan.lng + ',' + tujuan.lat +
            '?overview=full&geometries=geojson';
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('OSRM: rute tidak ditemukan');
        const route = data.routes[0];
        // GeoJSON pakai urutan [lng, lat] — dibalik ke {lat, lng} supaya
        // konsisten dengan format koordinat yang dipakai di seluruh aplikasi.
        const coords = route.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
        const hasil = {
            coords,
            jarakKm: route.distance / 1000,
            durasiMenit: route.duration / 60,
            cum: kumulatifJarak(coords),
        };
        _ruteCache[key] = hasil;
        return hasil;
    } catch (e) {
        console.warn('[CETAK.OS] Rute jalan tidak tersedia, pakai garis lurus sebagai cadangan:', e && e.message);
        _ruteCache[key] = null;
        return null;
    }
}
window.fetchRuteJalan = fetchRuteJalan;

// Jarak kumulatif (km, haversine per-segmen) dari titik pertama ke setiap
// titik rute — dipakai untuk menempatkan posisi kurir di titik yang tepat
// sepanjang bentuk jalan sesuai persentase progress perjalanan.
function kumulatifJarak(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
        cum.push(cum[i - 1] + haversineKm(coords[i - 1], coords[i]));
    }
    return cum;
}
window.kumulatifJarak = kumulatifJarak;

// Posisi di sepanjang rute (array titik + jarak kumulatif) untuk suatu
// progress 0..1 — hasilnya selalu berada TEPAT DI ATAS jalur jalan, bukan
// hasil interpolasi garis lurus antara dua titik jauh.
function posisiSepanjangRute(rute, progress) {
    const total = rute.cum[rute.cum.length - 1] || 0.0001;
    const target = Math.min(total, Math.max(0, total * progress));
    let i = 1;
    while (i < rute.cum.length && rute.cum[i] < target) i++;
    if (i >= rute.cum.length) return rute.coords[rute.coords.length - 1];
    const segFrom = rute.coords[i - 1], segTo = rute.coords[i];
    const segLen = rute.cum[i] - rute.cum[i - 1] || 0.0001;
    const t = (target - rute.cum[i - 1]) / segLen;
    return {
        lat: segFrom.lat + (segTo.lat - segFrom.lat) * t,
        lng: segFrom.lng + (segTo.lng - segFrom.lng) * t,
    };
}
window.posisiSepanjangRute = posisiSepanjangRute;

// Titik tujuan pengantaran untuk sebuah pelanggan/order — dibungkus supaya
// label alamat ikut terbawa bila tersedia.
function koordinatTujuan(customer, order) {
    const key = (customer && (customer.nama + '|' + customer.id)) || (order && order.pelanggan) || 'pelanggan';
    const p = seedCoordFromString(key, TOKO_LOKASI);
    const label = (customer && customer.alamat) ? customer.alamat : ((order && order.pelanggan) || 'Alamat pelanggan');
    return { lat: p.lat, lng: p.lng, label };
}
window.koordinatTujuan = koordinatTujuan;

// Format relatif "X detik/menit/jam lalu" dari sebuah timestamp ISO.
function waktuLalu(iso) {
    if (!iso) return '-';
    const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
    const detik = Math.floor(diffMs / 1000);
    if (detik < 5) return 'baru saja';
    if (detik < 60) return detik + ' detik lalu';
    const menit = Math.floor(detik / 60);
    if (menit < 60) return menit + ' menit lalu';
    const jam = Math.floor(menit / 60);
    if (jam < 24) return jam + ' jam lalu';
    return Math.floor(jam / 24) + ' hari lalu';
}
window.waktuLalu = waktuLalu;

const KPI_ICONS = {
    order: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 3H15L14 6H10L9 3Z" stroke="currentColor" stroke-width="1.8"/><path d="M5 6H19L18 21H6L5 6Z" stroke="currentColor" stroke-width="1.8"/></svg>',
    wait: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7V12L15.5 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    print: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="4" y="9" width="16" height="7" rx="1" stroke="currentColor" stroke-width="1.8"/><path d="M7 9V4H17V9" stroke="currentColor" stroke-width="1.8"/><rect x="7" y="16" width="10" height="5" stroke="currentColor" stroke-width="1.8"/></svg>',
    done: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    money: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 1V23M17 5H9.5C7.01 5 5 7.01 5 9.5C5 11.99 7.01 14 9.5 14H14.5C16.99 14 19 16.01 19 18.5C19 20.99 16.99 23 14.5 23H7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    piutang: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 8V12L15 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    avg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 17L9 11L13 15L21 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function app() {
    return {
        // ---------- role / session identity (no login gate — set once here) ----------
        loginRole: 'Owner',
        loginUserName: 'Admin KugiyaiTobe',
        loginUserAvatar: '',
        loginCustomerId: 1,
        page: 'dashboard',
        custSearch: '',
        orderFilter: 'Semua',
        reportPeriod: 'Bulanan',
        selectedOrder: null,
        selectedCustomer: null,
        selectedDesign: null,
        globalSearch: '',
        notifOpen: false,
        revenueRange: 'harian',

        avatarPresets: [
            { label: 'Admin Cetak', url: 'asset/img/gallery/gallery-1.jpeg' },
            { label: 'Operator Pro', url: 'asset/img/gallery/gallery-2.jpeg' },
            { label: 'Desainer Grafis', url: 'asset/img/gallery/gallery-3.png' },
            { label: 'Kasir Utama', url: 'asset/img/gallery/gallery-4.png' },
            { label: 'Pimpinan / Owner', url: 'asset/img/gallery/gallery-5.jpeg' },
            { label: 'Klien Percetakan', url: 'asset/img/gallery/gallery-6.jpeg' },
        ],

        // ---------- nav ----------
        navItemsStaff: [
            { key: 'dashboard', label: 'Dashboard', desc: 'Ringkasan performa percetakan', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'pelanggan', label: 'Data Pelanggan', desc: 'Kelola profil & riwayat pelanggan', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20C4.5 16.4 7.85 13.5 12 13.5C16.15 13.5 19.5 16.4 19.5 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
            { key: 'order', label: 'Pemesanan', desc: 'Kelola order dari masuk hingga tuntas', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 3H15L14 6H10L9 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 6H19L18 21H6L5 6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
            { key: 'desain', label: 'Manajemen Desain', desc: 'Upload, revisi, dan persetujuan desain', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M21 15L16 10L5 21" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'produksi', label: 'Produksi', desc: 'Papan alur status pengerjaan cetak', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 21V13C4 12.4477 4.44772 12 5 12H9V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 21V8C10 7.44772 10.4477 7 11 7H14C14.5523 7 15 7.44772 15 8V21" stroke="currentColor" stroke-width="1.8"/><path d="M16 21V4C16 3.44772 16.4477 3 17 3H19C19.5523 3 20 3.44772 20 4V21" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'peta', label: 'Lacak Pengantaran', desc: 'Pantau lokasi kurir & pengiriman real-time', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21C12 21 19 14.6 19 9.5C19 5.36 15.64 2 12 2C8.36 2 5 5.36 5 9.5C5 14.6 12 21 12 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'driver', label: 'Driver & Armada', desc: 'Kelola tim kurir & kendaraan pengantar', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 18H3C2.44772 18 2 17.5523 2 17V11C2 9.89543 2.89543 9 4 9H16C17.1046 9 18 9.89543 18 11V17C18 17.5523 17.5523 18 17 18H15" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="18" r="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="14.5" cy="18" r="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M18 11H21L23 14V17H21" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'pembayaran', label: 'Pembayaran', desc: 'DP, pelunasan, dan riwayat transaksi', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M2 10H22" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'stok', label: 'Stok / Bahan', desc: 'Kelola bahan baku dan tinta', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 8L12 3L3 8L12 13L21 8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 8V16L12 21L21 16V8" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 13V21" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'laporan', label: 'Laporan', desc: 'Analisis penjualan dan performa bisnis', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M12 20V4M20 20V14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
            { key: 'users', label: 'User & Hak Akses', desc: 'Kelola pengguna dan peran sistem', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 15C7.5 15 4 17 4 20V21H20V20C20 17 16.5 15 12 15Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'landing', label: 'Landing Page', desc: 'Kelola konten & promo halaman depan', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9L12 3L21 9V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
        ],
        navItemsCustomer: [
            { key: 'dashboard', label: 'Dashboard Saya', desc: 'Ringkasan pesanan & tagihan Anda', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'order', label: 'Pesanan Saya', desc: 'Lihat status & buat pesanan baru', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 3H15L14 6H10L9 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 6H19L18 21H6L5 6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
            { key: 'peta', label: 'Lacak Pesanan Saya', desc: 'Pantau kurir menuju alamat Anda secara real-time', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21C12 21 19 14.6 19 9.5C19 5.36 15.64 2 12 2C8.36 2 5 5.36 5 9.5C5 14.6 12 21 12 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'desain', label: 'Desain Saya', desc: 'Tinjau dan setujui desain cetakan', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M21 15L16 10L5 21" stroke="currentColor" stroke-width="1.8"/></svg>' },
            { key: 'pembayaran', label: 'Pembayaran Saya', desc: 'Riwayat transaksi dan sisa tagihan', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M2 10H22" stroke="currentColor" stroke-width="1.8"/></svg>' },
        ],
        get navItems() {
            if (this.loginRole === 'Pelanggan') return this.navItemsCustomer;
            // "Landing Page" hanya bisa dibuka oleh Owner & Admin (sesuai gating x-show
            // pada section-nya) — role staff lain tidak ditampilkan menunya supaya tidak
            // klik ke halaman kosong.
            if (this.loginRole === 'Owner' || this.loginRole === 'Admin') return this.navItemsStaff;
            return this.navItemsStaff.filter(item => item.key !== 'landing');
        },
        get currentNav() { return this.navItems.find(n => n.key === this.page) || this.navItems[0]; },

        // ---------- forms ----------
        formProfile: { nama: '', email: '', hp: '', instansi: '', avatar: '', passwordLama: '', passwordBaru: '', konfirmasiPassword: '', role: '' },
        profilError: '',
        formOrder: { pelangganId: '', jenis: 'Baliho Flexi', panjang: null, lebar: null, satuan: 'm', jumlah: 1, hargaM2: 25000, biayaDesain: 0, biayaFinishing: 0, dp: 0, metodeDp: 'Tunai', deadline: '', catatan: '' },
        orderError: '',
        formPelanggan: { nama: '', hp: '', alamat: '', instansi: '' },
        pelangganError: '',
        formDesain: { orderNo: '', file: '', gambar: '', catatan: '' },
        desainError: '',
        // formKirim.lokasiTujuan: { lat, lng } — koordinat tujuan pengantaran
        // yang WAJIB dipilih secara manual oleh owner/kurir (klik/seret pin di
        // peta mini, atau tombol "pakai lokasi tersimpan" / "pakai lokasi saya
        // sekarang") SEBELUM pengantaran boleh dimulai. Sebelumnya titik ini
        // dibuat otomatis/acak dari nama pelanggan — sekarang harus dikonfirmasi
        // manusia dulu. Lihat bukaFormKirim(), initLokasiPickerMap(), prosesKirim().
        formKirim: { kurir: '', lokasiTujuan: null, alamatTujuan: '' },
        kirimError: '',
        kirimPanelOpen: false,
        // Titik lokasi pengantaran yang ditandai Pelanggan di peta modal
        // "Buat Order Baru" (mapLokasiOrderBaru). Diisi otomatis dari
        // customer.koordinat kalau sudah pernah ada, atau lewat klik/seret
        // pin/tombol GPS. Ikut disimpan ke customer.koordinat begitu order
        // berhasil dibuat — lihat initLokasiOrderBaruMap() & simpanOrder().
        _orderBaruLokasiPending: null,
        petaFokusId: null,
        clockTick: 0,
        desainFilter: 'Semua',
        desainSearch: '',
        desainPresets: [
            { label: 'Stiker & Label Cutting', url: 'asset/img/gallery/gallery-5.jpeg', file: 'stiker_cutting_final.ai' },
            { label: 'Baliho Digital Printing', url: 'asset/img/gallery/gallery-1.jpeg', file: 'baliho_flexi_3x4.cdr' },
            { label: 'Banner Roll Up Pameran', url: 'asset/img/gallery/gallery-3.png', file: 'banner_rollup_expo.pdf' },
            { label: 'Baliho Toko Promosi', url: 'asset/img/gallery/gallery-4.png', file: 'baliho_toko_v2.ai' },
            { label: 'Spanduk Acara Gereja', url: 'asset/img/gallery/gallery-2.jpeg', file: 'spanduk_event_final.cdr' },
            { label: 'Backdrop Panggung Event', url: 'asset/img/gallery/gallery-6.jpeg', file: 'stage_backdrop_v1.ai' },
        ],
        formBayar: { orderNo: '', jenis: 'DP', metode: 'Tunai', jumlah: null },
        bayarError: '',
        formStok: { bahan: '', tipe: 'Stok Masuk', jumlah: null },
        stokError: '',
        formUser: { nama: '', email: '', role: 'Admin' },
        userError: '',
        formDriver: { id: null, nama: '', kendaraan: '', hp: '', status: 'Aktif' },
        driverError: '',
        driverEditMode: false,

        resetFormOrder() {
            this.formOrder = { pelangganId: '', jenis: 'Baliho Flexi', panjang: null, lebar: null, satuan: 'm', jumlah: 1, hargaM2: 25000, biayaDesain: 0, biayaFinishing: 0, dp: 0, metodeDp: 'Tunai', deadline: '', catatan: '' };
            this.orderError = '';
            this._orderBaruLokasiPending = null;
            if (this._orderBaruMap) { try { this._orderBaruMap.remove(); } catch (e) { /* no-op */ } this._orderBaruMap = null; this._orderBaruMarker = null; }
        },
        resetFormPelanggan() { this.formPelanggan = { nama: '', hp: '', alamat: '', instansi: '' }; this.pelangganError = ''; },
        resetFormDesain() { this.formDesain = { orderNo: '', file: '', gambar: '', catatan: '' }; this.desainError = ''; },
        resetFormBayar() { this.formBayar = { orderNo: '', jenis: 'DP', metode: 'Tunai', jumlah: null }; this.bayarError = ''; },
        resetFormStok() { this.formStok = { bahan: '', tipe: 'Stok Masuk', jumlah: null }; this.stokError = ''; },
        resetFormUser() { this.formUser = { nama: '', email: '', role: 'Admin' }; this.userError = ''; },
        resetFormDriver() { this.formDriver = { id: null, nama: '', kendaraan: '', hp: '', status: 'Aktif' }; this.driverError = ''; this.driverEditMode = false; },

        // ---------- data ----------
        customers: [
            { id: 1, nama: 'Petrus Kambu', hp: '0812-4801-9921', alamat: 'Mugou, Waghete', instansi: 'Toko Sinar Papua' },
            { id: 2, nama: 'Fitri Handayani', hp: '0821-9934-1102', alamat: 'Waghete II, Deiyai', instansi: 'CV Papua Digital' },
            { id: 3, nama: 'Yakob Rumbrar', hp: '0852-4411-8890', alamat: 'Jl. Trans Papua, Deiyai', instansi: 'GKI Immanuel Deiyai' },
            { id: 4, nama: 'Maria Ayamiseba', hp: '0813-5522-7744', alamat: 'Waghete', instansi: 'Koperasi Cendrawasih' },
            { id: 5, nama: 'Selvi Mansawan', hp: '0822-6633-4411', alamat: 'Tigi, Deiyai', instansi: 'Dinas Pariwisata' },
            { id: 6, nama: 'Yustus Wanma', hp: '0812-7788-9900', alamat: 'Mugou', instansi: 'Pribadi' },
        ],

        orders: [
            { no: 'ORD-2026-0090', pelanggan: 'Selvi Mansawan', jenis: 'Spanduk Vinyl', ukuran: '1×3 m', jumlah: 2, total: 610000, dp: 610000, sisa: 0, deadline: '30 Jul 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0098', pelanggan: 'Yustus Wanma', jenis: 'Spanduk Vinyl', ukuran: '1×2 m', jumlah: 3, total: 420000, dp: 420000, sisa: 0, deadline: '2 Agu 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0110', pelanggan: 'Petrus Kambu', jenis: 'Banner Roll Up', ukuran: '0.85×2 m', jumlah: 1, total: 390000, dp: 390000, sisa: 0, deadline: '5 Agu 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0119', pelanggan: 'Selvi Mansawan', jenis: 'Baliho Flexi', ukuran: '3×4 m', jumlah: 1, total: 3200000, dp: 3200000, sisa: 0, deadline: '8 Agu 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0125', pelanggan: 'Yakob Rumbrar', jenis: 'Baliho Flexi', ukuran: '1×2 m', jumlah: 2, total: 980000, dp: 980000, sisa: 0, deadline: '10 Agu 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0135', pelanggan: 'Petrus Kambu', jenis: 'Stiker', ukuran: '1×1 m', jumlah: 10, total: 275000, dp: 275000, sisa: 0, deadline: '13 Agu 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0138', pelanggan: 'Fitri Handayani', jenis: 'Baliho Flexi', ukuran: '2×3 m', jumlah: 1, total: 2100000, dp: 2100000, sisa: 0, deadline: '15 Agu 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0140', pelanggan: 'Maria Ayamiseba', jenis: 'Baliho Flexi', ukuran: '1×2 m', jumlah: 3, total: 1650000, dp: 1650000, sisa: 0, deadline: '17 Agu 2026', catatan: '', statusProduksi: 'selesai' },
            { no: 'ORD-2026-0142', pelanggan: 'Yustus Wanma', jenis: 'Baliho Flexi', ukuran: '2×3 m', jumlah: 2, total: 850000, dp: 400000, sisa: 450000, deadline: '22 Agu 2026', catatan: 'Logo instansi harus tajam', statusProduksi: 'cetak' },
            { no: 'ORD-2026-0143', pelanggan: 'Maria Ayamiseba', jenis: 'Baliho Flexi', ukuran: '1×2 m', jumlah: 3, total: 1650000, dp: 1650000, sisa: 0, deadline: '23 Agu 2026', catatan: '', statusProduksi: 'finishing' },
            { no: 'ORD-2026-0144', pelanggan: 'Petrus Kambu', jenis: 'Stiker', ukuran: '1×1 m', jumlah: 10, total: 275000, dp: 100000, sisa: 175000, deadline: '21 Agu 2026', catatan: 'Laminasi doff', statusProduksi: 'tunggu_setuju' },
            { no: 'ORD-2026-0145', pelanggan: 'Fitri Handayani', jenis: 'Baliho Flexi', ukuran: '2×3 m', jumlah: 1, total: 2100000, dp: 1000000, sisa: 1100000, deadline: '25 Agu 2026', catatan: 'Revisi warna sesuai brand guide', statusProduksi: 'tunggu_desain' },
            { no: 'ORD-2026-0146', pelanggan: 'Yakob Rumbrar', jenis: 'Baliho Flexi', ukuran: '1×2 m', jumlah: 2, total: 980000, dp: 980000, sisa: 0, deadline: '24 Agu 2026', catatan: '', statusProduksi: 'siap_cetak' },
            { no: 'ORD-2026-0147', pelanggan: 'Selvi Mansawan', jenis: 'Baliho Flexi', ukuran: '3×4 m', jumlah: 1, total: 3200000, dp: 1500000, sisa: 1700000, deadline: '27 Agu 2026', catatan: 'Pasang sekaligus di venue', statusProduksi: 'tunggu_setuju' },
            { no: 'ORD-2026-0148', pelanggan: 'Yustus Wanma', jenis: 'Spanduk Vinyl', ukuran: '1×2 m', jumlah: 4, total: 420000, dp: 420000, sisa: 0, deadline: '20 Agu 2026', catatan: '', statusProduksi: 'selesai', statusAntar: 'selesai' },
            { no: 'ORD-2026-0149', pelanggan: 'Petrus Kambu', jenis: 'Banner Roll Up', ukuran: '1×2 m', jumlah: 1, total: 390000, dp: 390000, sisa: 0, deadline: '19 Agu 2026', catatan: '', statusProduksi: 'selesai', statusAntar: 'dikirim' },
        ],

        // ---------- kurir aktif (untuk ditugaskan mengantar order) ----------
        kurirAktif: [
            { nama: 'Boas Douw', kendaraan: 'Motor Box · DS 4021 XY', hp: '6281240902277', rating: '4.9', inisial: 'BD', warna: '#C2141A' },
            { nama: 'Amos Kayame', kendaraan: 'Motor Box · DS 3312 QP', hp: '6282199341102', rating: '4.8', inisial: 'AK', warna: '#0F6E6E' },
            { nama: 'Nikolas Pekei', kendaraan: 'Pick-up Terbuka · DS 8890 T', hp: '6285244118890', rating: '5.0', inisial: 'NP', warna: '#7C5CFC' },
        ],

        // ---------- pengantaran (lacak lokasi kurir real-time via peta GPS) ----------
        // status: 'proses' (dalam perjalanan) → 'tiba' (sampai, menunggu konfirmasi)
        //         → 'selesai' (dikonfirmasi diterima) | 'batal' (dibatalkan)
        pengantaran: (function () {
            const asal = TOKO_LOKASI;
            // Demo 1: sedang dalam perjalanan (progress ~45%) supaya langsung
            // terlihat bergerak real-time saat halaman Peta dibuka.
            const tujuan1 = { lat: -4.0700, lng: 136.3000, label: 'Mugou, Waghete' };
            const totalKm1 = haversineKm(asal, tujuan1);
            const progress1 = 0.45;
            const posisi1 = {
                lat: asal.lat + (tujuan1.lat - asal.lat) * progress1,
                lng: asal.lng + (tujuan1.lng - asal.lng) * progress1,
            };
            const mulai1 = new Date(Date.now() - 6 * 60 * 1000).toISOString();
            const update1 = new Date(Date.now() - 4 * 1000).toISOString();

            // Demo 2: riwayat — sudah terkirim & dikonfirmasi kemarin.
            const tujuan2 = { lat: -4.0200, lng: 136.2600, label: 'Waghete II, Deiyai' };
            const totalKm2 = haversineKm(asal, tujuan2);
            const mulai2 = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
            const update2 = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

            return [
                {
                    id: 'PGT-DEMO-01', orderNo: 'ORD-2026-0149', pelanggan: 'Petrus Kambu',
                    kurir: 'Boas Douw', kendaraan: 'Motor Box · DS 4021 XY', status: 'proses',
                    asal, tujuan: tujuan1, posisi: posisi1,
                    jarakTotalKm: totalKm1, jarakSisaKm: totalKm1 * (1 - progress1),
                    kecepatanKmh: 26, etaMenit: Math.round((totalKm1 * (1 - progress1)) / 26 * 60),
                    progress: progress1, mulai: mulai1, updatedAt: update1,
                    riwayat: [
                        { event: 'Pesanan diserahkan ke kurir & berangkat dari toko', waktu: mulai1 },
                    ],
                },
                {
                    id: 'PGT-DEMO-00', orderNo: 'ORD-2026-0148', pelanggan: 'Yustus Wanma',
                    kurir: 'Amos Kayame', kendaraan: 'Motor Box · DS 3312 QP', status: 'selesai',
                    asal, tujuan: tujuan2, posisi: { lat: tujuan2.lat, lng: tujuan2.lng },
                    jarakTotalKm: totalKm2, jarakSisaKm: 0,
                    kecepatanKmh: 27, etaMenit: 0,
                    progress: 1, mulai: mulai2, updatedAt: update2,
                    riwayat: [
                        { event: 'Pesanan diserahkan ke kurir & berangkat dari toko', waktu: mulai2 },
                        { event: 'Kurir tiba di lokasi tujuan', waktu: new Date(Date.now() - 25.3 * 60 * 60 * 1000).toISOString() },
                        { event: 'Pelanggan mengonfirmasi pesanan diterima', waktu: update2 },
                    ],
                },
            ];
        })(),

        designs: [
            { orderNo: 'ORD-2026-0144', pelanggan: 'Petrus Kambu', file: 'stiker_final_v2.ai', versi: 2, status: 'menunggu', thumbBg: 'from-teal to-teal-dark', log: [{ event: 'Desain diunggah (v1)', tanggal: '18 Agu 2026' }, { event: 'Desain direvisi & diunggah ulang (v2)', tanggal: '19 Agu 2026' }] },
            { orderNo: 'ORD-2026-0145', pelanggan: 'Fitri Handayani', file: 'baliho_papuadigital_v3.cdr', versi: 3, status: 'revisi', thumbBg: 'from-primary to-primary-dark', log: [{ event: 'Desain diunggah (v1)', tanggal: '16 Agu 2026' }, { event: 'Pelanggan meminta revisi', tanggal: '17 Agu 2026' }, { event: 'Desain direvisi & diunggah ulang (v3)', tanggal: '19 Agu 2026' }] },
            { orderNo: 'ORD-2026-0147', pelanggan: 'Selvi Mansawan', file: 'baliho_pariwisata_v1.ai', versi: 1, status: 'menunggu', thumbBg: 'from-violet to-ink', log: [{ event: 'Desain diunggah (v1)', tanggal: '19 Agu 2026' }] },
            { orderNo: 'ORD-2026-0142', pelanggan: 'Yustus Wanma', file: 'baliho_sinar_v4.cdr', versi: 4, status: 'disetujui', thumbBg: 'from-amber to-primary', log: [{ event: 'Desain diunggah (v1)', tanggal: '14 Agu 2026' }, { event: 'Desain disetujui pelanggan', tanggal: '15 Agu 2026' }] },
            { orderNo: 'ORD-2026-0146', pelanggan: 'Yakob Rumbrar', file: 'baliho_gki_v2.ai', versi: 2, status: 'disetujui', thumbBg: 'from-green to-teal', log: [{ event: 'Desain diunggah (v1)', tanggal: '16 Agu 2026' }, { event: 'Desain disetujui pelanggan', tanggal: '17 Agu 2026' }] },
            { orderNo: 'ORD-2026-0143', pelanggan: 'Maria Ayamiseba', file: 'baliho_koperasi_v3.cdr', versi: 3, status: 'disetujui', thumbBg: 'from-ink to-steel', log: [{ event: 'Desain diunggah (v1)', tanggal: '12 Agu 2026' }, { event: 'Desain disetujui pelanggan', tanggal: '13 Agu 2026' }] },
        ],

        payments: [
            { no: 'TRX-0421', order: 'ORD-2026-0143', pelanggan: 'Maria Ayamiseba', jenis: 'Pelunasan', metode: 'Transfer Bank', tanggal: '19 Agu 2026', jumlah: 1250000 },
            { no: 'TRX-0420', order: 'ORD-2026-0146', pelanggan: 'Yakob Rumbrar', jenis: 'DP', metode: 'QRIS', tanggal: '19 Agu 2026', jumlah: 980000 },
            { no: 'TRX-0419', order: 'ORD-2026-0142', pelanggan: 'Yustus Wanma', jenis: 'DP', metode: 'Tunai', tanggal: '18 Agu 2026', jumlah: 400000 },
            { no: 'TRX-0418', order: 'ORD-2026-0148', pelanggan: 'Yustus Wanma', jenis: 'Pelunasan', metode: 'Tunai', tanggal: '17 Agu 2026', jumlah: 420000 },
            { no: 'TRX-0417', order: 'ORD-2026-0149', pelanggan: 'Petrus Kambu', jenis: 'Pelunasan', metode: 'QRIS', tanggal: '16 Agu 2026', jumlah: 390000 },
            { no: 'TRX-0416', order: 'ORD-2026-0147', pelanggan: 'Selvi Mansawan', jenis: 'DP', metode: 'Transfer Bank', tanggal: '15 Agu 2026', jumlah: 1500000 },
        ],

        stok: [
            { nama: 'Flexi China 280gsm', kategori: 'Bahan Cetak', sisa: 340, kapasitas: 500, satuan: 'meter', minStok: 100, masuk: 200, keluar: 160 },
            { nama: 'Flexi Korea 340gsm', kategori: 'Bahan Cetak', sisa: 85, kapasitas: 400, satuan: 'meter', minStok: 100, masuk: 150, keluar: 265 },
            { nama: 'Vinyl Sticker Glossy', kategori: 'Bahan Cetak', sisa: 120, kapasitas: 300, satuan: 'meter', minStok: 60, masuk: 100, keluar: 80 },
            { nama: 'Tinta Solvent Cyan', kategori: 'Tinta', sisa: 6, kapasitas: 20, satuan: 'liter', minStok: 5, masuk: 10, keluar: 14 },
            { nama: 'Tinta Solvent Magenta', kategori: 'Tinta', sisa: 14, kapasitas: 20, satuan: 'liter', minStok: 5, masuk: 10, keluar: 6 },
            { nama: 'Mata Ayam (Grommet)', kategori: 'Finishing', sisa: 2400, kapasitas: 5000, satuan: 'pcs', minStok: 500, masuk: 2000, keluar: 1600 },
        ],

        users: [
            { nama: 'Admin KugiyaiTobe', email: 'admin@kugiyaitobe.id', role: 'Owner', aktif: true },
            { nama: 'Rian Saragih', email: 'rian@kugiyaitobe.id', role: 'Admin', aktif: true },
            { nama: 'Kevin Wonda', email: 'kevin@kugiyaitobe.id', role: 'Designer', aktif: true },
            { nama: 'Dedi Prasetyo', email: 'dedi@kugiyaitobe.id', role: 'Operator Produksi', aktif: true },
            { nama: 'Novita Sari', email: 'novita@kugiyaitobe.id', role: 'Kasir', aktif: false },
            // Akun demo aktif untuk peran Kasir — dipakai oleh tombol "Coba Akun Demo"
            // di landing page (index.html) supaya keenam peran bisa dicoba langsung.
            { nama: 'Kasir Demo', email: 'kasir.demo@kugiyaitobe.id', role: 'Kasir', aktif: true },
        ],

        roleAccess: [
            { name: 'Owner', bg: 'bg-ink text-white', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 19H19M5 19L4 9L8 13L12 6L16 13L20 9L19 19" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>', perms: ['Akses penuh sistem', 'Laporan keuangan', 'Kelola pengguna'] },
            { name: 'Admin', bg: 'bg-primary-light text-primary', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>', perms: ['Kelola order & pelanggan', 'Kelola stok', 'Lihat laporan'] },
            { name: 'Designer', bg: 'bg-violet-light text-violet', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 19L19 12L22 15L15 22L12 19Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M18 13L16.5 4.5L2 2L4.5 16.5L13 18L18 13Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>', perms: ['Upload & revisi desain', 'Ajukan persetujuan'] },
            { name: 'Operator Produksi', bg: 'bg-teal-light text-teal', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="4" y="9" width="16" height="7" rx="1" stroke="currentColor" stroke-width="1.8"/></svg>', perms: ['Update status produksi', 'Lihat antrian cetak'] },
            { name: 'Kasir', bg: 'bg-green-light text-green', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>', perms: ['Catat pembayaran', 'Cetak nota'] },
            { name: 'Pelanggan', bg: 'bg-amber-light text-amber', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20C4.5 16.4 7.85 13.5 12 13.5C16.15 13.5 19.5 16.4 19.5 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>', perms: ['Buat pesanan sendiri', 'Setujui desain', 'Pantau status & bayar'] },
        ],

        produksiCols: [
            { key: 'tunggu_desain', label: 'Menunggu Desain', color: '#6B7280' },
            { key: 'tunggu_setuju', label: 'Menunggu Persetujuan', color: '#F0C51A' },
            { key: 'siap_cetak', label: 'Siap Cetak', color: '#0F6E6E' },
            { key: 'cetak', label: 'Sedang Dicetak', color: '#C2141A' },
            { key: 'finishing', label: 'Finishing', color: '#7C5CFC' },
            { key: 'selesai', label: 'Selesai', color: '#2A9D6B' },
        ],

        // ---------- computed: session-aware ----------
        get myCustomer() { return this.customers.find(c => c.id === this.loginCustomerId) || null; },
        get myOrders() { return this.myCustomer ? this.orders.filter(o => o.pelanggan === this.myCustomer.nama) : []; },
        get myDesigns() { return this.myCustomer ? this.designs.filter(d => d.pelanggan === this.myCustomer.nama) : []; },
        get myPayments() { return this.myCustomer ? this.payments.filter(p => p.pelanggan === this.myCustomer.nama) : []; },
        get dashboardOrders() { return this.loginRole === 'Pelanggan' ? this.myOrders : this.orders; },
        get visibleDesigns() { return this.loginRole === 'Pelanggan' ? this.myDesigns : this.designs; },
        get visiblePayments() { return this.loginRole === 'Pelanggan' ? this.myPayments : this.payments; },

        get filteredCustomers() {
            const q = this.custSearch.toLowerCase();
            return this.customers.filter(c => c.nama.toLowerCase().includes(q) || (c.instansi || '').toLowerCase().includes(q));
        },
        customerRiwayat(c) { if (!c) return []; return this.orders.filter(o => o.pelanggan === c.nama); },

        get filteredOrders() {
            let base = this.loginRole === 'Pelanggan' ? this.myOrders : this.orders;
            if (this.orderFilter !== 'Semua') {
                const map = { 'Menunggu Desain': 'tunggu_desain', 'Sedang Dicetak': 'cetak', 'Selesai': 'selesai' };
                base = base.filter(o => o.statusProduksi === map[this.orderFilter]);
            }
            if (this.globalSearch) {
                const q = this.globalSearch.toLowerCase();
                base = base.filter(o => o.no.toLowerCase().includes(q) || o.pelanggan.toLowerCase().includes(q));
            }
            return base;
        },

        // ---------- computed: pengantaran / peta GPS ----------
        get pengantaranAktif() {
            let list = this.pengantaran.filter(p => p.status === 'proses' || p.status === 'tiba');
            if (this.loginRole === 'Pelanggan') {
                list = list.filter(p => this.myCustomer && p.pelanggan === this.myCustomer.nama);
            }
            return list.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        },
        get pengantaranRiwayat() {
            let list = this.pengantaran.filter(p => p.status === 'selesai' || p.status === 'batal');
            if (this.loginRole === 'Pelanggan') {
                list = list.filter(p => this.myCustomer && p.pelanggan === this.myCustomer.nama);
            }
            return list.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 10);
        },
        pengantaranForOrder(orderNo) {
            const list = this.pengantaran.filter(p => p.orderNo === orderNo);
            if (!list.length) return null;
            return list.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
        },
        // Versi AMAN dari pengantaranForOrder() untuk dipakai langsung di HTML
        // (x-text). pengantaranForOrder() bisa balikin null kalau order belum
        // pernah dikirim sama sekali (belum ada rekaman pengantaran) — kalau
        // template langsung memanggil .jarakSisaKm.toFixed(1) di atas null,
        // Alpine akan error "Cannot read properties of null". Method ini
        // SELALU mengembalikan teks yang valid untuk semua kemungkinan status
        // (belum dikirim / proses / tiba / selesai / batal), jadi HTML cukup
        // panggil satu ekspresi ini tanpa perlu guard tambahan.
        labelStatusAntar(orderNo) {
            const p = this.pengantaranForOrder(orderNo);
            if (!p) return 'Belum dikirim — menunggu produksi selesai & kurir berangkat.';
            if (p.status === 'batal') return 'Pengantaran sebelumnya dibatalkan.';
            if (p.status === 'selesai') return 'Diterima pelanggan · ' + this.relatif(p.updatedAt);
            if (p.status === 'tiba') return 'Kurir sudah tiba di tujuan · ' + this.relatif(p.updatedAt);
            // status 'proses'
            const sisa = (typeof p.jarakSisaKm === 'number') ? p.jarakSisaKm.toFixed(1) : '-';
            const eta = (typeof p.etaMenit === 'number') ? ' · ETA ' + p.etaMenit + ' menit' : '';
            return sisa + ' km lagi' + eta + ' · diperbarui ' + this.relatif(p.updatedAt);
        },
        canKirim(order) {
            if (!order || order.statusProduksi !== 'selesai') return false;
            const p = this.pengantaranForOrder(order.no);
            return !p || p.status === 'batal';
        },
        // Versi waktuLalu() yang membaca clockTick supaya Alpine tahu harus
        // menghitung ulang tiap detik walau timestamp sumbernya tidak berubah
        // (mis. status "5 menit lalu" pada pengantaran yang sudah tiba/selesai).
        relatif(iso) { void this.clockTick; return waktuLalu(iso); },

        get statusDist() {
            const src = this.dashboardOrders;
            return this.produksiCols.map(col => ({ label: col.label, value: src.filter(o => o.statusProduksi === col.key).length, color: col.color }));
        },

        get totalPendapatan() { return this.payments.reduce((a, b) => a + b.jumlah, 0); },
        get produkTerlaris() {
            const counts = this.orderCountsByJenis();
            let top = '—', max = 0;
            Object.entries(counts).forEach(([k, v]) => { if (v > max) { max = v; top = k; } });
            return top;
        },
        orderCountsByJenis() {
            const counts = {};
            this.orders.forEach(o => { counts[o.jenis] = (counts[o.jenis] || 0) + 1; });
            return counts;
        },

        get kpis() {
            if (this.loginRole === 'Pelanggan') {
                const o = this.myOrders;
                const proses = o.filter(x => ['tunggu_setuju', 'siap_cetak', 'cetak', 'finishing'].includes(x.statusProduksi)).length;
                return [
                    { label: 'Total Pesanan Saya', value: String(o.length), trend: 0, iconBg: 'bg-primary-light text-primary', icon: KPI_ICONS.order },
                    { label: 'Menunggu Desain', value: String(o.filter(x => x.statusProduksi === 'tunggu_desain').length), trend: 0, iconBg: 'bg-steel/10 text-steel', icon: KPI_ICONS.wait },
                    { label: 'Sedang Diproses', value: String(proses), trend: 0, iconBg: 'bg-violet-light text-violet', icon: KPI_ICONS.print },
                    { label: 'Selesai', value: String(o.filter(x => x.statusProduksi === 'selesai').length), trend: 0, iconBg: 'bg-green-light text-green', icon: KPI_ICONS.done },
                    { label: 'Tagihan Belum Lunas', value: rupiah(o.reduce((a, b) => a + b.sisa, 0)), trend: 0, iconBg: 'bg-crimson-light text-crimson', icon: KPI_ICONS.piutang },
                ];
            }
            const o = this.orders;
            return [
                { label: 'Total Pesanan', value: String(o.length), trend: 8, iconBg: 'bg-primary-light text-primary', icon: KPI_ICONS.order },
                { label: 'Menunggu Desain', value: String(o.filter(x => x.statusProduksi === 'tunggu_desain').length), trend: 0, iconBg: 'bg-steel/10 text-steel', icon: KPI_ICONS.wait },
                { label: 'Sedang Dicetak', value: String(o.filter(x => x.statusProduksi === 'cetak').length), trend: 0, iconBg: 'bg-violet-light text-violet', icon: KPI_ICONS.print },
                { label: 'Selesai', value: String(o.filter(x => x.statusProduksi === 'selesai').length), trend: 15, iconBg: 'bg-green-light text-green', icon: KPI_ICONS.done },
                { label: 'Pendapatan Total', value: rupiah(this.totalPendapatan), trend: 9, iconBg: 'bg-ink text-white', icon: KPI_ICONS.money },
                { label: 'Piutang Pelanggan', value: rupiah(o.reduce((a, b) => a + b.sisa, 0)), trend: -4, iconBg: 'bg-crimson-light text-crimson', icon: KPI_ICONS.piutang },
                { label: 'Rata-rata Nilai Order', value: rupiah(o.length ? o.reduce((a, b) => a + b.total, 0) / o.length : 0), trend: 2, iconBg: 'bg-steel/10 text-steel', icon: KPI_ICONS.avg },
            ];
        },

        get notifications() {
            const list = [];
            const isCust = this.loginRole === 'Pelanggan';
            const myName = isCust && this.myCustomer ? this.myCustomer.nama : null;
            this.orders.filter(o => o.sisa > 0 && (!isCust || o.pelanggan === myName)).forEach(o => {
                list.push({ icon: '💰', text: (isCust ? 'Tagihan Anda ' : 'Piutang ' + o.pelanggan + ' ') + '— ' + rupiah(o.sisa) + ' (' + o.no + ')' });
            });
            this.designs.filter(d => d.status === 'menunggu' && (!isCust || d.pelanggan === myName)).forEach(d => {
                list.push({ icon: '🎨', text: 'Desain ' + d.orderNo + ' menunggu persetujuan' });
            });
            if (!isCust) {
                this.stok.filter(s => s.sisa <= s.minStok).forEach(s => {
                    list.push({ icon: '📦', text: 'Stok ' + s.nama + ' menipis (' + s.sisa + ' ' + s.satuan + ')' });
                });
            }
            return list;
        },

        // ---------- helpers ----------
        rupiah(n) { return rupiah(n); },
        // Notifikasi ringan (toast) — dirender via SweetAlert2 agar seluruh
        // feedback aplikasi (notifikasi & konfirmasi) konsisten satu sistem.
        toast(msg) {
            if (typeof Swal === 'undefined') { console.warn('[CETAK.OS] SweetAlert2 belum termuat:', msg); return; }
            Swal.fire({
                toast: true,
                position: 'bottom-end',
                showConfirmButton: false,
                timer: 3200,
                timerProgressBar: true,
                background: '#0B1B3D',
                color: '#FFFFFF',
                customClass: { popup: 'cetakos-toast-popup', timerProgressBar: 'cetakos-toast-bar' },
                didOpen: (el) => {
                    el.onmouseenter = Swal.stopTimer;
                    el.onmouseleave = Swal.resumeTimer;
                },
                html: '<div class="cetakos-toast-inner"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17L4 12" stroke="#C2141A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + this._escapeHtml(msg) + '</span></div>'
            });
        },

        // Escape sederhana agar teks dinamis (nama pelanggan/produk, dsb.) aman
        // saat disisipkan sebagai HTML di dalam popup/toast SweetAlert2.
        _escapeHtml(str) {
            return String(str).replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        },

        // Dialog konfirmasi terpusat berbasis SweetAlert2 — menggantikan
        // window.confirm() bawaan browser agar tampil konsisten dengan gaya
        // visual CETAK.OS (warna primary/steel, tipografi, radius, shadow).
        // Mengembalikan Promise<boolean> — true jika pengguna menekan tombol konfirmasi.
        async confirmSwal(message, opts = {}) {
            if (typeof Swal === 'undefined') { console.warn('[CETAK.OS] SweetAlert2 belum termuat.'); return window.confirm(message); }
            const {
                title = 'Konfirmasi Tindakan',
                confirmText = 'Ya, Lanjutkan',
                cancelText = 'Batal',
                danger = true,
                icon = danger ? 'warning' : 'question'
            } = opts;
            const result = await Swal.fire({
                title,
                html: this._escapeHtml(message),
                icon,
                iconColor: '#C2141A',
                showCancelButton: true,
                reverseButtons: true,
                focusCancel: true,
                buttonsStyling: false,
                confirmButtonText: confirmText,
                cancelButtonText: cancelText,
                customClass: {
                    popup: 'cetakos-swal-popup',
                    title: 'cetakos-swal-title',
                    htmlContainer: 'cetakos-swal-html',
                    actions: 'cetakos-swal-actions',
                    confirmButton: 'cetakos-swal-btn ' + (danger ? 'cetakos-swal-btn-danger' : 'cetakos-swal-btn-primary'),
                    cancelButton: 'cetakos-swal-btn cetakos-swal-btn-cancel'
                }
            });
            return !!result.isConfirmed;
        },

        closeModal(id) {
            const el = document.getElementById(id);
            if (!el) return;
            if (document.activeElement && typeof document.activeElement.blur === 'function' && el.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            if (window.bootstrap) {
                const modal = bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
                if (modal) modal.hide();
            }
        },

        // ---------- session handoff from index.html (landing) ----------
        // index.html's auth modal (Masuk / Daftar) can't create real accounts —
        // it just hands the entered profile off to us via sessionStorage before
        // redirecting to dashboard.html. We pick it up once here on load and turn it
        // into an actual session (new pelanggan record, or a matched login).
        applyAuthPrefill() {
            let raw = null;
            try { raw = sessionStorage.getItem('kugiyaiAuthPrefill'); } catch (e) { /* storage unavailable */ }
            if (!raw) return;
            try { sessionStorage.removeItem('kugiyaiAuthPrefill'); } catch (e) { /* no-op */ }

            let data;
            try { data = JSON.parse(raw); } catch (e) { return; }
            if (!data || !data.view) return;

            if (data.view === 'register') {
                const nama = (data.nama || '').trim();
                if (!nama) return;
                const hp = (data.hp || '').trim();
                const digits = hp.replace(/\D/g, '');

                // Data pelanggan kini tersimpan permanen (localStorage), jadi cek dulu
                // apakah nomor HP ini sudah pernah terdaftar sebelum membuat duplikat —
                // kalau sudah ada, cukup login-kan sebagai akun yang sama.
                const existing = digits ? this.customers.find(c => c.hp.replace(/\D/g, '') === digits) : null;
                if (existing) {
                    this.loginRole = 'Pelanggan';
                    this.loginCustomerId = existing.id;
                    this.loginUserName = existing.nama;
                    this.saveCoreData();
                    setTimeout(() => this.toast('Nomor HP ini sudah terdaftar. Selamat datang kembali, ' + existing.nama + '.'), 350);
                    return;
                }

                const id = (this.customers.length ? Math.max(...this.customers.map(c => c.id)) : 0) + 1;
                this.customers.push({ id, nama, hp, alamat: '', instansi: (data.instansi || '').trim() });
                this.loginRole = 'Pelanggan';
                this.loginCustomerId = id;
                this.loginUserName = nama;
                this.saveCoreData();
                setTimeout(() => this.toast('Selamat datang, ' + nama + '! Akun pelanggan Anda berhasil dibuat.'), 350);
                return;
            }

            if (data.view === 'login') {
                const uname = (data.username || '').trim();
                const q = uname.toLowerCase();
                if (!q) return;

                // 1) try matching a staff account (Owner/Admin/Designer/Operator/Kasir)
                const staff = this.users.find(u => u.nama.toLowerCase() === q || u.email.toLowerCase() === q);
                if (staff) {
                    if (!staff.aktif) {
                        setTimeout(() => this.toast('Akun "' + staff.nama + '" nonaktif. Hubungi Owner untuk mengaktifkan kembali.'), 350);
                        return;
                    }
                    this.loginRole = staff.role;
                    this.loginUserName = staff.nama;
                    setTimeout(() => this.toast('Selamat datang kembali, ' + staff.nama + '.'), 350);
                    return;
                }

                // 2) try matching an existing pelanggan by name or phone number
                const digits = q.replace(/\D/g, '');
                const cust = this.customers.find(c => c.nama.toLowerCase() === q || (digits && c.hp.replace(/\D/g, '') === digits));
                if (cust) {
                    this.loginRole = 'Pelanggan';
                    this.loginCustomerId = cust.id;
                    this.loginUserName = cust.nama;
                    setTimeout(() => this.toast('Selamat datang kembali, ' + cust.nama + '.'), 350);
                    return;
                }

                // 3) no match — this is a front-end demo without a real auth backend,
                // so stay on whatever session is currently active (restored by
                // loadSession(), or the default Owner session on a fresh browser)
                // and say so honestly instead of silently pretending the login succeeded.
                setTimeout(() => this.toast('Akun "' + data.username + '" tidak ditemukan. Tetap menampilkan sesi: ' + this.loginUserName + ' (' + this.loginRole + ').'), 350);
            }
        },
        // ---------- session persistence (bertahan lintas refresh & lintas tab) ----------
        // Dipanggil setiap kali loginRole/loginUserName/loginCustomerId berubah
        // (lihat $watch di init()) supaya sesi yang sedang aktif selalu ter-update
        // di localStorage — bukan hanya sekali saat login pertama kali.
        saveSession() {
            try {
                localStorage.setItem(SESSION_KEY, JSON.stringify({
                    // Format script.js (dibaca oleh loadSession() & $watch di dashboard.html)
                    loginRole: this.loginRole,
                    loginUserName: this.loginUserName,
                    loginCustomerId: this.loginCustomerId,
                    savedAt: Date.now(),
                    // Format kompatibel login.html & index.html updateAuthHeaderState()
                    user: this.loginUserName,
                    username: this.loginUserName,
                    role: this.loginRole,
                }));
            } catch (e) { /* storage unavailable — sesi tetap jalan untuk tab ini saja */ }
        },
        // Dipanggil sekali di init(), SEBELUM applyAuthPrefill() (yang menangani
        // proses login/daftar baru dari index.html). Mengembalikan sesi terakhir
        // yang tersimpan, dengan validasi supaya tidak "nyasar" ke akun yang sudah
        // dihapus/nonaktif — kalau tidak valid lagi, tetap pakai sesi default.
        loadSession() {
            let raw = null;
            try { raw = localStorage.getItem(SESSION_KEY); } catch (e) { return; }
            if (!raw) return;
            let data;
            try { data = JSON.parse(raw); } catch (e) { return; }
            if (!data) return;

            // Normalisasi lintas format: script.js pakai loginRole/loginUserName,
            // login.html pakai role/user/username. Keduanya harus bisa dibaca di sini.
            const role = data.loginRole || data.role;
            const userName = data.loginUserName || data.user || data.username;
            const customerId = data.loginCustomerId;
            if (!role) return;

            if (role === 'Pelanggan') {
                // Cari pelanggan berdasarkan ID (numeric) atau nama (untuk sesi lama dari login.html)
                const cust = customerId
                    ? this.customers.find(c => c.id === customerId || String(c.id) === String(customerId))
                    : (userName ? this.customers.find(c => c.nama === userName) : null);
                if (!cust) return; // akun pelanggan sudah tidak ada — tetap di sesi default
                this.loginRole = 'Pelanggan';
                this.loginCustomerId = cust.id;
                this.loginUserName = cust.nama;
                return;
            }

            const staff = this.users.find(u => u.nama === userName && u.role === role);
            if (!staff || !staff.aktif) return; // user dihapus/dinonaktifkan — tetap di sesi default
            this.loginRole = staff.role;
            this.loginUserName = staff.nama;
        },
        logout() {
            try { sessionStorage.removeItem('kugiyaiAuthPrefill'); } catch (e) { /* no-op */ }
            try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* no-op */ }
            window.location.href = 'index.html';
        },
        todayStr() {
            return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        },
        formatTanggal(isoDate) {
            if (!isoDate) return '';
            const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const d = new Date(isoDate + 'T00:00:00');
            if (isNaN(d.getTime())) return isoDate;
            return String(d.getDate()).padStart(2, '0') + ' ' + bulan[d.getMonth()] + ' ' + d.getFullYear();
        },

        statusBadge(key) {
            const map = {
                tunggu_desain: { label: 'Menunggu Desain', cls: 'bg-steel/10 text-steel' },
                tunggu_setuju: { label: 'Menunggu Persetujuan', cls: 'bg-amber-light text-amber' },
                siap_cetak: { label: 'Siap Cetak', cls: 'bg-teal-light text-teal' },
                cetak: { label: 'Sedang Dicetak', cls: 'bg-primary-light text-primary' },
                finishing: { label: 'Finishing', cls: 'bg-violet-light text-violet' },
                selesai: { label: 'Selesai', cls: 'bg-green-light text-green' },
            };
            return map[key] || { label: key, cls: 'bg-steel/10 text-steel' };
        },
        desainStatusBadge(key) {
            const map = {
                menunggu: { label: 'Menunggu Review', cls: 'bg-amber text-white' },
                revisi: { label: 'Perlu Revisi', cls: 'bg-crimson text-white' },
                disetujui: { label: 'Disetujui', cls: 'bg-green text-white' },
            };
            return map[key] || { label: key, cls: 'bg-steel text-white' };
        },
        // Badge status pengantaran — satu sumber kebenaran yang dipakai baik
        // di dashboard Owner (Daftar Order, halaman Peta) maupun dashboard
        // Pelanggan ("Pesanan Saya"), supaya label & warna status antar SELALU
        // konsisten di kedua sisi dan tidak pernah drift satu sama lain.
        statusAntarBadge(orderNo) {
            const p = this.pengantaranForOrder(orderNo);
            if (!p || p.status === 'batal') return { label: 'Belum Dikirim', cls: 'bg-steel/10 text-steel' };
            const map = {
                proses: { label: 'Sedang Diantar', cls: 'bg-primary-light text-primary' },
                tiba: { label: 'Kurir Tiba', cls: 'bg-amber-light text-amber' },
                selesai: { label: 'Diterima', cls: 'bg-green-light text-green' },
            };
            return map[p.status] || { label: p.status, cls: 'bg-steel/10 text-steel' };
        },

        // ---------- order form calc ----------
        konversiKeMeter(nilai, satuan) {
            const map = { cm: 0.01, m: 1, inch: 0.0254, kaki: 0.3048 };
            return (nilai || 0) * (map[satuan] || 1);
        },
        luasM2() {
            const p = this.konversiKeMeter(this.formOrder.panjang, this.formOrder.satuan);
            const l = this.konversiKeMeter(this.formOrder.lebar, this.formOrder.satuan);
            return p * l;
        },
        luasM2Text() { return this.luasM2().toFixed(2); },
        hitungTotalOrder() {
            const luas = this.luasM2();
            const jumlah = this.formOrder.jumlah || 0;
            const harga = this.formOrder.hargaM2 || 0;
            return (luas * jumlah * harga) + (this.formOrder.biayaDesain || 0) + (this.formOrder.biayaFinishing || 0);
        },

        nextOrderNo() {
            const nums = this.orders.map(o => parseInt(o.no.split('-').pop(), 10)).filter(n => !isNaN(n));
            const max = nums.length ? Math.max(...nums) : 0;
            return 'ORD-2026-' + String(max + 1).padStart(4, '0');
        },
        nextTrxNo() {
            const nums = this.payments.map(p => parseInt(p.no.split('-').pop(), 10)).filter(n => !isNaN(n));
            const max = nums.length ? Math.max(...nums) : 0;
            return 'TRX-' + String(max + 1).padStart(4, '0');
        },

        simpanOrder() {
            this.orderError = '';
            let pelangganNama = '';
            if (this.loginRole === 'Pelanggan') {
                if (!this.myCustomer) { this.orderError = 'Akun pelanggan tidak ditemukan.'; return; }
                pelangganNama = this.myCustomer.nama;
            } else {
                const cust = this.customers.find(c => c.id === this.formOrder.pelangganId);
                if (!cust) { this.orderError = 'Pilih pelanggan terlebih dahulu.'; return; }
                pelangganNama = cust.nama;
            }
            if (!this.formOrder.jenis) { this.orderError = 'Pilih jenis cetakan.'; return; }
            if (!this.formOrder.panjang || !this.formOrder.lebar) { this.orderError = 'Isi ukuran panjang dan lebar.'; return; }
            if (!this.formOrder.jumlah || this.formOrder.jumlah < 1) { this.orderError = 'Jumlah minimal 1.'; return; }
            if (!this.formOrder.hargaM2 || this.formOrder.hargaM2 <= 0) { this.orderError = 'Isi harga per m².'; return; }
            if (!this.formOrder.deadline) { this.orderError = 'Tentukan tanggal deadline.'; return; }

            // Simpan titik lokasi yang ditandai pelanggan di peta modal ini ke
            // customer.koordinat — field yang sama otomatis dibaca Owner
            // (bukaFormKirim()) saat order ini nanti siap diantar, sehingga
            // lokasi tujuan sudah terisi otomatis tanpa perlu dipilih ulang.
            // Dilakukan di sini (setelah semua validasi lolos) supaya order
            // yang gagal disimpan tidak ikut mengubah data lokasi pelanggan.
            if (this.loginRole === 'Pelanggan' && this.myCustomer && this._orderBaruLokasiPending) {
                this.myCustomer.koordinat = { lat: this._orderBaruLokasiPending.lat, lng: this._orderBaruLokasiPending.lng };
            }

            const total = Math.round(this.hitungTotalOrder());
            const dp = Math.min(Math.round(this.formOrder.dp || 0), total);
            const sisa = Math.max(total - dp, 0);
            const ukuranLabel = this.formOrder.panjang + '×' + this.formOrder.lebar + ' ' + this.formOrder.satuan;
            const orderNo = this.nextOrderNo();

            this.orders.unshift({
                no: orderNo,
                pelanggan: pelangganNama,
                jenis: this.formOrder.jenis,
                ukuran: ukuranLabel,
                jumlah: this.formOrder.jumlah,
                total, dp, sisa,
                deadline: this.formatTanggal(this.formOrder.deadline),
                catatan: this.formOrder.catatan,
                statusProduksi: 'tunggu_desain',
            });

            // PENTING: DP yang diisi saat order dibuat HARUS ikut tercatat sebagai
            // transaksi pembayaran (bukan cuma angka di objek order) — supaya
            // "Riwayat Transaksi", "Total Pendapatan"/"Total Diterima", dan bukti
            // nota tetap akurat & konsisten di kedua sisi (dashboard Pelanggan
            // maupun Owner/Operator). Sebelumnya DP di sini "menguap" — sisa
            // tagihan berkurang tapi tidak ada jejak transaksinya sama sekali.
            if (dp > 0) {
                const trx = {
                    no: this.nextTrxNo(),
                    order: orderNo,
                    pelanggan: pelangganNama,
                    jenis: 'DP',
                    metode: this.formOrder.metodeDp || 'Tunai',
                    tanggal: this.todayStr(),
                    jumlah: dp,
                };
                this.payments.unshift(trx);
            }

            this.resetFormOrder();
            this.closeModal('modalOrderBaru');
            this.saveCoreData();
            this.toast('Order baru berhasil dibuat.' + (dp > 0 ? ' DP ' + rupiah(dp) + ' tercatat di riwayat transaksi.' : ''));
            this.$nextTick(() => this.renderCharts());
        },

        simpanPelanggan() {
            this.pelangganError = '';
            if (!this.formPelanggan.nama || !this.formPelanggan.hp) { this.pelangganError = 'Nama dan nomor HP wajib diisi.'; return; }
            const id = (this.customers.length ? Math.max(...this.customers.map(c => c.id)) : 0) + 1;
            this.customers.push({ id, nama: this.formPelanggan.nama, hp: this.formPelanggan.hp, alamat: this.formPelanggan.alamat, instansi: this.formPelanggan.instansi });
            this.resetFormPelanggan();
            this.closeModal('modalPelanggan');
            this.saveCoreData();
            this.toast('Pelanggan baru ditambahkan.');
        },

        async handleUploadGambarDesain(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            this.formDesain.file = file.name;
            if (file.type.startsWith('image/')) {
                if (file.size > 15 * 1024 * 1024) {
                    this.toast('⚠️ Ukuran file gambar maksimal 15MB.');
                    return;
                }
                try {
                    // PENTING: kompres dulu (sama seperti avatar/banner/galeri) sebelum
                    // disimpan sebagai base64 — foto kamera/HP mentah (3-8MB, bisa lebih
                    // besar dari total kuota localStorage ~5-10MB) sebelumnya disimpan
                    // APA ADANYA tanpa kompresi, sehingga satu kali upload desain bisa
                    // langsung menghabiskan kuota dan membuat SEMUA penyimpanan berikutnya
                    // (order, pembayaran, dll) ikut gagal tersimpan secara diam-diam —
                    // termasuk memutus sinkronisasi real-time ke dashboard pelanggan/owner
                    // lain karena localStorage tidak pernah benar-benar ter-update.
                    this.formDesain.gambar = await this._compressImageFile(file, { maxWidth: 1280, maxHeight: 1280, targetBytes: 260 * 1024 });
                    this.toast('📷 Gambar desain berhasil dimuat & dipadatkan untuk disimpan.');
                } catch (err) {
                    console.error('[CETAK.OS] Gagal memproses gambar desain:', err);
                    this.toast('⚠️ Gagal memproses gambar desain. Coba file lain.');
                }
            } else {
                this.toast('📄 File ' + file.name + ' terpilih.');
            }
        },

        simpanDesain() {
            this.desainError = '';
            if (!this.formDesain.orderNo) { this.desainError = 'Pilih nomor order.'; return; }
            if (!this.formDesain.file && !this.formDesain.gambar) { this.desainError = 'Pilih file desain atau unggah gambar pratinjau.'; return; }
            const order = this.orders.find(o => o.no === this.formDesain.orderNo);
            if (!order) { this.desainError = 'Order tidak ditemukan.'; return; }

            const palette = ['from-teal to-teal-dark', 'from-primary to-primary-dark', 'from-violet to-ink', 'from-amber to-primary', 'from-green to-teal', 'from-ink to-steel'];
            const existing = this.designs.find(d => d.orderNo === this.formDesain.orderNo);
            const gambarVal = this.formDesain.gambar || (existing ? existing.gambar : 'asset/img/gallery/gallery-1.jpeg');

            if (existing) {
                existing.versi += 1;
                existing.file = this.formDesain.file || existing.file;
                existing.gambar = gambarVal;
                existing.catatan = this.formDesain.catatan || existing.catatan;
                existing.status = 'menunggu';
                existing.log = existing.log || [];
                existing.log.push({ event: 'Desain direvisi & diunggah ulang (v' + existing.versi + ')', tanggal: this.todayStr() });
            } else {
                this.designs.unshift({
                    orderNo: order.no,
                    pelanggan: order.pelanggan,
                    file: this.formDesain.file || (order.no + '_final_v1.ai'),
                    gambar: gambarVal,
                    catatan: this.formDesain.catatan || '',
                    versi: 1,
                    status: 'menunggu',
                    desainer: this.loginUserName || 'Kevin Wonda',
                    thumbBg: palette[this.designs.length % palette.length],
                    log: [{ event: 'Desain diunggah (v1)', tanggal: this.todayStr() }]
                });
            }

            order.statusProduksi = 'tunggu_setuju';
            this.resetFormDesain();
            this.closeModal('modalUploadDesain');
            this.saveCoreData();
            this.toast('✅ Desain berhasil diunggah.');
            this.$nextTick(() => this.renderCharts());
        },

        setujuiDesain(d) {
            d.status = 'disetujui';
            d.log = d.log || [];
            d.log.push({ event: 'Desain disetujui pelanggan', tanggal: this.todayStr() });
            const order = this.orders.find(o => o.no === d.orderNo);
            if (order && (order.statusProduksi === 'tunggu_setuju' || order.statusProduksi === 'tunggu_desain')) {
                order.statusProduksi = 'siap_cetak';
            }
            this.saveCoreData();
            this.toast('✅ Desain disetujui & pesanan siap dicetak.');
            this.$nextTick(() => this.renderCharts());
        },

        revisiInputOpen: false,
        revisiText: '',
        revisiError: '',

        openRevisiInput(d) {
            this.revisiInputOpen = true;
            this.revisiText = d.catatan || '';
            this.revisiError = '';
        },

        cancelRevisiInput() {
            this.revisiInputOpen = false;
            this.revisiText = '';
            this.revisiError = '';
        },

        submitRevisi(d) {
            this.revisiError = '';
            if (!this.revisiText.trim()) {
                this.revisiError = 'Mohon tuliskan rincian bagian atau elemen yang perlu direvisi.';
                return;
            }
            d.status = 'revisi';
            d.catatan = this.revisiText.trim();
            d.log = d.log || [];
            d.log.push({ event: 'Permintaan revisi: ' + d.catatan, tanggal: this.todayStr() });
            const order = this.orders.find(o => o.no === d.orderNo);
            if (order) { order.statusProduksi = 'tunggu_desain'; }
            this.revisiInputOpen = false;
            this.saveCoreData();
            this.toast('🔄 Permintaan revisi berhasil dikirim ke desainer.');
            this.$nextTick(() => this.renderCharts());
        },

        mintaRevisiDesain(d) {
            this.openRevisiInput(d);
        },

        unduhGambarDesain(d) {
            if (!d) return;
            if (d.gambar) {
                const a = document.createElement('a');
                a.href = d.gambar;
                a.download = (d.file || d.orderNo + '_desain') + '.jpg';
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                this.toast('📥 Gambar pratinjau desain dibuka / diunduh.');
            } else {
                this.toast('ℹ️ File master: ' + (d.file || 'Format Vektor') + ' tersimpan di server lokal.');
            }
        },

        cetakApprovalDesain(d) {
            if (!d) return;
            const order = this.orders.find(o => o.no === d.orderNo) || { jenis: 'Cetak Digital', ukuran: 'Standar', jumlah: 1 };
            const win = window.open('', '_blank');
            if (!win) { this.toast('Izinkan pop-up untuk mencetak Lembar Approval Desain.'); return; }
            const nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

            win.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Lembar Persetujuan Desain - ${d.orderNo}</title>
                    <meta charset="utf-8">
                    <style>
                        * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
                        body { padding:24px; color:#0A0D14; background:#FFF; font-size:12px; line-height:1.4; }
                        .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #C2141A; padding-bottom:12px; margin-bottom:16px; }
                        .logo h1 { font-size:18px; font-weight:800; color:#C2141A; letter-spacing:-0.5px; }
                        .logo p { font-size:10px; color:#5A6478; }
                        .title-box { text-align:right; }
                        .title-box h2 { font-size:14px; font-weight:700; color:#0A0D14; text-transform:uppercase; }
                        .title-box span { font-size:11px; color:#5A6478; font-family:monospace; }
                        .meta-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:16px; }
                        .meta-card { background:#F8FAFC; border:1px solid #E2E8F0; padding:8px 10px; rounded:8px; border-radius:6px; }
                        .meta-card .lbl { font-size:9px; color:#64748B; text-transform:uppercase; font-weight:600; }
                        .meta-card .val { font-size:11px; font-weight:700; color:#0F172A; margin-top:2px; }
                        .preview-box { border:1px solid #CBD5E1; border-radius:8px; padding:8px; text-align:center; margin-bottom:16px; background:#0F172A; }
                        .preview-img { max-width:100%; max-height:360px; object-fit:contain; border-radius:4px; display:block; margin:0 auto; }
                        .specs-table { width:100%; border-collapse:collapse; margin-bottom:16px; font-size:11px; }
                        .specs-table th, .specs-table td { border:1px solid #E2E8F0; padding:6px 10px; text-align:left; }
                        .specs-table th { background:#F1F5F9; color:#475569; font-weight:600; }
                        .notes-box { background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; padding:10px; margin-bottom:16px; font-size:11px; color:#92400E; }
                        .sig-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; text-align:center; margin-top:24px; }
                        .sig-col { border-top:1px solid #94A3B8; padding-top:6px; font-size:11px; }
                        .sig-space { height:55px; }
                        .badge-ok { display:inline-block; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; background:#DCFCE7; color:#15803D; }
                        .footer { margin-top:20px; padding-top:8px; border-top:1px dashed #CBD5E1; font-size:9px; color:#64748B; display:flex; justify-content:space-between; }
                        @media print { body { padding:10mm; } .no-print { display:none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="logo">
                            <h1>CETAK.OS · KUGIYAITOBE</h1>
                            <p>Digital-Printing & Reklame · Mugou, Waghete, Deiyai - Papua Tengah</p>
                        </div>
                        <div class="title-box">
                            <h2>LEMBAR PERSETUJUAN DESAIN (PROOF SHEET)</h2>
                            <span>${d.orderNo} · Versi ${d.versi}</span>
                        </div>
                    </div>

                    <div class="meta-grid">
                        <div class="meta-card"><div class="lbl">Nama Pelanggan</div><div class="val">${d.pelanggan}</div></div>
                        <div class="meta-card"><div class="lbl">Jenis & Ukuran</div><div class="val">${order.jenis} (${order.ukuran})</div></div>
                        <div class="meta-card"><div class="lbl">File Master</div><div class="val font-mono">${d.file}</div></div>
                        <div class="meta-card"><div class="lbl">Status Proof</div><div class="val"><span class="badge-ok">${d.status.toUpperCase()}</span></div></div>
                    </div>

                    <div class="preview-box">
                        ${d.gambar ? `<img src="${d.gambar}" class="preview-img" alt="Artwork">` : `<div style="padding:40px;color:#94A3B8;">Pratinjau Vektor Master: ${d.file}</div>`}
                    </div>

                    <table class="specs-table">
                        <thead>
                            <tr>
                                <th>Spesifikasi Teknis</th>
                                <th>Nilai / Standar Cetak</th>
                                <th>Verifikasi Desainer</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>Ruang Warna (Color Space)</td><td>CMYK (FOGRA39 / US Web Coated)</td><td>✓ Terkalibrasi</td></tr>
                            <tr><td>Resolusi Minimum</td><td>300 DPI pada Skala Nyata (1:1)</td><td>✓ Siap Cetak</td></tr>
                            <tr><td>Batas Aman / Bleed Margin</td><td>30mm Margin Keliling / Ring Mata Ayam</td><td>✓ Sesuai SOP</td></tr>
                            <tr><td>Desainer Penanggung Jawab</td><td>${d.desainer || 'Kevin Wonda'}</td><td>✓ Disetujui Tim Kreatif</td></tr>
                        </tbody>
                    </table>

                    ${d.catatan ? `<div class="notes-box"><b>Catatan Teknis / Permintaan Khusus:</b><br>${d.catatan}</div>` : ''}

                    <div class="sig-grid">
                        <div class="sig-col">
                            <div class="sig-space"></div>
                            <b>( ${d.desainer || 'Kevin Wonda'} )</b>
                            <div>Desainer Grafis</div>
                        </div>
                        <div class="sig-col">
                            <div class="sig-space"></div>
                            <b>( Operator Produksi )</b>
                            <div>Bagian Percetakan</div>
                        </div>
                        <div class="sig-col">
                            <div class="sig-space"></div>
                            <b>( ${d.pelanggan} )</b>
                            <div>Pelanggan / Pemesan</div>
                        </div>
                    </div>

                    <div class="footer">
                        <span>Dicetak otomatis dari CETAK.OS · ${nowStr}</span>
                        <span>Dokumen bukti persetujuan resmi desain cetak</span>
                    </div>

                    <div class="no-print" style="margin-top:20px;text-align:center;">
                        <button onclick="window.print()" style="padding:8px 20px;background:#C2141A;color:#FFF;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Cetak Lembar Proof / Simpan PDF</button>
                    </div>
                </body>
                </html>
            `);
            win.document.close();
        },

        // Dipanggil dari kartu "Tagihan Belum Lunas" di dashboard Pelanggan supaya
        // modal Bayar langsung terisi order & sisa tagihan yang benar — pelanggan
        // tidak perlu cari-cari nomor order sendiri di dropdown.
        openBayarPelanggan(order) {
            this.resetFormBayar();
            this.formBayar.orderNo = order.no;
            this.formBayar.jumlah = order.sisa;
            this.formBayar.jenis = order.dp > 0 ? 'Pelunasan' : 'DP';
            if (window.bootstrap) {
                const el = document.getElementById('modalBayar');
                if (el) bootstrap.Modal.getOrCreateInstance(el).show();
            }
        },
        // Dipanggil dari tombol "Bayar Sekarang" di modal Detail Order (Pelanggan) —
        // tutup dulu modal detail baru buka modal Bayar supaya tidak dua modal
        // Bootstrap aktif bersamaan (backdrop bisa tumpang tindih/nge-lock scroll).
        bayarDariDetailOrder(order) {
            this.closeModal('modalDetailOrder');
            setTimeout(() => this.openBayarPelanggan(order), 300);
        },
        simpanBayar() {
            this.bayarError = '';
            const order = this.orders.find(o => o.no === this.formBayar.orderNo);
            if (!order) { this.bayarError = 'Pilih order yang valid.'; return; }

            // Keamanan: pelanggan hanya boleh membayar tagihan miliknya sendiri —
            // walau formBayar.orderNo dimanipulasi, transaksi tetap ditolak kalau
            // order tersebut bukan milik pelanggan yang sedang login.
            if (this.loginRole === 'Pelanggan') {
                if (!this.myCustomer || order.pelanggan !== this.myCustomer.nama) {
                    this.bayarError = 'Order ini bukan milik akun Anda.';
                    return;
                }
            }

            const jumlah = Math.round(this.formBayar.jumlah || 0);
            if (jumlah <= 0) { this.bayarError = 'Jumlah pembayaran harus lebih dari 0.'; return; }
            if (jumlah > order.sisa) { this.bayarError = 'Jumlah melebihi sisa tagihan (' + rupiah(order.sisa) + ').'; return; }

            // Jenis transaksi otomatis mengikuti kondisi order (DP jika belum pernah
            // bayar sama sekali, Pelunasan jika sudah ada DP) — untuk pelanggan ini
            // dikunci otomatis (field jenis disembunyikan di UI), staf tetap bisa
            // override manual lewat dropdown.
            const jenis = this.loginRole === 'Pelanggan' ? (order.dp > 0 ? 'Pelunasan' : 'DP') : this.formBayar.jenis;
            const metode = this.formBayar.metode || 'Tunai';

            const trx = { no: this.nextTrxNo(), order: order.no, pelanggan: order.pelanggan, jenis, metode, tanggal: this.todayStr(), jumlah };
            this.payments.unshift(trx);
            order.dp += jumlah;
            order.sisa = Math.max(order.total - order.dp, 0);

            this.resetFormBayar();
            this.closeModal('modalBayar');
            this.saveCoreData();
            this.toast(this.loginRole === 'Pelanggan' ? '✅ Pembayaran Anda berhasil dicatat.' : 'Pembayaran tercatat.');
            this.$nextTick(() => this.renderCharts());
            this.cetakNota(order, trx);
        },

        simpanStok() {
            this.stokError = '';
            const item = this.stok.find(s => s.nama === this.formStok.bahan);
            if (!item) { this.stokError = 'Pilih bahan.'; return; }
            const jml = Math.round(this.formStok.jumlah || 0);
            if (jml <= 0) { this.stokError = 'Jumlah harus lebih dari 0.'; return; }
            if (this.formStok.tipe === 'Stok Masuk') {
                item.sisa += jml; item.masuk += jml;
                if (item.sisa > item.kapasitas) item.kapasitas = item.sisa;
            } else {
                if (jml > item.sisa) { this.stokError = 'Stok tidak mencukupi untuk dikeluarkan.'; return; }
                item.sisa -= jml; item.keluar += jml;
            }
            this.resetFormStok();
            this.closeModal('modalStok');
            this.saveCoreData();
            this.toast('Mutasi stok tercatat.');
            this.$nextTick(() => this.renderCharts());
        },

        simpanUser() {
            this.userError = '';
            if (!this.formUser.nama || !this.formUser.email) { this.userError = 'Nama dan email wajib diisi.'; return; }
            if (this.users.some(u => u.email.toLowerCase() === this.formUser.email.toLowerCase())) { this.userError = 'Email sudah terdaftar.'; return; }
            this.users.push({ nama: this.formUser.nama, email: this.formUser.email, role: this.formUser.role, aktif: true });
            this.resetFormUser();
            this.closeModal('modalUser');
            this.saveCoreData();
            this.toast('Pengguna baru ditambahkan.');
        },

        // Aktifkan/nonaktifkan akun user staff — dipanggil dari tabel User & Hak
        // Akses (menggantikan mutasi inline supaya perubahan ikut tersimpan permanen).
        toggleUserAktif(u) {
            u.aktif = !u.aktif;
            this.saveCoreData();
            this.toast(u.aktif ? ('✅ Akun "' + u.nama + '" diaktifkan.') : ('⛔ Akun "' + u.nama + '" dinonaktifkan.'));
        },

        async hapusUser(u) {
            if (u.role === 'Owner') {
                this.toast('⚠️ Tidak dapat menghapus akun Owner utama.');
                return;
            }
            const ok = await this.confirmSwal('Hapus akun pengguna "' + u.nama + '" (' + u.email + ')?', { title: 'Hapus Pengguna?', confirmText: 'Ya, Hapus' });
            if (!ok) return;
            this.users = this.users.filter(x => x.email !== u.email);
            this.saveCoreData();
            this.toast('🗑️ Pengguna "' + u.nama + '" telah dihapus.');
        },

        // ---------- CRUD Driver & Kurir Armada ----------
        openAddDriver() {
            this.resetFormDriver();
        },

        openEditDriver(d) {
            this.driverEditMode = true;
            this.formDriver = {
                id: d.id || d.nama,
                nama: d.nama || '',
                kendaraan: d.kendaraan || '',
                hp: d.hp || '',
                status: d.status || 'Aktif'
            };
            this.driverError = '';
        },

        simpanDriver() {
            if (!this.formDriver.nama.trim()) {
                this.driverError = 'Nama driver wajib diisi.';
                return;
            }
            if (!this.formDriver.kendaraan.trim()) {
                this.driverError = 'Rincian armada & nomor plat wajib diisi.';
                return;
            }

            if (!Array.isArray(this.kurirAktif)) this.kurirAktif = [];

            if (this.driverEditMode && this.formDriver.id) {
                const target = this.kurirAktif.find(k => (k.id === this.formDriver.id || k.nama === this.formDriver.nama));
                if (target) {
                    target.nama = this.formDriver.nama.trim();
                    target.kendaraan = this.formDriver.kendaraan.trim();
                    target.hp = this.formDriver.hp.trim();
                    target.status = this.formDriver.status;
                    target.inisial = target.nama.split(' ').map(n => n[0]).join('').toUpperCase();
                }
                this.toast('✅ Data driver "' + this.formDriver.nama + '" diperbarui.');
            } else {
                const colors = ['#C2141A', '#0F6E6E', '#7C5CFC', '#2A9D6B', '#FF6B2C'];
                const inisial = this.formDriver.nama.trim().split(' ').map(n => n[0]).join('').toUpperCase();
                const newDriver = {
                    id: 'DRV-' + Date.now(),
                    nama: this.formDriver.nama.trim(),
                    kendaraan: this.formDriver.kendaraan.trim(),
                    hp: this.formDriver.hp.trim() || '6281240902277',
                    rating: '5.0',
                    inisial: inisial,
                    warna: colors[Math.floor(Math.random() * colors.length)],
                    status: this.formDriver.status || 'Aktif'
                };
                this.kurirAktif.push(newDriver);
                this.toast('🎉 Driver baru "' + newDriver.nama + '" ditambahkan.');
            }

            this.saveCoreData();
            this.resetFormDriver();
            try {
                const el = document.getElementById('modalDriver');
                const inst = window.bootstrap && el ? bootstrap.Modal.getInstance(el) : null;
                if (inst) inst.hide();
            } catch (e) { /* no-op */ }
        },

        async hapusDriver(d) {
            const ok = await this.confirmSwal('Hapus driver "' + d.nama + '" dari daftar armada?', { title: 'Hapus Driver?', confirmText: 'Ya, Hapus' });
            if (!ok) return;
            this.kurirAktif = this.kurirAktif.filter(k => k.nama !== d.nama && k.id !== d.id);
            this.saveCoreData();
            this.toast('🗑️ Driver "' + d.nama + '" dihapus.');
        },

        // ---------- Profile Management ----------
        async handleAvatarUpload(e) {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                this.toast('Pilih file gambar yang valid (JPG, PNG, WebP).');
                return;
            }
            if (file.size > 3 * 1024 * 1024) {
                this.toast('Ukuran foto profil maksimal 3MB.');
                return;
            }
            try {
                // Kompres dulu supaya avatar (base64) tidak ikut membebani kuota localStorage.
                this.formProfile.avatar = await this._compressImageFile(file, { maxWidth: 480, maxHeight: 480, targetBytes: 120 * 1024 });
                this.toast('Foto profil berhasil diunggah.');
            } catch (err) {
                console.error('[CETAK.OS] Gagal memproses foto profil:', err);
                this.toast('⚠️ Gagal memproses foto profil.');
            }
        },

        hapusAvatar() {
            this.formProfile.avatar = '';
            this.toast('Foto profil dihapus (menggunakan inisial nama).');
        },

        openModalProfil() {
            this.profilError = '';
            let email = '';
            let hp = '';
            let instansi = '';
            if (this.loginRole === 'Pelanggan') {
                const c = this.myCustomer;
                if (c) {
                    email = (c.nama.toLowerCase().replace(/\s+/g, '') + '@gmail.com');
                    hp = c.hp || '';
                    instansi = c.instansi || '';
                }
            } else {
                const u = this.users.find(x => x.nama === this.loginUserName) || this.users[0];
                if (u) {
                    email = u.email;
                }
                hp = '0812-4090-2277';
                instansi = 'KugiyaiTobe Digital-Printing';
            }
            this.formProfile = {
                nama: this.loginUserName,
                email: email,
                hp: hp,
                instansi: instansi,
                avatar: this.loginUserAvatar || '',
                passwordLama: '',
                passwordBaru: '',
                konfirmasiPassword: '',
                role: this.loginRole
            };
            if (window.bootstrap) {
                const el = document.getElementById('modalProfil');
                if (el) bootstrap.Modal.getOrCreateInstance(el).show();
            }
        },

        simpanProfil() {
            this.profilError = '';
            if (!this.formProfile.nama.trim()) {
                this.profilError = 'Nama wajib diisi.';
                return;
            }
            if (!this.formProfile.email.trim()) {
                this.profilError = 'Email wajib diisi.';
                return;
            }
            if (this.formProfile.passwordBaru) {
                if (this.formProfile.passwordBaru.length < 6) {
                    this.profilError = 'Password baru minimal 6 karakter.';
                    return;
                }
                if (this.formProfile.passwordBaru !== this.formProfile.konfirmasiPassword) {
                    this.profilError = 'Konfirmasi password baru tidak cocok.';
                    return;
                }
            }

            const oldName = this.loginUserName;
            this.loginUserName = this.formProfile.nama.trim();
            this.loginUserAvatar = this.formProfile.avatar || '';

            try {
                if (this.loginUserAvatar) {
                    localStorage.setItem('kugiyaiUserAvatar', this.loginUserAvatar);
                } else {
                    localStorage.removeItem('kugiyaiUserAvatar');
                }
            } catch (e) { /* storage error ignored */ }

            if (this.loginRole === 'Pelanggan' && this.myCustomer) {
                this.myCustomer.nama = this.loginUserName;
                this.myCustomer.hp = this.formProfile.hp;
                this.myCustomer.instansi = this.formProfile.instansi;
                this.orders.forEach(o => { if (o.pelanggan === oldName) o.pelanggan = this.loginUserName; });
                this.designs.forEach(d => { if (d.pelanggan === oldName) d.pelanggan = this.loginUserName; });
                this.payments.forEach(p => { if (p.pelanggan === oldName) p.pelanggan = this.loginUserName; });
                // Data pengantaran (pelacakan kurir/GPS) juga mengunci relasi ke
                // pelanggan lewat field nama — kalau tidak ikut disinkronkan di
                // sini, riwayat & status antar pelanggan ini akan "hilang" dari
                // dashboard-nya sendiri begitu dia ganti nama profil.
                this.pengantaran.forEach(p => { if (p.pelanggan === oldName) p.pelanggan = this.loginUserName; });
            } else {
                const u = this.users.find(x => x.nama === oldName || x.role === this.loginRole);
                if (u) {
                    u.nama = this.loginUserName;
                    u.email = this.formProfile.email.trim();
                }
            }

            this.saveCoreData();
            this.toast('✅ Profil berhasil diperbarui.');
            this.closeModal('modalProfil');
        },

        switchRole(roleName, custId = 1) {
            this.loginRole = roleName;
            if (roleName === 'Pelanggan') {
                this.loginCustomerId = custId;
                const c = this.customers.find(x => x.id === custId) || this.customers[0];
                this.loginUserName = c.nama;
            } else {
                const u = this.users.find(x => x.role === roleName) || this.users[0];
                this.loginUserName = u ? u.nama : 'Admin KugiyaiTobe';
            }
            this.page = 'dashboard';
            this.closeModal('modalProfil');
            this.toast('🔄 Beralih peran ke: ' + roleName + ' (' + this.loginUserName + ')');
            this.$nextTick(() => this.renderCharts());
        },

        cetakNota(order, trx) {
            if (!order) return;
            const win = window.open('', '_blank', 'width=440,height=660');
            if (!win) { this.toast('Izinkan pop-up untuk mencetak nota.'); return; }
            const isiTrx = trx ? (
                '<tr><td>No Transaksi</td><td>' + trx.no + '</td></tr>' +
                '<tr><td>Jenis Pembayaran</td><td>' + trx.jenis + '</td></tr>' +
                '<tr><td>Metode</td><td>' + trx.metode + '</td></tr>' +
                '<tr><td>Tanggal</td><td>' + trx.tanggal + '</td></tr>' +
                '<tr><td>Jumlah Dibayar</td><td>' + rupiah(trx.jumlah) + '</td></tr>'
            ) : '';
            win.document.write(
                '<!DOCTYPE html><html><head><title>Nota ' + order.no + '</title><style>' +
                'body{font-family:Arial,sans-serif;padding:24px;color:#14161C;}' +
                'h2{margin:0 0 2px;color:#0B1B3D;} h2 span{color:#C2141A;} .sub{color:#6B7280;font-size:12px;margin-bottom:16px;}' +
                'table{width:100%;border-collapse:collapse;font-size:13px;}' +
                'td{padding:6px 0;border-bottom:1px solid #eee;}' +
                'td:last-child{text-align:right;font-weight:600;}' +
                '.total{font-size:15px;font-weight:700;margin-top:14px;color:#0B1B3D;}' +
                '</style></head><body>' +
                '<h2>KUGIYAI<span>.TOBE</span> DIGITAL-PRINTING</h2>' +
                '<div class="sub">Mugou - Waghete - Deiyai, Papua Tengah &middot; Nota Resmi</div>' +
                '<table>' +
                '<tr><td>No Order</td><td>' + order.no + '</td></tr>' +
                '<tr><td>Pelanggan</td><td>' + order.pelanggan + '</td></tr>' +
                '<tr><td>Jenis / Ukuran</td><td>' + order.jenis + ' &middot; ' + order.ukuran + '</td></tr>' +
                '<tr><td>Jumlah</td><td>' + order.jumlah + '</td></tr>' +
                '<tr><td>Total</td><td>' + rupiah(order.total) + '</td></tr>' +
                '<tr><td>Sudah Dibayar</td><td>' + rupiah(order.dp) + '</td></tr>' +
                '<tr><td>Sisa Tagihan</td><td>' + rupiah(order.sisa) + '</td></tr>' +
                isiTrx +
                '</table>' +
                '<div class="total">Status: ' + (order.sisa <= 0 ? 'LUNAS' : 'BELUM LUNAS') + '</div>' +
                '<script>window.onload=function(){window.print();};<\/script>' +
                '</body></html>'
            );
            win.document.close();
        },

        cetakSPK(order) {
            if (!order) return;
            const win = window.open('', '_blank');
            if (!win) { this.toast('Izinkan pop-up untuk mencetak SPK.'); return; }
            const nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            win.document.write(`
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <title>SPK Produksi — ${order.no}</title>
                    <style>
                        @page { size: A4 portrait; margin: 15mm; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; color: #14161C; padding: 20px; font-size: 13px; }
                        .kop { border-bottom: 2.5px solid #C2141A; padding-bottom: 10px; margin-bottom: 15px; display:flex; justify-content:space-between; align-items:center; }
                        .kop h2 { margin: 0; color: #0B1B3D; font-size: 20px; }
                        .kop h2 span { color: #C2141A; }
                        .kop p { margin: 2px 0 0; color: #666; font-size: 11px; }
                        .title-spk { text-align: center; margin: 15px 0; }
                        .title-spk h3 { margin: 0; font-size: 16px; background: #0B1B3D; color: #fff; display: inline-block; padding: 5px 18px; border-radius: 4px; }
                        .box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px; margin-bottom: 15px; background: #FAFAFA; }
                        .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #E5E7EB; }
                        .row:last-child { border-bottom: none; }
                        .label { color: #666; font-weight: 500; }
                        .val { font-weight: 600; text-align: right; }
                        .instruksi { background: #FFF8E7; border: 1px solid #F59E0B; padding: 12px; border-radius: 8px; margin: 15px 0; }
                        .checklist { margin: 15px 0; }
                        .check-item { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
                        .sq { width: 14px; height: 14px; border: 1.5px solid #333; display: inline-block; border-radius: 2px; }
                        .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
                        .sig { width: 180px; text-align: center; }
                        .sig-line { margin-top: 50px; border-bottom: 1px solid #333; }
                        .btn-bar { margin-bottom: 15px; text-align: right; }
                        @media print { .btn-bar { display: none; } body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="btn-bar">
                        <button onclick="window.print()" style="background:#C2141A;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">🖨️ Cetak / Simpan SPK (PDF)</button>
                    </div>
                    <div class="kop">
                        <div>
                            <h2>KUGIYAI<span>.TOBE</span> DIGITAL-PRINTING</h2>
                            <p>Mugou — Waghete — Deiyai, Papua Tengah &bull; SPK Operator & Produksi</p>
                        </div>
                        <div style="text-align:right;font-size:11px;color:#666;">
                            <div>Form QC-PRD-01</div>
                            <div>Dicetak: ${nowStr}</div>
                        </div>
                    </div>
                    <div class="title-spk">
                        <h3>SURAT PERINTAH KERJA (SPK)</h3>
                        <div style="font-size:12px;color:#666;margin-top:4px;">No: <strong>${order.no}</strong></div>
                    </div>
                    <div class="box">
                        <div class="row"><span class="label">Nama Pemesan / Klien</span><span class="val">${order.pelanggan}</span></div>
                        <div class="row"><span class="label">Jenis Cetakan</span><span class="val">${order.jenis}</span></div>
                        <div class="row"><span class="label">Ukuran Dimensi</span><span class="val" style="font-size:15px;color:#C2141A;">${order.ukuran}</span></div>
                        <div class="row"><span class="label">Jumlah Pesanan</span><span class="val">${order.jumlah} Lembar / Unit</span></div>
                        <div class="row"><span class="label">Tenggat Waktu (Deadline)</span><span class="val" style="color:#C2141A;">${order.deadline}</span></div>
                        <div class="row"><span class="label">Tahap Saat Ini</span><span class="val">${this.statusBadge(order.statusProduksi).label}</span></div>
                    </div>
                    <div class="instruksi">
                        <strong>Catatan / Instruksi Khusus:</strong><br>
                        ${order.catatan ? order.catatan : 'Cetak standar CMYK tajam, cek kerapihan mata ayam/finishing tepi.'}
                    </div>
                    <div class="checklist">
                        <strong>Checklist QC Produksi:</strong>
                        <div class="check-item"><span class="sq"></span> File Resolusi & Warna CMYK terverifikasi desainer</div>
                        <div class="check-item"><span class="sq"></span> Hasil Cetak bebas garis / banding / cacat tinta</div>
                        <div class="check-item"><span class="sq"></span> Pemotongan & Finishing (mata ayam / lipat / roll) rapi</div>
                        <div class="check-item"><span class="sq"></span> Packing rapi & Siap Diserahkan / Dipasang</div>
                    </div>
                    <div class="signatures">
                        <div class="sig">
                            <div>Desainer Grafis:</div>
                            <div class="sig-line"></div>
                            <div>( Kevin Wonda )</div>
                        </div>
                        <div class="sig">
                            <div>Operator Produksi:</div>
                            <div class="sig-line"></div>
                            <div>( Dedi Prasetyo )</div>
                        </div>
                    </div>
                </body>
                </html>
            `);
            win.document.close();
        },

        cetakInvoice(order) {
            if (!order) return;
            const win = window.open('', '_blank');
            if (!win) { this.toast('Izinkan pop-up untuk mencetak Faktur.'); return; }
            const nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const isLunas = order.sisa <= 0;
            win.document.write(`
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <title>Invoice — ${order.no}</title>
                    <style>
                        @page { size: A4 portrait; margin: 15mm; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; color: #14161C; padding: 20px; font-size: 13px; line-height: 1.5; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2.5px solid #C2141A; padding-bottom: 15px; margin-bottom: 20px; }
                        .brand h1 { margin: 0; font-size: 24px; color: #0B1B3D; }
                        .brand h1 span { color: #C2141A; }
                        .brand p { margin: 3px 0 0; color: #666; font-size: 11px; }
                        .inv-meta { text-align: right; }
                        .inv-meta h2 { margin: 0; font-size: 22px; color: #0B1B3D; letter-spacing: 1px; }
                        .inv-meta p { margin: 3px 0 0; color: #666; font-size: 12px; }
                        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                        .bill-to { background: #F8F9FA; border-radius: 8px; padding: 12px; border: 1px solid #E5E7EB; }
                        .bill-to h4 { margin: 0 0 6px; font-size: 12px; color: #666; text-transform: uppercase; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        th { background: #0B1B3D; color: #fff; text-align: left; padding: 10px; font-size: 12px; }
                        td { padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 12px; }
                        .total-card { margin-left: auto; width: 280px; }
                        .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
                        .total-grand { border-top: 2px solid #0B1B3D; font-weight: bold; font-size: 15px; margin-top: 6px; padding-top: 6px; }
                        .stamp { display: inline-block; padding: 6px 16px; border: 2px solid ${isLunas ? '#2A9D6B' : '#C2141A'}; color: ${isLunas ? '#2A9D6B' : '#C2141A'}; border-radius: 6px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; transform: rotate(-5deg); margin-top: 10px; }
                        .footer { margin-top: 40px; border-top: 1px solid #E5E7EB; padding-top: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #666; }
                        .btn-bar { margin-bottom: 15px; text-align: right; }
                        @media print { .btn-bar { display: none; } body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="btn-bar">
                        <button onclick="window.print()" style="background:#C2141A;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">🖨️ Cetak / Simpan Faktur (PDF)</button>
                    </div>
                    <div class="header">
                        <div class="brand">
                            <h1>KUGIYAI<span>.TOBE</span></h1>
                            <p>Digital Printing & Advertising &bull; Waghete, Deiyai, Papua Tengah</p>
                            <p>WA: 0812-4090-2277 &bull; Email: halo@kugiyaitobe.id</p>
                        </div>
                        <div class="inv-meta">
                            <h2>FAKTUR RESMI</h2>
                            <p>No: <strong>${order.no}</strong></p>
                            <p>Tanggal: ${nowStr}</p>
                            <p>Jatuh Tempo: ${order.deadline}</p>
                        </div>
                    </div>

                    <div class="grid-2">
                        <div class="bill-to">
                            <h4>Ditujukan Kepada:</h4>
                            <div style="font-size:15px;font-weight:bold;color:#0B1B3D;">${order.pelanggan}</div>
                            <div style="font-size:12px;color:#555;margin-top:2px;">Pelanggan Percetakan</div>
                        </div>
                        <div class="bill-to">
                            <h4>Status Pembayaran:</h4>
                            <div class="stamp">${isLunas ? 'LUNAS (PAID)' : 'BELUM LUNAS'}</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Deskripsi Pesanan</th>
                                <th>Ukuran</th>
                                <th style="text-align:center;">Qty</th>
                                <th style="text-align:right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <strong>${order.jenis}</strong>
                                    <div style="color:#666;font-size:11px;">${order.catatan || 'Cetak kualitas outdoor tahan cuaca'}</div>
                                </td>
                                <td>${order.ukuran}</td>
                                <td style="text-align:center;">${order.jumlah}</td>
                                <td style="text-align:right;font-weight:600;">${rupiah(order.total)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="total-card">
                        <div class="total-row"><span>Total Tagihan:</span><span style="font-weight:600;">${rupiah(order.total)}</span></div>
                        <div class="total-row"><span>Sudah Dibayar (DP):</span><span style="color:#0F6E6E;font-weight:600;">${rupiah(order.dp)}</span></div>
                        <div class="total-row total-grand"><span>Sisa Tagihan:</span><span style="color:${order.sisa > 0 ? '#C2141A' : '#0B1B3D'};">${rupiah(order.sisa)}</span></div>
                    </div>

                    <div class="footer">
                        <div>Terima kasih atas kepercayaan Anda kepada KugiyaiTobe Digital-Printing.</div>
                        <div>Halaman 1 / 1 &bull; CETAK.OS System</div>
                    </div>
                </body>
                </html>
            `);
            win.document.close();
        },

        eksporPDF() {
            const win = window.open('', '_blank');
            if (!win) { this.toast('Izinkan pop-up untuk mencetak / menyimpan PDF.'); return; }
            const nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const rowsHtml = this.orders.map((o, idx) => `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td style="font-family:monospace;font-weight:600;">${o.no}</td>
                    <td><strong>${o.pelanggan}</strong></td>
                    <td>${o.jenis} <span style="color:#666;font-size:11px;">(${o.ukuran})</span></td>
                    <td style="text-align:center;">${o.jumlah}</td>
                    <td style="text-align:right;">${rupiah(o.total)}</td>
                    <td style="text-align:right;color:#0F6E6E;">${rupiah(o.dp)}</td>
                    <td style="text-align:right;color:${o.sisa > 0 ? '#C2141A' : '#666'};font-weight:${o.sisa > 0 ? '700' : 'normal'};">${rupiah(o.sisa)}</td>
                    <td>${o.deadline}</td>
                    <td style="text-align:center;"><span class="badge ${o.statusProduksi}">${this.statusBadge(o.statusProduksi).label}</span></td>
                </tr>
            `).join('');

            const totalOmset = this.orders.reduce((a, b) => a + b.total, 0);
            const totalTerbayar = this.orders.reduce((a, b) => a + b.dp, 0);
            const totalPiutang = this.orders.reduce((a, b) => a + b.sisa, 0);

            win.document.write(`
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <title>Laporan Kinerja Percetakan — ${this.reportPeriod} ${nowStr}</title>
                    <style>
                        @page { size: A4 landscape; margin: 12mm 15mm; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; color: #14161C; margin: 0; padding: 20px; font-size: 12px; }
                        .kop { border-bottom: 2.5px solid #C2141A; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
                        .kop-brand { font-size: 22px; font-weight: 800; color: #0B1B3D; letter-spacing: -0.5px; }
                        .kop-brand span { color: #C2141A; }
                        .kop-sub { font-size: 11px; color: #6B7280; margin-top: 2px; }
                        .kop-meta { text-align: right; font-size: 11px; color: #555; }
                        .doc-title { text-align: center; margin: 16px 0 20px; }
                        .doc-title h2 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px; color: #0B1B3D; }
                        .doc-title p { margin: 4px 0 0; color: #6B7280; font-size: 12px; }
                        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
                        .kpi-box { background: #F8F9FA; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; }
                        .kpi-label { font-size: 10px; text-transform: uppercase; color: #6B7280; font-weight: 600; }
                        .kpi-val { font-size: 16px; font-weight: 700; color: #0B1B3D; margin-top: 4px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 11px; }
                        th { background: #0B1B3D; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
                        td { padding: 7px 10px; border-bottom: 1px solid #E5E7EB; }
                        tr:nth-child(even) td { background: #FAFAFA; }
                        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
                        .badge.selesai { background: #DDF2E7; color: #2A9D6B; }
                        .badge.cetak { background: #FDE8E8; color: #C2141A; }
                        .badge.tunggu_desain { background: #F3F4F6; color: #6B7280; }
                        .badge.tunggu_setuju { background: #FEF3C7; color: #D97706; }
                        .badge.siap_cetak { background: #DFF3F1; color: #0F6E6E; }
                        .badge.finishing { background: #EDE9FE; color: #7C5CFC; }
                        .signatures { display: flex; justify-content: space-between; margin-top: 30px; page-break-inside: avoid; }
                        .sig-box { width: 220px; text-align: center; }
                        .sig-line { margin-top: 60px; border-bottom: 1px solid #333; }
                        .no-print-bar { background: #0B1B3D; color: #fff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; margin: -20px -20px 20px -20px; border-radius: 0 0 8px 8px; }
                        .btn-print { background: #C2141A; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
                        @media print {
                            .no-print-bar { display: none; }
                            body { padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <div class="no-print-bar">
                        <span><strong>CETAK.OS</strong> — Preview Dokumen Laporan Resmi</span>
                        <div>
                            <button class="btn-print" onclick="window.print()">🖨️ Cetak / Simpan PDF</button>
                            <button onclick="window.close()" style="background:#555;color:#fff;border:none;padding:8px 14px;border-radius:6px;margin-left:8px;cursor:pointer;">Tutup</button>
                        </div>
                    </div>

                    <div class="kop">
                        <div>
                            <div class="kop-brand">KUGIYAI<span>.TOBE</span> DIGITAL-PRINTING</div>
                            <div class="kop-sub">Mugou — Waghete — Deiyai, Papua Tengah &bull; Telp/WA: 0812-4090-2277</div>
                        </div>
                        <div class="kop-meta">
                            <div><strong>Sistem:</strong> CETAK.OS Percetakan</div>
                            <div><strong>Tanggal Ekspor:</strong> ${nowStr}</div>
                            <div><strong>Dicetak Oleh:</strong> ${this.loginUserName} (${this.loginRole})</div>
                        </div>
                    </div>

                    <div class="doc-title">
                        <h2>LAPORAN KINERJA & PENJUALAN OPERASIONAL</h2>
                        <p>Periode: <strong>${this.reportPeriod.toUpperCase()}</strong> &bull; Total Transaksi: ${this.orders.length} Order</p>
                    </div>

                    <div class="kpi-grid">
                        <div class="kpi-box">
                            <div class="kpi-label">Total Omset Pesanan</div>
                            <div class="kpi-val">${rupiah(totalOmset)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="kpi-label">Kas Masuk (DP/Lunas)</div>
                            <div class="kpi-val" style="color:#0F6E6E;">${rupiah(totalTerbayar)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="kpi-label">Sisa Piutang Berjalan</div>
                            <div class="kpi-val" style="color:#C2141A;">${rupiah(totalPiutang)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="kpi-label">Produk Terlaris</div>
                            <div class="kpi-val">${this.produkTerlaris}</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width:30px;text-align:center;">No</th>
                                <th>No Order</th>
                                <th>Nama Pelanggan</th>
                                <th>Jenis & Ukuran</th>
                                <th style="text-align:center;">Qty</th>
                                <th style="text-align:right;">Total Biaya</th>
                                <th style="text-align:right;">Dibayar</th>
                                <th style="text-align:right;">Sisa Tagihan</th>
                                <th>Deadline</th>
                                <th style="text-align:center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <div class="signatures">
                        <div class="sig-box">
                            <div>Dibuat Oleh:</div>
                            <div class="sig-line"></div>
                            <div style="margin-top:4px;"><strong>${this.loginUserName}</strong></div>
                            <div style="font-size:10px;color:#666;">${this.loginRole}</div>
                        </div>
                        <div class="sig-box">
                            <div>Waghete, ${nowStr}</div>
                            <div style="font-size:11px;">Penanggung Jawab / Owner:</div>
                            <div class="sig-line"></div>
                            <div style="margin-top:4px;"><strong>Admin KugiyaiTobe</strong></div>
                            <div style="font-size:10px;color:#666;">Owner Percetakan</div>
                        </div>
                    </div>
                </body>
                </html>
            `);
            win.document.close();
        },

        eksporLaporan() {
            const rows = [['No Order', 'Pelanggan', 'Jenis', 'Ukuran', 'Jumlah', 'Total', 'DP', 'Sisa', 'Deadline', 'Status']];
            this.orders.forEach(o => rows.push([o.no, o.pelanggan, o.jenis, o.ukuran, o.jumlah, o.total, o.dp, o.sisa, o.deadline, this.statusBadge(o.statusProduksi).label]));
            const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'laporan-cetakos-' + this.reportPeriod.toLowerCase() + '.csv';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.toast('Laporan diekspor sebagai CSV.');
        },

        runGlobalSearch() {
            const q = this.globalSearch.trim().toLowerCase();
            if (!q) return;
            const orderHit = (this.loginRole === 'Pelanggan' ? this.myOrders : this.orders).find(o => o.no.toLowerCase().includes(q));
            if (orderHit) { this.page = 'order'; this.orderFilter = 'Semua'; this.toast('Menampilkan hasil untuk "' + this.globalSearch + '"'); return; }
            if (this.loginRole !== 'Pelanggan') {
                const custHit = this.customers.find(c => c.nama.toLowerCase().includes(q));
                if (custHit) { this.page = 'pelanggan'; this.custSearch = this.globalSearch; return; }
            }
            this.toast('Tidak ada hasil untuk "' + this.globalSearch + '"');
        },

        moveStage(order, dir) {
            const idx = this.produksiCols.findIndex(c => c.key === order.statusProduksi);
            const next = idx + dir;
            if (next >= 0 && next < this.produksiCols.length) {
                order.statusProduksi = this.produksiCols[next].key;
                this.saveCoreData();
                this.$nextTick(() => this.renderCharts());
            }
        },

        // ============================================================
        // PETA GPS PENGANTARAN — alur kirim, simulasi realtime, & render peta
        // ============================================================
        bukaFormKirim() {
            this.kirimError = '';
            this.formKirim.kurir = (this.kurirAktif[0] && this.kurirAktif[0].nama) || '';
            const order = this.selectedOrder;
            const customer = order ? this.customers.find(c => c.nama === order.pelanggan) : null;
            // Kalau pelanggan ini sudah pernah punya titik lokasi tersimpan
            // (dipilih manual sendiri oleh pelanggan, atau dari pengantaran
            // sebelumnya), pra-isi peta dengan titik itu supaya owner/kurir
            // tinggal konfirmasi/geser kalau perlu. Kalau belum ada sama
            // sekali, biarkan kosong — WAJIB dipilih manual.
            if (customer && customer.koordinat && typeof customer.koordinat.lat === 'number') {
                this.formKirim.lokasiTujuan = { lat: customer.koordinat.lat, lng: customer.koordinat.lng };
            } else {
                this.formKirim.lokasiTujuan = null;
            }
            this.formKirim.alamatTujuan = (customer && customer.alamat) ? customer.alamat : '';
            this.kirimPanelOpen = true;
            // Peta lain yang mungkin sedang tampil di modal yang sama (peta
            // read-only pelacakan, atau peta pilih-lokasi milik pelanggan)
            // harus dibersihkan dulu supaya tidak berebut container/ganggu.
            if (this._miniMap) { try { this._miniMap.remove(); } catch (e) { /* no-op */ } this._miniMap = null; this._miniKurirMarker = null; }
            if (this._plgMap) { try { this._plgMap.remove(); } catch (e) { /* no-op */ } this._plgMap = null; this._plgMarker = null; }
            this.$nextTick(() => this.initLokasiPickerMap());
        },
        tutupFormKirim() {
            this.kirimPanelOpen = false;
            // Hancurkan instance peta mini supaya tidak menumpuk / "leak" saat
            // panel dibuka-tutup berkali-kali (Leaflet tidak boleh di-init dua
            // kali di atas container yang sama tanpa dibersihkan dulu).
            if (this._pickerMap) {
                try { this._pickerMap.remove(); } catch (e) { /* no-op */ }
                this._pickerMap = null;
                this._pickerMarker = null;
            }
        },

        // ---------- peta mini "pilih lokasi pengantaran" di Form Kirim ----------
        initLokasiPickerMap() {
            const container = document.getElementById('mapPilihLokasi');
            if (!container || typeof L === 'undefined') return;
            if (this._pickerMap) { try { this._pickerMap.remove(); } catch (e) { /* no-op */ } this._pickerMap = null; this._pickerMarker = null; }

            const start = this.formKirim.lokasiTujuan || TOKO_LOKASI;
            this._pickerMap = L.map(container, { zoomControl: true, attributionControl: false })
                .setView([start.lat, start.lng], this.formKirim.lokasiTujuan ? 15 : 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(this._pickerMap);

            L.marker([TOKO_LOKASI.lat, TOKO_LOKASI.lng], {
                icon: L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-toko">🏭</div>', iconSize: [26, 26], iconAnchor: [13, 24] }),
                interactive: false,
            }).addTo(this._pickerMap);

            const tujuanIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] });
            if (this.formKirim.lokasiTujuan) {
                this._pickerMarker = L.marker([start.lat, start.lng], { icon: tujuanIcon, draggable: true }).addTo(this._pickerMap);
                this._pickerMarker.on('dragend', () => {
                    const ll = this._pickerMarker.getLatLng();
                    this.formKirim.lokasiTujuan = { lat: ll.lat, lng: ll.lng };
                });
            }

            // Klik di mana saja pada peta = tetapkan/geser titik tujuan ke sana.
            this._pickerMap.on('click', (e) => {
                this.setLokasiPicker(e.latlng.lat, e.latlng.lng);
            });

            setTimeout(() => { if (this._pickerMap) this._pickerMap.invalidateSize(); }, 120);
        },

        // Menetapkan (atau memindahkan) pin tujuan pengantaran ke koordinat
        // tertentu — dipanggil dari klik peta, drag pin, geolokasi perangkat,
        // preset wilayah, atau tombol "pakai lokasi tersimpan pelanggan".
        setLokasiPicker(lat, lng, labelOpt) {
            this.formKirim.lokasiTujuan = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
            if (labelOpt && !this.formKirim.alamatTujuan) {
                this.formKirim.alamatTujuan = labelOpt;
            }
            this.kirimError = '';
            if (!this._pickerMap) return;
            const tujuanIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] });
            if (!this._pickerMarker) {
                this._pickerMarker = L.marker([lat, lng], { icon: tujuanIcon, draggable: true }).addTo(this._pickerMap);
                this._pickerMarker.on('dragend', () => {
                    const ll = this._pickerMarker.getLatLng();
                    this.formKirim.lokasiTujuan = { lat: Number(ll.lat.toFixed(6)), lng: Number(ll.lng.toFixed(6)) };
                });
            } else {
                this._pickerMarker.setLatLng([lat, lng]);
            }
            this._pickerMap.panTo([lat, lng], { animate: true });
        },

        // Memilih preset lokasi wilayah umum Deiyai / Waghete
        pilihPresetLokasi(presetKey) {
            const presets = {
                'waghete': { lat: -4.0346375, lng: 136.2877969, label: 'Pasar Waghete II, Deiyai' },
                'bupati': { lat: -4.0250000, lng: 136.2950000, label: 'Kantor Bupati Deiyai, Tigi' },
                'gereja': { lat: -4.0380000, lng: 136.2810000, label: 'Gereja Katolik St. Yohanes Waghete' },
                'moanemani': { lat: -4.0500000, lng: 136.2700000, label: 'Simpang Moanemani (Arah Dogiyai)' },
                'enarotali': { lat: -3.9200000, lng: 136.3500000, label: 'Pertigaan Enarotali (Arah Paniai)' }
            };
            const p = presets[presetKey];
            if (p) {
                this.setLokasiPicker(p.lat, p.lng, p.label);
                if (this._pickerMap) this._pickerMap.setView([p.lat, p.lng], 15);
                this.toast('📍 Lokasi preset dipilih: ' + p.label);
            }
        },

        // Tombol bantu: pakai titik lokasi pelanggan yang sudah pernah
        // disimpan dari pengantaran sebelumnya (kalau ada).
        gunakanLokasiTersimpan() {
            const order = this.selectedOrder;
            const customer = order ? this.customers.find(c => c.nama === order.pelanggan) : null;
            if (!customer || !customer.koordinat) {
                this.kirimError = 'Belum ada lokasi tersimpan untuk pelanggan ini — silakan pilih manual di peta atau dari preset.';
                return;
            }
            this.setLokasiPicker(customer.koordinat.lat, customer.koordinat.lng, customer.alamat);
            if (this._pickerMap) this._pickerMap.setView([customer.koordinat.lat, customer.koordinat.lng], 15);
            this.toast('📍 Menggunakan lokasi tersimpan pelanggan.');
        },

        // Tombol bantu: pakai lokasi GPS perangkat saat ini (mis. kurir/owner
        // sedang berada persis di titik antar / lokasi pelanggan).
        gunakanLokasiSaya() {
            if (!navigator.geolocation) {
                this.kirimError = 'Perangkat ini tidak mendukung deteksi lokasi GPS.';
                return;
            }
            this.kirimError = '';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this.setLokasiPicker(pos.coords.latitude, pos.coords.longitude, 'Lokasi GPS Perangkat');
                    if (this._pickerMap) this._pickerMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
                    this.toast('🎯 Lokasi GPS terdeteksi!');
                },
                () => { this.kirimError = 'Gagal mengambil lokasi GPS. Izinkan akses lokasi, atau pilih manual di peta.'; },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        },

        prosesKirim() {
            const order = this.selectedOrder;
            if (!order) return;
            if (!this.formKirim.kurir) { this.kirimError = 'Pilih kurir terlebih dahulu.'; return; }
            if (!this.formKirim.lokasiTujuan) {
                this.kirimError = 'Pilih dulu lokasi pengantaran di peta (klik peta, atau pakai tombol lokasi tersimpan/lokasi saya).';
                return;
            }
            const kurirObj = this.kurirAktif.find(k => k.nama === this.formKirim.kurir);
            const customer = this.customers.find(c => c.nama === order.pelanggan);
            const asal = TOKO_LOKASI;
            const tujuan = {
                lat: this.formKirim.lokasiTujuan.lat,
                lng: this.formKirim.lokasiTujuan.lng,
                label: (this.formKirim.alamatTujuan || '').trim() || (customer && customer.alamat) || order.pelanggan,
            };
            // Simpan titik yang baru saja dikonfirmasi ke data pelanggan supaya
            // pengantaran berikutnya untuk pelanggan yang sama bisa langsung
            // dipakai ulang lewat tombol "pakai lokasi tersimpan".
            if (customer) customer.koordinat = { lat: tujuan.lat, lng: tujuan.lng };
            const jarak = haversineKm(asal, tujuan);
            const now = new Date().toISOString();
            const rec = {
                id: 'PGT-' + Date.now(),
                orderNo: order.no,
                pelanggan: order.pelanggan,
                kurir: kurirObj ? kurirObj.nama : this.formKirim.kurir,
                kendaraan: kurirObj ? kurirObj.kendaraan : '-',
                status: 'proses',
                asal, tujuan,
                posisi: { lat: asal.lat, lng: asal.lng },
                jarakTotalKm: jarak,
                jarakSisaKm: jarak,
                kecepatanKmh: 24 + Math.round(Math.random() * 10),
                etaMenit: 0,
                progress: 0,
                mulai: now,
                updatedAt: now,
                riwayat: [{ event: 'Pesanan diserahkan ke kurir & berangkat dari toko', waktu: now }],
            };
            rec.etaMenit = rec.kecepatanKmh > 0 ? Math.round((rec.jarakSisaKm / rec.kecepatanKmh) * 60) : 0;
            this.pengantaran.push(rec);
            order.statusAntar = 'dikirim';
            this.kirimPanelOpen = false;
            this.saveCoreData();
            this.toast('🛵 ' + order.no + ' sedang diantar oleh ' + rec.kurir + '.');
            this._boundsFitted = false;
            // Bersihkan peta pemilihan lokasi (sudah tidak dipakai lagi setelah
            // dikirim) lalu tampilkan peta pelacakan read-only-nya di modal
            // yang sama, supaya owner langsung melihat kurir mulai bergerak
            // tanpa perlu pindah ke halaman Peta.
            if (this._pickerMap) { try { this._pickerMap.remove(); } catch (e) { /* no-op */ } this._pickerMap = null; this._pickerMarker = null; }
            this.$nextTick(() => {
                this.renderPetaMap();
                this.initMapDetailPengantaran(rec);
            });
            // Muat rute jalan sungguhan (OSRM) untuk pengantaran baru ini —
            // async, tidak menghalangi kurir mulai bergerak. Begitu rute
            // ketemu, jarak/ETA & garis rute di peta otomatis diperbarui.
            this.muatRuteUntukPengantaran(rec);
        },

        // Ambil & terapkan rute jalan sungguhan (OSRM) untuk satu pengantaran.
        // Menggantikan jarak garis-lurus (haversine) dengan jarak tempuh jalan
        // riil begitu berhasil dimuat, dan menggeser posisi kurir yang sedang
        // berjalan supaya tepat berada di atas jalur jalan sesuai progress
        // yang sudah dicapai. Aman dipanggil berulang — hanya fetch sekali
        // per pengantaran (ditandai lewat p.rute yang sudah terisi, atau
        // p._ruteGagal kalau percobaan sebelumnya gagal).
        async muatRuteUntukPengantaran(p) {
            if (!p || p.rute || p._ruteGagal) return;
            const hasil = await fetchRuteJalan(p.asal, p.tujuan);
            if (!hasil) { p._ruteGagal = true; return; }
            p.rute = hasil;
            p.jarakTotalKm = hasil.jarakKm;
            p.jarakSisaKm = Math.max(0, hasil.jarakKm * (1 - (p.progress || 0)));
            p.etaMenit = p.kecepatanKmh > 0 ? Math.round((p.jarakSisaKm / p.kecepatanKmh) * 60) : 0;
            if (p.status === 'proses') p.posisi = posisiSepanjangRute(hasil, p.progress || 0);
            this.saveCoreData();
            if (this.page === 'peta') this.renderPetaMap();
            if (this._miniMap && this.selectedOrder && p.orderNo === this.selectedOrder.no) {
                this.initMapDetailPengantaran(p);
            }
        },

        // Muat rute jalan untuk semua pengantaran yang sedang aktif (dalam
        // perjalanan / sudah tiba) sekaligus — dipanggil sekali saat aplikasi
        // pertama kali dibuka, supaya data demo & pengantaran lama (mis. dari
        // sesi sebelumnya yang tersimpan di localStorage) juga langsung
        // mengikuti jalan sungguhan, bukan cuma pengantaran yang baru dibuat.
        muatSemuaRuteAktif() {
            this.pengantaran.forEach((p) => {
                if (p.status === 'proses' || p.status === 'tiba') this.muatRuteUntukPengantaran(p);
            });
        },

        // Dipanggil berkala (lihat init()) untuk menggerakkan setiap kurir yang
        // berstatus 'proses' sedikit lebih dekat ke tujuannya, berdasarkan
        // kecepatan kurir & waktu yang benar-benar berlalu sejak update terakhir
        // (bukan sekadar hitungan tick), supaya tetap akurat walau tab
        // di-background/di-throttle oleh browser.
        tickPengantaran() {
            if (!this.pengantaran || !this.pengantaran.length) return;
            let changed = false;
            const now = Date.now();
            this.pengantaran.forEach((p) => {
                if (p.status !== 'proses') return;
                const lastTs = new Date(p.updatedAt).getTime();
                const elapsedH = Math.max(0, now - lastTs) / 3600000;
                const totalKm = p.jarakTotalKm || 0.001;
                const stepKm = p.kecepatanKmh * elapsedH;
                const progress = Math.min(1, (p.progress || 0) + stepKm / totalKm);
                p.progress = progress;

                // Kalau rute jalan sungguhan (OSRM) sudah berhasil dimuat untuk
                // pengantaran ini, posisi kurir digeser TEPAT DI ATAS bentuk
                // jalan sesuai progress — bukan interpolasi garis lurus udara.
                // Kalau rute belum/tidak tersedia, pakai garis lurus asal→tujuan
                // apa adanya sebagai cadangan (tanpa lengkungan buatan, supaya
                // tidak menyesatkan seolah sudah mengikuti jalan padahal belum).
                if (p.rute && p.rute.coords && p.rute.coords.length > 1) {
                    p.posisi = posisiSepanjangRute(p.rute, progress);
                } else {
                    p.posisi = {
                        lat: p.asal.lat + (p.tujuan.lat - p.asal.lat) * progress,
                        lng: p.asal.lng + (p.tujuan.lng - p.asal.lng) * progress,
                    };
                }

                p.jarakSisaKm = Math.max(0, totalKm * (1 - progress));
                p.etaMenit = p.kecepatanKmh > 0 ? Math.round((p.jarakSisaKm / p.kecepatanKmh) * 60) : 0;
                p.updatedAt = new Date(now).toISOString();
                changed = true;

                // Kalau peta mini di modalDetailOrder sedang menampilkan order
                // yang sama, geser marker kurirnya juga secara live — supaya
                // owner & pelanggan sama-sama melihat posisi kurir bergerak
                // real-time tanpa perlu buka halaman Peta terpisah.
                if (this._miniMap && this._miniKurirMarker && this.selectedOrder && p.orderNo === this.selectedOrder.no) {
                    this._miniKurirMarker.setLatLng([p.posisi.lat, p.posisi.lng]);
                }

                if (progress >= 1) {
                    p.status = 'tiba';
                    p.posisi = { lat: p.tujuan.lat, lng: p.tujuan.lng };
                    p.riwayat.push({ event: 'Kurir tiba di lokasi tujuan', waktu: p.updatedAt });
                    const order = this.orders.find(o => o.no === p.orderNo);
                    if (order) order.statusAntar = 'tiba';
                    this.toast('📍 ' + p.orderNo + ' telah tiba di tujuan (' + p.pelanggan + ').');
                }
            });
            if (changed) {
                this.saveCoreData();
                if (this.page === 'peta') this.renderPetaMap();
            }
        },

        konfirmasiTerima(p) {
            p.status = 'selesai';
            p.updatedAt = new Date().toISOString();
            p.riwayat.push({ event: 'Pelanggan mengonfirmasi pesanan diterima', waktu: p.updatedAt });
            const order = this.orders.find(o => o.no === p.orderNo);
            if (order) order.statusAntar = 'selesai';
            this.saveCoreData();
            this.toast('✅ ' + p.orderNo + ' ditandai selesai diterima.');
            this._boundsFitted = false;
            this.$nextTick(() => this.renderPetaMap());
        },

        async batalkanKirim(p) {
            const ok = await this.confirmSwal('Batalkan pengantaran ' + p.orderNo + '?', { title: 'Batalkan Pengantaran?', confirmText: 'Ya, Batalkan' });
            if (!ok) return;
            p.status = 'batal';
            p.updatedAt = new Date().toISOString();
            p.riwayat.push({ event: 'Pengantaran dibatalkan', waktu: p.updatedAt });
            const order = this.orders.find(o => o.no === p.orderNo);
            if (order) delete order.statusAntar;
            this.saveCoreData();
            this.toast('⚠️ Pengantaran ' + p.orderNo + ' dibatalkan.');
            this._boundsFitted = false;
            this.$nextTick(() => this.renderPetaMap());
        },

        // Fokuskan peta ke satu pengantaran tertentu; kalau dipanggil dari luar
        // halaman Peta (mis. dari modal detail order), pindah ke halaman Peta
        // dulu dan tutup modal yang sedang terbuka.
        focusPeta(p) {
            this.petaFokusId = p ? p.id : null;
            if (this.page !== 'peta') {
                try {
                    const el = document.getElementById('modalDetailOrder');
                    const inst = (window.bootstrap && el) ? bootstrap.Modal.getInstance(el) : null;
                    if (inst) inst.hide();
                } catch (e) { /* no-op */ }
                this.page = 'peta';
            } else {
                this.renderPetaMap();
            }
        },

        pilihPeta(p) {
            this.petaFokusId = p.id;
            this.renderPetaMap();
        },

        initPetaMap() {
            const container = document.getElementById('mapPengantaran');
            if (!container || typeof L === 'undefined') return;
            if (!this._map) {
                this._map = L.map(container, { zoomControl: true, attributionControl: true })
                    .setView([TOKO_LOKASI.lat, TOKO_LOKASI.lng], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    maxZoom: 19,
                    subdomains: 'abcd',
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                }).addTo(this._map);
                this._tokoIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-toko">🏭</div>', iconSize: [30, 30], iconAnchor: [15, 28] });
                this._kurirIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-kurir">🛵</div>', iconSize: [30, 30], iconAnchor: [15, 28] });
                this._tujuanIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [26, 26], iconAnchor: [13, 26] });
                L.marker([TOKO_LOKASI.lat, TOKO_LOKASI.lng], { icon: this._tokoIcon })
                    .addTo(this._map)
                    .bindPopup('<b>' + TOKO_LOKASI.label + '</b><br>Titik keberangkatan semua pengantaran');
                this._markersKurir = {};
                this._markersTujuan = {};
                this._garisRute = {};
            } else {
                setTimeout(() => this._map.invalidateSize(), 80);
            }
            this._boundsFitted = false;
            this.renderPetaMap();
        },

        renderPetaMap() {
            if (!this._map || typeof L === 'undefined') return;
            const aktif = this.pengantaranAktif;
            const idsAktif = new Set(aktif.map(p => p.id));

            // Bersihkan marker/rute milik pengantaran yang sudah tidak aktif lagi.
            Object.keys(this._markersKurir).forEach((id) => {
                if (!idsAktif.has(id)) {
                    this._map.removeLayer(this._markersKurir[id]); delete this._markersKurir[id];
                    if (this._markersTujuan[id]) { this._map.removeLayer(this._markersTujuan[id]); delete this._markersTujuan[id]; }
                    if (this._garisRute[id]) { this._map.removeLayer(this._garisRute[id]); delete this._garisRute[id]; }
                }
            });

            aktif.forEach((p) => {
                const latlng = [p.posisi.lat, p.posisi.lng];
                const viaJalan = !!(p.rute && p.rute.coords && p.rute.coords.length > 1);
                const popupHtml = '<b>' + p.orderNo + '</b><br>' + p.pelanggan + '<br>Kurir: ' + p.kurir +
                    '<br>Sisa jarak: ' + p.jarakSisaKm.toFixed(1) + ' km · ETA ' + (p.etaMenit || 0) + ' menit' +
                    '<br><span style="font-size:11px;color:#64748B;">' + (viaJalan ? 'Mengikuti rute jalan' : 'Estimasi garis lurus (rute jalan belum ditemukan)') + '</span>';
                if (!this._markersKurir[p.id]) {
                    this._markersKurir[p.id] = L.marker(latlng, { icon: this._kurirIcon }).addTo(this._map).bindPopup(popupHtml);
                    this._markersTujuan[p.id] = L.marker([p.tujuan.lat, p.tujuan.lng], { icon: this._tujuanIcon })
                        .addTo(this._map)
                        .bindPopup('<b>Tujuan</b><br>' + (p.tujuan.label || p.pelanggan));
                } else {
                    this._markersKurir[p.id].setLatLng(latlng);
                    this._markersKurir[p.id].setPopupContent(popupHtml);
                }
                // Gambar ulang garis rute setiap render — begitu rute jalan
                // sungguhan (OSRM) selesai dimuat secara async, garis putus-
                // putus lurus otomatis berganti jadi jalur jalan solid & akurat
                // tanpa perlu menunggu render/refresh berikutnya.
                if (this._garisRute[p.id]) { this._map.removeLayer(this._garisRute[p.id]); }
                if (viaJalan) {
                    this._garisRute[p.id] = L.polyline(
                        p.rute.coords.map(c => [c.lat, c.lng]),
                        { color: '#C2141A', weight: 4, opacity: 0.8, lineJoin: 'round' }
                    ).addTo(this._map);
                } else {
                    this._garisRute[p.id] = L.polyline(
                        [[p.asal.lat, p.asal.lng], [p.tujuan.lat, p.tujuan.lng]],
                        { color: '#C2141A', weight: 3, dashArray: '2 8', opacity: 0.55 }
                    ).addTo(this._map);
                }
                if (this.petaFokusId === p.id) {
                    this._map.panTo(latlng, { animate: true });
                    this._markersKurir[p.id].openPopup();
                }
            });

            if (this.petaFokusId && !idsAktif.has(this.petaFokusId)) this.petaFokusId = null;

            if (!this._boundsFitted) {
                const pts = [[TOKO_LOKASI.lat, TOKO_LOKASI.lng]]
                    .concat(aktif.map(p => [p.posisi.lat, p.posisi.lng]))
                    .concat(aktif.map(p => [p.tujuan.lat, p.tujuan.lng]));
                if (pts.length > 1) this._map.fitBounds(pts, { padding: [40, 40] });
                this._boundsFitted = true;
            }
        },

        // ============================================================
        // PETA DI MODAL DETAIL ORDER — dipakai OWNER & PELANGGAN sekaligus,
        // supaya lokasi pengantaran selalu terlihat & sinkron di kedua sisi.
        // ============================================================

        // Peta mini READ-ONLY di modalDetailOrder: menampilkan titik toko,
        // posisi kurir saat ini, dan titik tujuan untuk pengantaran yang
        // sedang berjalan/sudah tiba/sudah selesai. Dipakai baik oleh Owner
        // maupun Pelanggan — datanya sama persis (satu record `pengantaran`),
        // jadi otomatis konsisten di kedua dashboard.
        initMapDetailPengantaran(p) {
            const container = document.getElementById('mapDetailPengantaran');
            if (!container || typeof L === 'undefined' || !p) return;
            if (this._miniMap) { try { this._miniMap.remove(); } catch (e) { /* no-op */ } this._miniMap = null; this._miniKurirMarker = null; }
            this._miniMap = L.map(container, { zoomControl: false, attributionControl: false, scrollWheelZoom: false })
                .setView([p.posisi.lat, p.posisi.lng], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this._miniMap);
            L.marker([p.asal.lat, p.asal.lng], {
                icon: L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-toko">🏭</div>', iconSize: [24, 24], iconAnchor: [12, 22] }),
                interactive: false,
            }).addTo(this._miniMap);
            L.marker([p.tujuan.lat, p.tujuan.lng], {
                icon: L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [26, 26], iconAnchor: [13, 26] }),
            }).addTo(this._miniMap).bindPopup(p.tujuan.label || p.pelanggan);
            this._miniKurirMarker = L.marker([p.posisi.lat, p.posisi.lng], {
                icon: L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-kurir">🛵</div>', iconSize: [26, 26], iconAnchor: [13, 24] }),
            }).addTo(this._miniMap);
            const viaJalan = !!(p.rute && p.rute.coords && p.rute.coords.length > 1);
            let boundsPts;
            if (viaJalan) {
                L.polyline(p.rute.coords.map(c => [c.lat, c.lng]), { color: '#C2141A', weight: 4, opacity: 0.8, lineJoin: 'round' }).addTo(this._miniMap);
                boundsPts = p.rute.coords.map(c => [c.lat, c.lng]);
            } else {
                L.polyline([[p.asal.lat, p.asal.lng], [p.tujuan.lat, p.tujuan.lng]], { color: '#C2141A', weight: 3, dashArray: '2 8', opacity: 0.5 }).addTo(this._miniMap);
                boundsPts = [[p.asal.lat, p.asal.lng], [p.tujuan.lat, p.tujuan.lng], [p.posisi.lat, p.posisi.lng]];
            }
            this._miniMap.fitBounds(boundsPts, { padding: [24, 24] });
            setTimeout(() => { if (this._miniMap) this._miniMap.invalidateSize(); }, 120);
        },

        // Peta EDITABLE di modalDetailOrder khusus akun Pelanggan: memungkinkan
        // pelanggan menandai/memperbarui sendiri titik lokasi pengantarannya
        // (mis. sebelum order selesai diproduksi / sebelum owner kirim kurir).
        // Titik ini ditulis ke `customer.koordinat` — field YANG SAMA yang
        // dibaca bukaFormKirim() di sisi Owner sebagai pra-isi peta pemilihan
        // lokasi — sehingga begitu pelanggan menyimpan lokasinya di sini,
        // dashboard Owner otomatis melihat titik yang sama tanpa perlu
        // sinkronisasi tambahan (satu sumber data: this.customers).
        initLokasiPelangganMap() {
            const container = document.getElementById('mapLokasiPelanggan');
            if (!container || typeof L === 'undefined') return;
            if (this._plgMap) { try { this._plgMap.remove(); } catch (e) { /* no-op */ } this._plgMap = null; this._plgMarker = null; }
            const c = this.myCustomer;
            const sudahAda = !!(c && c.koordinat && typeof c.koordinat.lat === 'number');
            const start = sudahAda ? c.koordinat : TOKO_LOKASI;
            this._plgMap = L.map(container, { zoomControl: true, attributionControl: false })
                .setView([start.lat, start.lng], sudahAda ? 15 : 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(this._plgMap);
            L.marker([TOKO_LOKASI.lat, TOKO_LOKASI.lng], {
                icon: L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-toko">🏭</div>', iconSize: [24, 24], iconAnchor: [12, 22] }),
                interactive: false,
            }).addTo(this._plgMap);
            this._plgLokasiPending = sudahAda ? { lat: start.lat, lng: start.lng } : null;
            if (sudahAda) {
                const tujuanIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] });
                this._plgMarker = L.marker([start.lat, start.lng], { icon: tujuanIcon, draggable: true }).addTo(this._plgMap);
                this._plgMarker.on('dragend', () => {
                    const ll = this._plgMarker.getLatLng();
                    this._plgLokasiPending = { lat: ll.lat, lng: ll.lng };
                });
            }
            this._plgMap.on('click', (e) => this.setLokasiPelangganPin(e.latlng.lat, e.latlng.lng));
            setTimeout(() => { if (this._plgMap) this._plgMap.invalidateSize(); }, 120);
        },

        setLokasiPelangganPin(lat, lng) {
            this._plgLokasiPending = { lat, lng };
            if (!this._plgMap) return;
            const tujuanIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] });
            if (!this._plgMarker) {
                this._plgMarker = L.marker([lat, lng], { icon: tujuanIcon, draggable: true }).addTo(this._plgMap);
                this._plgMarker.on('dragend', () => {
                    const ll = this._plgMarker.getLatLng();
                    this._plgLokasiPending = { lat: ll.lat, lng: ll.lng };
                });
            } else {
                this._plgMarker.setLatLng([lat, lng]);
            }
            this._plgMap.panTo([lat, lng], { animate: true });
        },

        gunakanLokasiSayaPelanggan() {
            if (!navigator.geolocation) { this.toast('⚠️ Perangkat ini tidak mendukung deteksi lokasi GPS.'); return; }
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this.setLokasiPelangganPin(pos.coords.latitude, pos.coords.longitude);
                    if (this._plgMap) this._plgMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
                },
                () => { this.toast('⚠️ Gagal mengambil lokasi GPS. Tandai manual saja di peta.'); },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        },

        // Menyimpan titik yang ditandai pelanggan ke data pelanggan permanen
        // (this.customers, ikut tersimpan lewat CORE_DATA_FIELDS) — inilah
        // titik yang otomatis dipakai Owner di form "Kirim untuk Diantar".
        simpanLokasiPelanggan() {
            if (!this.myCustomer) return;
            if (!this._plgLokasiPending) { this.toast('⚠️ Tandai dulu titik lokasi Anda di peta (klik di peta).'); return; }
            this.myCustomer.koordinat = { lat: this._plgLokasiPending.lat, lng: this._plgLokasiPending.lng };
            this.saveCoreData();
            this.toast('📍 Lokasi pengantaran Anda tersimpan & akan otomatis dipakai kurir.');
        },

        // ---------- peta lokasi pengantaran di modal "Buat Order Baru" ----------
        // Sama persis polanya dengan initLokasiPelangganMap() di modalDetailOrder,
        // hanya beda container & momen tampil: di sini pelanggan menandai lokasinya
        // SEJAK AWAL saat memesan, bukan menunggu order berstatus "selesai". Titik
        // yang ditandai di sini ditulis ke customer.koordinat saat order disimpan
        // (lihat simpanOrder()) — field YANG SAMA yang dibaca otomatis oleh Owner
        // di bukaFormKirim(), jadi tidak perlu ada langkah sinkronisasi tambahan.
        initLokasiOrderBaruMap() {
            const container = document.getElementById('mapLokasiOrderBaru');
            if (!container || typeof L === 'undefined') return;
            if (this._orderBaruMap) { try { this._orderBaruMap.remove(); } catch (e) { /* no-op */ } this._orderBaruMap = null; this._orderBaruMarker = null; }
            const c = this.myCustomer;
            const sudahAda = !!(c && c.koordinat && typeof c.koordinat.lat === 'number');
            const start = sudahAda ? c.koordinat : TOKO_LOKASI;
            this._orderBaruMap = L.map(container, { zoomControl: true, attributionControl: false })
                .setView([start.lat, start.lng], sudahAda ? 15 : 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(this._orderBaruMap);
            L.marker([TOKO_LOKASI.lat, TOKO_LOKASI.lng], {
                icon: L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-toko">🏭</div>', iconSize: [24, 24], iconAnchor: [12, 22] }),
                interactive: false,
            }).addTo(this._orderBaruMap);
            this._orderBaruLokasiPending = sudahAda ? { lat: start.lat, lng: start.lng } : null;
            if (sudahAda) {
                const tujuanIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] });
                this._orderBaruMarker = L.marker([start.lat, start.lng], { icon: tujuanIcon, draggable: true }).addTo(this._orderBaruMap);
                this._orderBaruMarker.on('dragend', () => {
                    const ll = this._orderBaruMarker.getLatLng();
                    this._orderBaruLokasiPending = { lat: ll.lat, lng: ll.lng };
                });
            }
            this._orderBaruMap.on('click', (e) => this.setLokasiOrderBaruPin(e.latlng.lat, e.latlng.lng));
            setTimeout(() => { if (this._orderBaruMap) this._orderBaruMap.invalidateSize(); }, 120);
        },

        setLokasiOrderBaruPin(lat, lng) {
            this._orderBaruLokasiPending = { lat, lng };
            if (!this._orderBaruMap) return;
            const tujuanIcon = L.divIcon({ className: '', html: '<div class="peta-pin peta-pin-tujuan">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] });
            if (!this._orderBaruMarker) {
                this._orderBaruMarker = L.marker([lat, lng], { icon: tujuanIcon, draggable: true }).addTo(this._orderBaruMap);
                this._orderBaruMarker.on('dragend', () => {
                    const ll = this._orderBaruMarker.getLatLng();
                    this._orderBaruLokasiPending = { lat: ll.lat, lng: ll.lng };
                });
            } else {
                this._orderBaruMarker.setLatLng([lat, lng]);
            }
            this._orderBaruMap.panTo([lat, lng], { animate: true });
        },

        gunakanLokasiSayaOrderBaru() {
            if (!navigator.geolocation) { this.toast('⚠️ Perangkat ini tidak mendukung deteksi lokasi GPS.'); return; }
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this.setLokasiOrderBaruPin(pos.coords.latitude, pos.coords.longitude);
                    if (this._orderBaruMap) this._orderBaruMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
                },
                () => { this.toast('⚠️ Gagal mengambil lokasi GPS. Tandai manual saja di peta.'); },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        },

        viewOrder(o) {
            this.selectedOrder = o;
            this.kirimPanelOpen = false;
            this.kirimError = '';
            this._plgLokasiPending = null;
            // Bersihkan peta modal sebelumnya (kalau ada) supaya tidak
            // menumpuk saat berpindah-pindah antar order.
            if (this._miniMap) { try { this._miniMap.remove(); } catch (e) { /* no-op */ } this._miniMap = null; this._miniKurirMarker = null; }
            if (this._plgMap) { try { this._plgMap.remove(); } catch (e) { /* no-op */ } this._plgMap = null; this._plgMarker = null; }
            this.$nextTick(() => {
                const p = this.pengantaranForOrder(o.no);
                if (p && p.status !== 'batal') {
                    // Ada pengantaran aktif/selesai untuk order ini → tampilkan
                    // peta pelacakan read-only (berlaku utk Owner & Pelanggan).
                    this.initMapDetailPengantaran(p);
                } else if (this.loginRole === 'Pelanggan') {
                    // Belum ada pengantaran → beri pelanggan kesempatan
                    // menandai/menyiapkan lokasi pengantarannya lebih awal.
                    this.initLokasiPelangganMap();
                }
            });
        },
        viewCustomer(c) { this.selectedCustomer = c; },
        viewDesign(d) { this.selectedDesign = d; },


        init() {
            // Simpan salinan data demo bawaan (sebelum ditimpa oleh data tersimpan)
            // sebagai "factory default" — dipakai oleh tombol Reset Data.
            this._factoryData = CORE_DATA_FIELDS.reduce((acc, key) => {
                acc[key] = JSON.parse(JSON.stringify(this[key]));
                return acc;
            }, {});
            // Muat data operasional yang sudah pernah disimpan pengguna (jika ada)
            // sehingga setiap perubahan pada dashboard bersifat permanen walau
            // halaman di-refresh atau browser ditutup.
            this.loadCoreData();

            // Urutan penting: pulihkan dulu sesi terakhir yang tersimpan (supaya
            // refresh halaman tetap login sebagai peran yang sama — baik Owner
            // maupun Pelanggan), BARU proses kalau ada login/daftar baru yang
            // "dititipkan" dari index.html (yang akan menimpa sesi lama jika ada).
            this.loadSession();
            this.applyAuthPrefill();
            this.saveSession();
            this.loadLandingSettings();
            try {
                const savedAvatar = localStorage.getItem('kugiyaiUserAvatar');
                if (savedAvatar) this.loginUserAvatar = savedAvatar;
            } catch (e) { /* no-op */ }

            // Simpan ulang sesi setiap kali identitas login berubah (login baru,
            // ganti peran demo, atau ganti nama profil) supaya tetap konsisten
            // setelah refresh.
            this.$watch('loginRole', () => this.saveSession());
            this.$watch('loginUserName', () => this.saveSession());
            this.$watch('loginCustomerId', () => this.saveSession());

            // ---------- Sinkronisasi real-time lintas tab/jendela ----------
            // Karena data operasional & sesi disimpan di localStorage, event
            // 'storage' otomatis terpicu di tab/jendela LAIN setiap kali tab ini
            // menyimpan perubahan (mis. pelanggan membayar tagihan di satu tab,
            // owner memantau di tab lain). Kita dengarkan event itu untuk memuat
            // ulang data terbaru sehingga kedua sisi (dashboard owner & pelanggan)
            // selalu konsisten & sinkron tanpa perlu refresh manual.
            window.addEventListener('storage', (e) => {
                if (!e.key) return;
                if (e.key === CORE_DATA_KEY) {
                    this.loadCoreData();
                    this.$nextTick(() => this.renderCharts());
                } else if (e.key === CMS_KEY || e.key === CMS_SYNC_KEY) {
                    this.loadLandingSettings();
                }
            });

            // Accessibility: prevent aria-hidden focus blocking when any modal hides
            document.addEventListener('hide.bs.modal', (e) => {
                if (document.activeElement && e.target && e.target.contains(document.activeElement)) {
                    if (typeof document.activeElement.blur === 'function') {
                        document.activeElement.blur();
                    }
                }
                // Hancurkan instance peta di dalam modalDetailOrder setiap kali
                // modal ini ditutup, supaya Leaflet tidak di-init dobel di atas
                // container yang sama saat modal dibuka lagi utk order lain.
                if (e.target && e.target.id === 'modalDetailOrder') {
                    if (this._miniMap) { try { this._miniMap.remove(); } catch (err) { /* no-op */ } this._miniMap = null; this._miniKurirMarker = null; }
                    if (this._plgMap) { try { this._plgMap.remove(); } catch (err) { /* no-op */ } this._plgMap = null; this._plgMarker = null; }
                    if (this._pickerMap) { try { this._pickerMap.remove(); } catch (err) { /* no-op */ } this._pickerMap = null; this._pickerMarker = null; }
                    this.kirimPanelOpen = false;
                }
                // Bersihkan juga peta lokasi di modal "Buat Order Baru" setiap
                // kali modal itu ditutup (Batal, klik luar, atau setelah order
                // berhasil disimpan) supaya Leaflet tidak di-init dobel di atas
                // container yang sama saat modal dibuka lagi.
                if (e.target && e.target.id === 'modalOrderBaru') {
                    if (this._orderBaruMap) { try { this._orderBaruMap.remove(); } catch (err) { /* no-op */ } this._orderBaruMap = null; this._orderBaruMarker = null; }
                }
            });

            // Inisialisasi peta lokasi pengantaran begitu modal "Buat Order
            // Baru" selesai tampil (baru bisa diukur/di-render setelah modal
            // benar-benar terlihat) — khusus akun Pelanggan, karena Owner/staff
            // memilih pelanggan dari dropdown tanpa perlu menandai lokasi di sini.
            document.addEventListener('shown.bs.modal', (e) => {
                if (e.target && e.target.id === 'modalOrderBaru' && this.loginRole === 'Pelanggan') {
                    this.$nextTick(() => this.initLokasiOrderBaruMap());
                }
            });

            this.$watch('page', () => setTimeout(() => this.renderCharts(), 120));
            this.$watch('page', (v) => { if (v === 'peta') this.$nextTick(() => this.initPetaMap()); });
            this.$watch('loginRole', () => { this.page = 'dashboard'; });
            this.$watch('revenueRange', () => this.renderCharts());
            this.$watch('reportPeriod', () => this.renderCharts());
            // Re-render on viewport changes (sidebar collapse, orientation change, etc.)
            let resizeTimer = null;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => { this.renderCharts(); if (this._map) this._map.invalidateSize(); }, 200);
            });
            setTimeout(() => this.renderCharts(), 150);

            // ---------- Real-time: jam relatif ("X detik lalu") & simulasi GPS kurir ----------
            // Jam relatif: memaksa Alpine menghitung ulang label waktu tiap detik
            // walau timestamp sumbernya statis (lihat method relatif()).
            this._clockTimer = setInterval(() => { this.clockTick++; }, 1000);
            // Simulasi pergerakan kurir: setiap 3 detik semua pengantaran yang
            // berstatus 'proses' bergerak sedikit lebih dekat ke tujuannya.
            this.tickPengantaran();
            this._pengantaranTimer = setInterval(() => this.tickPengantaran(), 3000);
            // Muat rute jalan sungguhan (OSRM) untuk seluruh pengantaran yang
            // sudah aktif sejak awal (data demo, atau data lama dari sesi
            // sebelumnya) supaya peta langsung menampilkan jalur jalan yang
            // sesungguhnya, bukan garis lurus, begitu halaman dibuka.
            this.muatSemuaRuteAktif();
        },

        // ============================================================
        // PENYIMPANAN PERMANEN (localStorage) — Data Operasional
        // ============================================================
        // Semua data transaksional (pelanggan, order, desain, pembayaran,
        // stok, user) disimpan dalam satu objek JSON di localStorage supaya
        // setiap perubahan yang dibuat di dashboard tetap ada walau halaman
        // di-refresh, tab ditutup, atau browser dimatikan.
        loadCoreData() {
            try {
                const raw = localStorage.getItem(CORE_DATA_KEY);
                if (!raw) return; // instalasi baru → tetap pakai data demo bawaan
                const saved = JSON.parse(raw);
                if (!saved || typeof saved !== 'object') return;
                CORE_DATA_FIELDS.forEach((key) => {
                    if (Array.isArray(saved[key])) this[key] = saved[key];
                });
                console.info('[CETAK.OS] Data operasional tersimpan berhasil dimuat dari localStorage.');
            } catch (e) {
                console.error('[CETAK.OS] Gagal memuat data tersimpan, memakai data demo bawaan.', e);
            }
        },

        saveCoreData() {
            try {
                const payload = {};
                CORE_DATA_FIELDS.forEach((key) => { payload[key] = this[key]; });
                payload.savedAt = new Date().toISOString();
                localStorage.setItem(CORE_DATA_KEY, JSON.stringify(payload));
            } catch (e) {
                console.error('[CETAK.OS] Gagal menyimpan data (localStorage penuh/tidak tersedia).', e);
                const isQuotaError = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
                // Pemulihan otomatis: kalau penyebabnya kuota penuh (biasanya gara-gara
                // gambar desain/avatar/banner yang kadung besar — termasuk data lama dari
                // sebelum kompresi otomatis ada), coba padatkan ulang semua gambar yang
                // tersimpan lalu simpan ulang SEKALI. Tanpa ini, satu kegagalan kuota akan
                // membuat SEMUA aksi berikutnya (order, bayar, dll) ikut gagal tersimpan
                // secara diam-diam sampai halaman di-refresh — dan sinkronisasi real-time
                // ke dashboard lain pun ikut putus karena localStorage tidak pernah
                // benar-benar ter-update.
                if (isQuotaError && !this._recoveringQuota) {
                    this._recoveringQuota = true;
                    this.toast('⚠️ Penyimpanan penuh — memadatkan gambar tersimpan secara otomatis...');
                    this._shrinkStoredImagesIfNeeded()
                        .catch((err) => { console.error('[CETAK.OS] Gagal memadatkan gambar otomatis:', err); return false; })
                        .then((changed) => {
                            this._recoveringQuota = false;
                            try {
                                const payload = {};
                                CORE_DATA_FIELDS.forEach((key) => { payload[key] = this[key]; });
                                payload.savedAt = new Date().toISOString();
                                localStorage.setItem(CORE_DATA_KEY, JSON.stringify(payload));
                                this.toast(changed ? '✅ Gambar dipadatkan otomatis, data berhasil tersimpan.' : '✅ Data berhasil tersimpan.');
                            } catch (e2) {
                                console.error('[CETAK.OS] Masih gagal menyimpan setelah pemadatan otomatis.', e2);
                                this.toast('⚠️ Penyimpanan browser masih penuh. Hapus beberapa foto desain/galeri lama lalu coba lagi.');
                            }
                        });
                } else if (!isQuotaError) {
                    this.toast('⚠️ Perubahan belum tersimpan permanen — penyimpanan browser penuh/diblokir.');
                }
            }
        },

        // Menyisir SEMUA gambar base64 yang mungkin kegedean di seluruh data
        // operasional (saat ini: pratinjau desain — avatar & landing sudah punya
        // rutin serupa sendiri) dan mengompresnya ulang di tempat. Dipakai sebagai
        // pemulihan otomatis saat localStorage penuh (lihat saveCoreData()).
        async _shrinkStoredImagesIfNeeded() {
            const TARGET = 220 * 1024;
            let changed = false;
            for (const d of this.designs) {
                if (typeof d.gambar === 'string' && d.gambar.startsWith('data:image') && this._approxDataUrlBytes(d.gambar) > TARGET) {
                    try {
                        d.gambar = await this._recompressDataUrl(d.gambar, { maxWidth: 1000, maxHeight: 1000, targetBytes: TARGET });
                        changed = true;
                    } catch (e) {
                        console.error('[CETAK.OS] Gagal mengompres ulang gambar desain ' + d.orderNo + ':', e);
                    }
                }
            }
            return changed;
        },

        async resetSemuaData() {
            const ok = await this.confirmSwal('Kembalikan SEMUA data operasional (pelanggan, order, desain, pembayaran, stok, user) ke data demo awal? Perubahan yang sudah tersimpan akan hilang.', { title: 'Reset Semua Data?', confirmText: 'Ya, Reset Semua', icon: 'error' });
            if (!ok) return;
            if (!this._factoryData) return;
            CORE_DATA_FIELDS.forEach((key) => {
                this[key] = JSON.parse(JSON.stringify(this._factoryData[key]));
            });
            try { localStorage.removeItem(CORE_DATA_KEY); } catch (e) { /* no-op */ }
            this.toast('🔄 Semua data operasional dikembalikan ke kondisi demo awal.');
            this.$nextTick(() => this.renderCharts());
        },

        // ============================================================
        // LANDING PAGE CMS — State & CRUD
        // ============================================================
        landingTab: 'umum',          // tab aktif: umum | galeri | testimoni | layanan

        // --- default data (juga dipakai saat reset) ---
        _defaultLanding() {
            return {
                // Umum
                promoAktif: true,
                promoPesan: '🎉 PROMO KHUSUS: Diskon 10% untuk pesanan Baliho Flexi di atas 30 m²! Hubungi WhatsApp kami sekarang.',
                heroEyebrow: 'Percetakan Digital · Waghete, Deiyai',
                heroJudul: 'Baliho &amp; spanduk<br>tercetak <em>tajam,</em><br>terkirim cepat.',
                heroLead: 'Dari desain sampai pasang di lokasi — KugiyaiTobe melayani cetak baliho flexi, spanduk vinyl, banner roll up, dan stiker untuk instansi, gereja, koperasi, dan usaha di seluruh Papua Tengah.',
                ctaJudul: 'Butuh baliho terpasang minggu ini?',
                ctaLead: 'Kirim ukuran dan bahan yang Anda mau lewat WhatsApp — tim kami balas dalam hitungan menit di jam kerja.',
                // Hero Visual / Banner Preview (slideshow — bisa lebih dari 1 foto)
                heroBannerGaleri: [
                    'asset/img/banner-ticket/ticket-1.jpeg',
                    'asset/img/banner-ticket/ticket-6.jpeg',
                    'asset/img/banner-ticket/ticket-4.jpg',
                ],
                heroBannerInterval: 3.5, // detik antar-slide
                // heroBannerGambar dipertahankan (deprecated) hanya utk kompatibilitas data lama
                heroBannerGambar: 'asset/img/banner-ticket/ticket-1.jpeg',
                heroBannerTag: 'JOB #0150 · IN PRODUCTION',
                heroBannerJudul: 'TOKO SINAR BALIHO',
                heroBannerSub: 'Grand Opening · Waghete',
                heroMetaUkuran: '3 × 4 m',
                heroMetaBahan: 'Flexi China 280gsm',
                heroMetaFinishing: 'Mata Ayam',
                heroMetaEstimasi: '2 hari kerja',
                // Kontak
                waNumber: '6281240902277',
                whatsappPesan: 'Halo KugiyaiTobe, saya ingin pesan cetak',
                // Harga
                hargaBaliho: 25000,
                hargaSpanduk: 35000,
                hargaStiker: 15000,
                hargaRollup: 390000,
                // Statistik
                statBaliho: 500,
                statInstansi: 50,
                statHariProduksi: 2,
                statTahun: 6,
                // Galeri (portfolio)
                galeri: [
                    { id: 1, nama: 'Toko Sinar Baliho', jenis: 'BALIHO FLEXI · 3×4M', gambar: 'asset/img/gallery/gallery-1.jpeg', warna: 'linear-gradient(155deg,#FF6B2C,#E5551A)' },
                    { id: 2, nama: 'GKI Immanuel', jenis: 'SPANDUK UCAPAN · 1×2M', gambar: 'asset/img/gallery/gallery-2.jpeg', warna: 'linear-gradient(155deg,#0F6E6E,#0B5555)' },
                    { id: 3, nama: 'Dinas Pariwisata', jenis: 'BANNER ROLL UP · PAMERAN', gambar: 'asset/img/gallery/gallery-3.png', warna: 'linear-gradient(155deg,#7C5CFC,#5B3FE0)' },
                    { id: 4, nama: 'Koperasi Cendrawasih Maju', jenis: 'BALIHO FLEXI · 2×3M', gambar: 'asset/img/gallery/gallery-4.png', warna: 'linear-gradient(155deg,#F4A100,#C97F00)' },
                    { id: 5, nama: 'CV Papua Digital Print', jenis: 'STIKER KEMASAN · CUTTING', gambar: 'asset/img/gallery/gallery-5.jpeg', warna: 'linear-gradient(155deg,#2A9D6B,#1F7A53)' },
                    { id: 6, nama: 'Event Sentani', jenis: 'BALIHO FLEXI · 3×4M', gambar: 'asset/img/gallery/gallery-6.jpeg', warna: 'linear-gradient(155deg,#E63946,#B91C2B)' },
                ],
                // Testimoni
                testimoni: [
                    { id: 1, nama: 'Yustus Wanma', instansi: 'Toko Sinar Baliho', kutipan: 'Pesan baliho toko, sehari sebelum grand opening masih sempat direvisi warnanya. Hasilnya tajam dan tepat waktu.', inisial: 'YW', warna: '#FF6B2C' },
                    { id: 2, nama: 'Maria Ayamiseba', instansi: 'Koperasi Cendrawasih Maju', kutipan: 'Sudah tiga kali cetak spanduk koperasi di sini. Bahannya awet, tidak cepat pudar meski kena hujan.', inisial: 'MA', warna: '#0F6E6E' },
                    { id: 3, nama: 'Selvi Mansawan', instansi: 'Dinas Pariwisata Kab. Jayapura', kutipan: 'Butuh baliho pameran mendadak, tim KugiyaiTobe bantu desain dan cetak dalam dua hari.', inisial: 'SM', warna: '#7C5CFC' },
                ],
                // Layanan
                layanan: [
                    { id: 1, nama: 'Baliho Flexi', deskripsi: 'Baliho outdoor tahan cuaca untuk promosi, instansi, dan acara — ukuran custom sesuai lokasi pasang.', hargaLabel: 'MULAI RP 25.000 / M²', iconBg: 'var(--primary-light)', iconColor: 'var(--primary-dark)' },
                    { id: 2, nama: 'Spanduk Vinyl', deskripsi: 'Spanduk ucapan, event, dan promosi toko — proses cepat, cocok untuk kebutuhan mendadak.', hargaLabel: 'MULAI RP 35.000 / M²', iconBg: '#DFF3F1', iconColor: '#0F6E6E' },
                    { id: 3, nama: 'Banner Roll Up', deskripsi: 'Banner pameran & booth lengkap dengan standing frame — siap pasang begitu diterima.', hargaLabel: 'MULAI RP 390.000 / UNIT', iconBg: '#EBE6FE', iconColor: '#7C5CFC' },
                    { id: 4, nama: 'Stiker & Vinyl Cutting', deskripsi: 'Stiker label produk, cutting sticker bentuk custom, dan laminasi doff/glossy.', hargaLabel: 'MULAI RP 15.000 / LEMBAR', iconBg: '#DDF2E7', iconColor: '#2A9D6B' },
                    { id: 5, nama: 'Neon Box & Signage', deskripsi: 'Papan nama toko dan instansi dengan pencahayaan LED — desain menyesuaikan identitas Anda.', hargaLabel: 'KONSULTASI GRATIS', iconBg: '#FDF0D6', iconColor: '#F4A100' },
                    { id: 6, nama: 'Desain Grafis', deskripsi: 'Tim desain bantu dari nol sampai final — revisi berjalan sampai Anda benar-benar setuju.', hargaLabel: 'TERMASUK DI SETIAP ORDER', iconBg: '#FBE0E2', iconColor: '#E63946' },
                ],
            };
        },

        landingSettings: null, // diisi oleh loadLandingSettings() di init()
        galeriSearch: '',
        galeriCategoryFilter: 'Semua',
        galeriViewMode: 'grid',

        get filteredGaleri() {
            if (!this.landingSettings || !Array.isArray(this.landingSettings.galeri)) return [];
            let list = this.landingSettings.galeri;
            if (this.galeriCategoryFilter && this.galeriCategoryFilter !== 'Semua') {
                const cat = this.galeriCategoryFilter.toLowerCase();
                list = list.filter(g => (g.jenis && g.jenis.toLowerCase().includes(cat)) || (g.nama && g.nama.toLowerCase().includes(cat)));
            }
            if (this.galeriSearch && this.galeriSearch.trim()) {
                const q = this.galeriSearch.trim().toLowerCase();
                list = list.filter(g => (g.nama && g.nama.toLowerCase().includes(q)) || (g.jenis && g.jenis.toLowerCase().includes(q)));
            }
            return list;
        },

        heroBannerPresets: [
            { label: 'Toko Sinar Baliho', url: 'asset/img/banner-ticket/ticket-1.jpeg' },
            { label: 'Event Sentani', url: 'asset/img/banner-ticket/ticket-6.jpeg' },
            { label: 'Spanduk Koperasi', url: 'asset/img/banner-ticket/ticket-4.jpg' },
            { label: 'Gereja Immanuel', url: 'asset/img/banner-ticket/ticket-2.jpg' },
            { label: 'Dinas Pariwisata', url: 'asset/img/banner-ticket/ticket-3.jpeg' },
        ],

        heroBannerMax: 6, // batas jumlah slide di banner preview

        // =====================================================================
        // KOMPRESI GAMBAR (dipakai konsisten oleh SEMUA upload foto: Banner
        // Preview, Galeri Portofolio, Avatar) — dan juga dipakai untuk
        // "menyembuhkan" foto lama yang sudah kadung tersimpan kegedean.
        //
        // Kenapa ini perlu: localStorage per-origin biasanya dibatasi ~5-10MB
        // TOTAL, dipakai bersama kugiyaiCoreData_v1, kugiyaiLandingSettings,
        // kugiyaiUserAvatar. Foto kamera/HP modern (3-8MB) yang disimpan mentah
        // sebagai base64 sangat mudah melampaui itu → saveLandingSettings()
        // gagal dengan QuotaExceededError. Karena itu setiap gambar di-encode
        // ULANG sampai berada di bawah target ukuran (targetBytes), bukan
        // sekadar dikompres sekali dengan kualitas tetap (yang bisa saja masih
        // kegedean untuk foto beresolusi sangat tinggi).
        // =====================================================================

        // Estimasi ukuran byte dari string data-URL/base64 (base64 ≈ 4/3 dari data asli).
        _approxDataUrlBytes(str) {
            if (typeof str !== 'string') return 0;
            const commaIdx = str.indexOf(',');
            const b64 = commaIdx !== -1 ? str.slice(commaIdx + 1) : str;
            return Math.round((b64.length * 3) / 4);
        },

        // Gambar (elemen <img> yang sudah termuat) → data-URL, diperkecil & dikompres
        // bertahap (turunkan kualitas, lalu turunkan resolusi jika perlu) sampai
        // ukurannya berada di bawah targetBytes atau mentok di batas minimum.
        _encodeImageAdaptive(img, mime, { maxWidth = 1280, maxHeight = 900, targetBytes = 220 * 1024, minQuality = 0.35 } = {}) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let width = Math.max(1, img.width || 1);
            let height = Math.max(1, img.height || 1);
            const ratio = Math.min(1, maxWidth / width, maxHeight / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));

            const draw = (w, h) => {
                canvas.width = w;
                canvas.height = h;
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
            };

            // PNG tidak punya parameter "quality" — satu-satunya cara memperkecil
            // adalah menurunkan resolusi bertahap. Dipertahankan sebagai PNG supaya
            // transparansi tidak hilang.
            if (mime === 'image/png') {
                draw(width, height);
                let out = canvas.toDataURL('image/png');
                let w = width, h = height, guard = 0;
                while (this._approxDataUrlBytes(out) > targetBytes && w > 240 && h > 240 && guard < 8) {
                    w = Math.round(w * 0.8);
                    h = Math.round(h * 0.8);
                    draw(w, h);
                    out = canvas.toDataURL('image/png');
                    guard++;
                }
                return out;
            }

            // JPEG: turunkan kualitas dulu (langkah termurah), baru turunkan resolusi
            // jika kualitas minimum masih belum cukup mengecilkan file.
            draw(width, height);
            let quality = 0.82;
            let out = canvas.toDataURL('image/jpeg', quality);
            while (this._approxDataUrlBytes(out) > targetBytes && quality > minQuality) {
                quality -= 0.1;
                out = canvas.toDataURL('image/jpeg', quality);
            }
            let guard = 0;
            while (this._approxDataUrlBytes(out) > targetBytes && (width > 320 && height > 320) && guard < 6) {
                width = Math.round(width * 0.75);
                height = Math.round(height * 0.75);
                draw(width, height);
                quality = 0.7;
                out = canvas.toDataURL('image/jpeg', quality);
                while (this._approxDataUrlBytes(out) > targetBytes && quality > minQuality) {
                    quality -= 0.1;
                    out = canvas.toDataURL('image/jpeg', quality);
                }
                guard++;
            }
            return out;
        },

        // File upload (input type="file") → data-URL terkompresi.
        _compressImageFile(file, opts = {}) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('Gagal membaca file.'));
                reader.onload = (e) => {
                    const img = new Image();
                    img.onerror = () => reject(new Error('Gagal memuat gambar.'));
                    img.onload = () => {
                        try {
                            const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                            resolve(this._encodeImageAdaptive(img, mime, opts));
                        } catch (err) {
                            reject(err);
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        },

        // Data-URL yang SUDAH tersimpan (mis. dari data lama sebelum ada kompresi)
        // → dikompres ulang jika masih kegedean. Tidak butuh file asli lagi.
        _recompressDataUrl(dataUrl, opts = {}) {
            return new Promise((resolve, reject) => {
                if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
                    resolve(dataUrl);
                    return;
                }
                const img = new Image();
                img.onerror = () => reject(new Error('Gagal memuat gambar tersimpan.'));
                img.onload = () => {
                    try {
                        const mime = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                        resolve(this._encodeImageAdaptive(img, mime, opts));
                    } catch (err) {
                        reject(err);
                    }
                };
                img.src = dataUrl;
            });
        },

        // Migrasi/"penyembuhan" mandiri: sisir semua gambar yang sudah tersimpan
        // di landingSettings (Banner Preview + Galeri Portofolio) dan kompres
        // ulang yang masih di atas ambang batas. Ini menangani data LAMA yang
        // sempat tersimpan mentah/kegedean sebelum perbaikan ini ada — supaya
        // sekadar membuka & menyimpan ulang (tanpa upload foto baru sama sekali)
        // pun tidak lagi gagal karena kuota.
        async _shrinkLandingImagesIfNeeded() {
            if (!this.landingSettings) return false;
            const HERO_TARGET = 220 * 1024;
            const GALERI_TARGET = 260 * 1024;
            let changed = false;

            if (Array.isArray(this.landingSettings.heroBannerGaleri)) {
                for (let i = 0; i < this.landingSettings.heroBannerGaleri.length; i++) {
                    const src = this.landingSettings.heroBannerGaleri[i];
                    if (typeof src === 'string' && src.startsWith('data:image') && this._approxDataUrlBytes(src) > HERO_TARGET) {
                        try {
                            this.landingSettings.heroBannerGaleri[i] = await this._recompressDataUrl(src, { maxWidth: 1000, maxHeight: 720, targetBytes: HERO_TARGET });
                            changed = true;
                        } catch (e) {
                            console.error('[CETAK.OS] Gagal mengompres ulang foto Banner Preview lama:', e);
                        }
                    }
                }
                if (changed) this._syncHeroBannerGambar();
            }

            if (Array.isArray(this.landingSettings.galeri)) {
                for (const item of this.landingSettings.galeri) {
                    if (item && typeof item.gambar === 'string' && item.gambar.startsWith('data:image') && this._approxDataUrlBytes(item.gambar) > GALERI_TARGET) {
                        try {
                            item.gambar = await this._recompressDataUrl(item.gambar, { maxWidth: 1000, maxHeight: 1000, targetBytes: GALERI_TARGET });
                            changed = true;
                        } catch (e) {
                            console.error('[CETAK.OS] Gagal mengompres ulang foto Galeri lama:', e);
                        }
                    }
                }
            }

            return changed;
        },

        async handleHeroBannerUpload(event) {
            const files = event.target.files ? Array.from(event.target.files) : [];
            event.target.value = '';
            if (!files.length) return;
            if (!this.landingSettings) this.landingSettings = this._defaultLanding();
            if (!Array.isArray(this.landingSettings.heroBannerGaleri)) this.landingSettings.heroBannerGaleri = [];

            const sisaSlot = this.heroBannerMax - this.landingSettings.heroBannerGaleri.length;
            if (sisaSlot <= 0) {
                this.toast(`⚠️ Maksimal ${this.heroBannerMax} foto slide di Banner Preview.`);
                return;
            }

            const dipakai = files.slice(0, sisaSlot);
            if (files.length > dipakai.length) {
                this.toast(`⚠️ Hanya ${dipakai.length} foto ditambahkan (batas ${this.heroBannerMax} slide).`);
            }

            let sukses = 0;
            for (const file of dipakai) {
                if (!file.type || !file.type.startsWith('image/')) {
                    this.toast(`⚠️ "${file.name}" dilewati (bukan file gambar).`);
                    continue;
                }
                if (file.size > 2.5 * 1024 * 1024) {
                    this.toast(`⚠️ "${file.name}" dilewati (maks. 2.5MB).`);
                    continue;
                }
                try {
                    // Resize + kompres dulu supaya tidak membengkakkan localStorage
                    // dan menyebabkan "gagal menyimpan" saat klik Simpan & Terapkan.
                    const compressed = await this._compressImageFile(file, { maxWidth: 1000, maxHeight: 720, targetBytes: 220 * 1024 });
                    this.landingSettings.heroBannerGaleri.push(compressed);
                    this._syncHeroBannerGambar();
                    sukses++;
                } catch (err) {
                    console.error('[CETAK.OS] Gagal memproses foto Banner Preview:', err);
                    this.toast(`⚠️ Gagal memproses "${file.name}".`);
                }
            }
            if (sukses > 0) {
                this.toast(`📷 ${sukses} foto ditambahkan ke Banner Preview. Klik "Simpan & Terapkan" untuk menyimpan.`);
            }
        },


        // Tambah/hapus foto preset langsung dari grid preset (klik = toggle)
        toggleHeroBannerPreset(url) {
            if (!this.landingSettings) this.landingSettings = this._defaultLanding();
            if (!Array.isArray(this.landingSettings.heroBannerGaleri)) this.landingSettings.heroBannerGaleri = [];
            const galeri = this.landingSettings.heroBannerGaleri;
            const idx = galeri.indexOf(url);
            if (idx !== -1) {
                if (galeri.length <= 1) {
                    this.toast('⚠️ Minimal 1 foto harus ada di Banner Preview.');
                    return;
                }
                galeri.splice(idx, 1);
            } else {
                if (galeri.length >= this.heroBannerMax) {
                    this.toast(`⚠️ Maksimal ${this.heroBannerMax} foto slide.`);
                    return;
                }
                galeri.push(url);
            }
            this._syncHeroBannerGambar();
        },

        removeHeroBannerSlide(index) {
            if (!this.landingSettings || !Array.isArray(this.landingSettings.heroBannerGaleri)) return;
            if (this.landingSettings.heroBannerGaleri.length <= 1) {
                this.toast('⚠️ Minimal 1 foto harus ada di Banner Preview.');
                return;
            }
            this.landingSettings.heroBannerGaleri.splice(index, 1);
            this._syncHeroBannerGambar();
        },

        moveHeroBannerSlide(index, dir) {
            if (!this.landingSettings || !Array.isArray(this.landingSettings.heroBannerGaleri)) return;
            const galeri = this.landingSettings.heroBannerGaleri;
            const target = index + dir;
            if (target < 0 || target >= galeri.length) return;
            [galeri[index], galeri[target]] = [galeri[target], galeri[index]];
            this._syncHeroBannerGambar();
        },

        // heroBannerGambar disimpan tetap sinkron (= slide pertama) untuk kompatibilitas mundur
        _syncHeroBannerGambar() {
            if (this.landingSettings && Array.isArray(this.landingSettings.heroBannerGaleri)) {
                this.landingSettings.heroBannerGambar = this.landingSettings.heroBannerGaleri[0] || '';
            }
        },

        loadLandingSettings() {
            const defaults = this._defaultLanding();
            try {
                const raw = localStorage.getItem(CMS_KEY);
                if (raw) {
                    // Sanitasi otomatis data lama tersimpan: ubah ticket-4.jpeg -> ticket-4.jpg
                    const rawClean = raw.replace(/ticket-4\.jpeg/g, 'ticket-4.jpg');
                    const saved = JSON.parse(rawClean);
                    // Backfill heroBannerGambar jika dari penyimpanan lama belum ada
                    if (!saved.heroBannerGambar) saved.heroBannerGambar = defaults.heroBannerGambar;
                    // Backfill heroBannerGaleri: data lama cuma punya 1 foto (heroBannerGambar) → jadikan array
                    if (!Array.isArray(saved.heroBannerGaleri) || saved.heroBannerGaleri.length === 0) {
                        saved.heroBannerGaleri = saved.heroBannerGambar ? [saved.heroBannerGambar] : defaults.heroBannerGaleri;
                    }
                    if (!saved.heroBannerInterval) saved.heroBannerInterval = defaults.heroBannerInterval;
                    if (!saved.heroBannerJudul) saved.heroBannerJudul = defaults.heroBannerJudul;
                    if (!saved.heroBannerSub) saved.heroBannerSub = defaults.heroBannerSub;
                    if (!saved.heroBannerTag) saved.heroBannerTag = defaults.heroBannerTag;
                    if (!saved.heroMetaUkuran) saved.heroMetaUkuran = defaults.heroMetaUkuran;
                    if (!saved.heroMetaBahan) saved.heroMetaBahan = defaults.heroMetaBahan;
                    if (!saved.heroMetaFinishing) saved.heroMetaFinishing = defaults.heroMetaFinishing;
                    if (!saved.heroMetaEstimasi) saved.heroMetaEstimasi = defaults.heroMetaEstimasi;

                    // Backfill gambar pada item galeri jika dari penyimpanan lama belum ada gambar
                    if (Array.isArray(saved.galeri)) {
                        saved.galeri = saved.galeri.map(g => {
                            if (!g.gambar) {
                                const match = defaults.galeri.find(d => d.id === g.id || d.nama === g.nama);
                                if (match && match.gambar) g.gambar = match.gambar;
                            }
                            return g;
                        });
                    }
                    // Deep-merge: primitives overwrite, arrays fully replace if present
                    this.landingSettings = Object.assign({}, defaults, canonicalLandingImages(saved, defaults));
                } else {
                    // Belum pernah disimpan sama sekali (mis. instalasi baru / localStorage
                    // baru dibersihkan) — simpan nilai default secara diam-diam supaya
                    // index.html langsung konsisten (mis. slideshow Banner Preview tampil)
                    // tanpa mengharuskan Owner/Admin membuka & menyimpan pengaturan dulu.
                    this.landingSettings = defaults;
                    this.saveLandingSettings(true);
                }
            } catch (e) {
                this.landingSettings = defaults;
            }

            // Penyembuhan latar belakang: jika ada foto lama yang sudah kegedean
            // (tersimpan sebelum ada kompresi, atau dari sesi yang gagal tersimpan
            // sebagian), kompres ulang & simpan diam-diam sekarang — supaya tombol
            // "Simpan & Terapkan" berikutnya tidak langsung gagal karena kuota
            // sudah kepenuhan duluan oleh data lama.
            this._shrinkLandingImagesIfNeeded().then((changed) => {
                if (changed) this.saveLandingSettings(true);
            }).catch((e) => console.error('[CETAK.OS] Gagal menyisir foto landing lama:', e));
        },

        async saveLandingSettings(silent) {
            const isQuotaErr = (e) => e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
            const trySave = () => {
                localStorage.setItem(CMS_KEY, JSON.stringify(this.landingSettings));
                // Tandai waktu simpan supaya tab index.html lain (jika sedang terbuka)
                // bisa mendeteksi ada perubahan baru dan menerapkannya langsung,
                // termasuk saat isi objek berubah tapi ukuran string persis sama
                // (window 'storage' event tetap terpicu dari perubahan value ini).
                localStorage.setItem(CMS_SYNC_KEY, String(Date.now()));
            };

            try {
                // Sebelum menyimpan: sisir & kompres ulang gambar yang sudah tersimpan
                // tapi masih kegedean (mis. dari sebelum perbaikan kompresi ada, atau
                // preset/upload lama). Ini "menyembuhkan" data lama secara otomatis
                // supaya Simpan tidak terus gagal walau tidak ada upload foto baru.
                const dibersihkan = await this._shrinkLandingImagesIfNeeded();
                trySave();
                if (!silent) {
                    this.toast(dibersihkan
                        ? '✅ Tersimpan! (beberapa foto lama otomatis dikompres ulang agar muat). Landing page akan sinkron otomatis.'
                        : '✅ Tersimpan! Landing page yang sedang terbuka akan sinkron otomatis.');
                }
            } catch (e) {
                console.error('[CETAK.OS] Gagal menyimpan landingSettings:', e);
                if (!isQuotaErr(e)) {
                    if (!silent) this.toast('⚠️ Gagal menyimpan (localStorage tidak tersedia).');
                    return;
                }
                // Masih gagal walau sudah dikompres ulang — beri diagnosis konkret,
                // bukan sekadar "gagal", supaya Owner tahu persis apa yang harus dikurangi.
                let ukuranKB = null;
                try { ukuranKB = Math.round(JSON.stringify(this.landingSettings).length / 1024); } catch (_) { /* abaikan */ }
                const jmlBanner = Array.isArray(this.landingSettings?.heroBannerGaleri) ? this.landingSettings.heroBannerGaleri.length : 0;
                const jmlGaleri = Array.isArray(this.landingSettings?.galeri) ? this.landingSettings.galeri.length : 0;
                if (!silent) {
                    this.toast(`⚠️ Gagal menyimpan — penyimpanan browser penuh${ukuranKB ? ` (~${ukuranKB.toLocaleString('id-ID')} KB)` : ''}. Kurangi foto di Banner Preview (${jmlBanner} slide) atau Galeri (${jmlGaleri} foto), lalu coba lagi.`);
                }
            }
        },

        async resetLandingSettings() {
            const ok = await this.confirmSwal('Reset semua pengaturan landing page ke nilai default?', { title: 'Reset Landing Page?', confirmText: 'Ya, Reset' });
            if (!ok) return;
            localStorage.removeItem(CMS_KEY);
            localStorage.removeItem(CMS_SYNC_KEY);
            this.landingSettings = this._defaultLanding();
            this.toast('🔄 Pengaturan dikembalikan ke default.');
        },

        // ------- GALERI CRUD & IMAGES -------
        galeriSearch: '',
        galeriCategoryFilter: 'Semua',
        galeriViewMode: 'grid', // 'grid' | 'table'
        _galeriForm: { id: null, nama: '', jenis: '', gambar: '', warna: 'linear-gradient(155deg,#C2141A,#971014)' },
        _galeriEdit: false,
        _galeriError: '',

        galeriPresets: [
            { label: 'Baliho Outdoor Flexi', url: 'asset/img/gallery/gallery-1.jpeg' },
            { label: 'Spanduk Vinyl Ucapan', url: 'asset/img/gallery/gallery-2.jpeg' },
            { label: 'Banner Roll Up Pameran', url: 'asset/img/gallery/gallery-3.png' },
            { label: 'Baliho Billboard Jalan', url: 'asset/img/gallery/gallery-4.png' },
            { label: 'Stiker Cutting & Kemasan', url: 'asset/img/gallery/gallery-5.jpeg' },
            { label: 'Panggung & Backdrop Event', url: 'asset/img/gallery/gallery-6.jpeg' },
            { label: 'Signage & Neon Box', url: 'asset/img/banner-ticket/ticket-5.png' },
            { label: 'Promosi Toko Retail', url: 'asset/img/banner-ticket/ticket-6.jpeg' },
        ],

        get filteredGaleri() {
            if (!this.landingSettings || !Array.isArray(this.landingSettings.galeri)) return [];
            const q = this.galeriSearch.trim().toLowerCase();
            const cat = this.galeriCategoryFilter;
            return this.landingSettings.galeri.filter(g => {
                const matchQ = !q || (g.nama && g.nama.toLowerCase().includes(q)) || (g.jenis && g.jenis.toLowerCase().includes(q));
                const matchCat = cat === 'Semua' || (g.jenis && g.jenis.toLowerCase().includes(cat.toLowerCase()));
                return matchQ && matchCat;
            });
        },

        async handleGaleriImageUpload(event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                this.toast('⚠️ Pilih file gambar yang valid (JPG, PNG, WebP).');
                return;
            }
            if (file.size > 3 * 1024 * 1024) {
                this.toast('⚠️ Ukuran gambar maksimal 3MB.');
                return;
            }
            try {
                // Kompres dulu — foto galeri disimpan di kunci yang sama (kugiyaiLandingSettings)
                // dengan Banner Preview, jadi ikut menentukan apakah "Simpan & Terapkan" berhasil.
                this._galeriForm.gambar = await this._compressImageFile(file, { maxWidth: 1000, maxHeight: 1000, targetBytes: 260 * 1024 });
                this.toast('📷 Foto portofolio berhasil dimuat.');
            } catch (err) {
                console.error('[CETAK.OS] Gagal memproses foto portofolio:', err);
                this.toast('⚠️ Gagal memproses foto portofolio.');
            }
        },

        openAddGaleri() {
            this._galeriError = '';
            this._galeriForm = {
                id: null,
                nama: '',
                jenis: 'BALIHO FLEXI · 3×4M',
                gambar: 'asset/img/gallery/gallery-1.jpeg',
                warna: 'linear-gradient(155deg,#C2141A,#971014)'
            };
            this._galeriEdit = false;
            const finput = document.getElementById('galeriFileInput');
            if (finput) finput.value = '';
            const el = document.getElementById('mdlGaleri');
            if (el && window.bootstrap) bootstrap.Modal.getOrCreateInstance(el).show();
        },

        openEditGaleri(item) {
            this._galeriError = '';
            this._galeriForm = { ...item };
            this._galeriEdit = true;
            const finput = document.getElementById('galeriFileInput');
            if (finput) finput.value = '';
            const el = document.getElementById('mdlGaleri');
            if (el && window.bootstrap) bootstrap.Modal.getOrCreateInstance(el).show();
        },

        duplicateGaleri(item) {
            if (!this.landingSettings || !Array.isArray(this.landingSettings.galeri)) return;
            const maxId = this.landingSettings.galeri.reduce((m, g) => Math.max(m, g.id || 0), 0);
            const clone = {
                ...item,
                id: maxId + 1,
                nama: item.nama + ' (Salinan)'
            };
            this.landingSettings.galeri.push(clone);
            this.saveLandingSettings();
            this.toast('📋 Item galeri "' + item.nama + '" berhasil diduplikasi.');
        },

        saveGaleriItem() {
            this._galeriError = '';
            const f = this._galeriForm;
            if (!f.nama || !f.nama.trim()) {
                this._galeriError = 'Nama klien / proyek wajib diisi.';
                return;
            }
            if (!f.jenis || !f.jenis.trim()) {
                this._galeriError = 'Jenis dan ukuran pekerjaan wajib diisi.';
                return;
            }
            if (!f.warna || !f.warna.trim()) {
                f.warna = 'linear-gradient(155deg,#C2141A,#971014)';
            }

            if (this._galeriEdit) {
                const idx = this.landingSettings.galeri.findIndex(g => g.id === f.id);
                if (idx !== -1) {
                    this.landingSettings.galeri[idx] = { ...f };
                }
            } else {
                const maxId = this.landingSettings.galeri.reduce((m, g) => Math.max(m, g.id || 0), 0);
                this.landingSettings.galeri.push({ ...f, id: maxId + 1 });
            }

            this.saveLandingSettings();
            this.closeModal('mdlGaleri');
            this.toast(this._galeriEdit ? '✅ Item galeri diperbarui.' : '🎉 Item galeri baru berhasil ditambahkan.');
        },

        async deleteGaleri(item) {
            const ok = await this.confirmSwal('Hapus item galeri "' + item.nama + '" dari landing page?', { title: 'Hapus Item Galeri?', confirmText: 'Ya, Hapus' });
            if (!ok) return;
            this.landingSettings.galeri = this.landingSettings.galeri.filter(g => g.id !== item.id);
            this.saveLandingSettings();
            this.toast('🗑️ Item galeri berhasil dihapus.');
        },

        moveGaleri(item, dir) {
            const arr = this.landingSettings.galeri;
            const i = arr.indexOf(item);
            const j = i + dir;
            if (j < 0 || j >= arr.length) return;
            [arr[i], arr[j]] = [arr[j], arr[i]];
            this.saveLandingSettings();
            this.toast('↕️ Urutan galeri diperbarui.');
        },

        // ------- TESTIMONI CRUD -------
        _testiForm: { id: null, nama: '', instansi: '', kutipan: '', inisial: '', warna: '#FF6B2C' },
        _testiEdit: false,

        openAddTesti() {
            this._testiForm = { id: null, nama: '', instansi: '', kutipan: '', inisial: '', warna: '#FF6B2C' };
            this._testiEdit = false;
            const el = document.getElementById('mdlTesti');
            if (el && window.bootstrap) bootstrap.Modal.getOrCreateInstance(el).show();
        },
        openEditTesti(item) {
            this._testiForm = { ...item };
            this._testiEdit = true;
            const el = document.getElementById('mdlTesti');
            if (el && window.bootstrap) bootstrap.Modal.getOrCreateInstance(el).show();
        },
        saveTestiItem() {
            const f = this._testiForm;
            if (!f.nama.trim() || !f.kutipan.trim()) { this.toast('⚠️ Nama dan kutipan harus diisi.'); return; }
            if (!f.inisial.trim()) f.inisial = f.nama.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            if (this._testiEdit) {
                const idx = this.landingSettings.testimoni.findIndex(t => t.id === f.id);
                if (idx !== -1) this.landingSettings.testimoni[idx] = { ...f };
            } else {
                const maxId = this.landingSettings.testimoni.reduce((m, t) => Math.max(m, t.id), 0);
                this.landingSettings.testimoni.push({ ...f, id: maxId + 1 });
            }
            this.saveLandingSettings();
            this.closeModal('mdlTesti');
            this.toast(this._testiEdit ? '✅ Testimoni diperbarui.' : '🎉 Testimoni baru berhasil ditambahkan.');
        },
        async deleteTesti(item) {
            const ok = await this.confirmSwal('Hapus testimoni dari "' + item.nama + '"?', { title: 'Hapus Testimoni?', confirmText: 'Ya, Hapus' });
            if (!ok) return;
            this.landingSettings.testimoni = this.landingSettings.testimoni.filter(t => t.id !== item.id);
            this.saveLandingSettings();
            this.toast('🗑️ Testimoni berhasil dihapus.');
        },

        // ------- LAYANAN CRUD -------
        _layananForm: { id: null, nama: '', deskripsi: '', hargaLabel: '', iconBg: '#FFF3ED', iconColor: '#FF6B2C' },
        _layananEdit: false,

        openAddLayanan() {
            this._layananForm = { id: null, nama: '', deskripsi: '', hargaLabel: '', iconBg: '#FFF3ED', iconColor: '#FF6B2C' };
            this._layananEdit = false;
            const el = document.getElementById('mdlLayanan');
            if (el && window.bootstrap) bootstrap.Modal.getOrCreateInstance(el).show();
        },
        openEditLayanan(item) {
            this._layananForm = { ...item };
            this._layananEdit = true;
            const el = document.getElementById('mdlLayanan');
            if (el && window.bootstrap) bootstrap.Modal.getOrCreateInstance(el).show();
        },
        saveLayananItem() {
            const f = this._layananForm;
            if (!f.nama.trim() || !f.deskripsi.trim()) { this.toast('⚠️ Nama dan deskripsi harus diisi.'); return; }
            if (this._layananEdit) {
                const idx = this.landingSettings.layanan.findIndex(l => l.id === f.id);
                if (idx !== -1) this.landingSettings.layanan[idx] = { ...f };
            } else {
                const maxId = this.landingSettings.layanan.reduce((m, l) => Math.max(m, l.id), 0);
                this.landingSettings.layanan.push({ ...f, id: maxId + 1 });
            }
            this.saveLandingSettings();
            this.closeModal('mdlLayanan');
            this.toast(this._layananEdit ? '✅ Layanan diperbarui.' : '🎉 Layanan baru berhasil ditambahkan.');
        },
        async deleteLayanan(item) {
            const ok = await this.confirmSwal('Hapus layanan "' + item.nama + '"?', { title: 'Hapus Layanan?', confirmText: 'Ya, Hapus' });
            if (!ok) return;
            this.landingSettings.layanan = this.landingSettings.layanan.filter(l => l.id !== item.id);
            this.saveLandingSettings();
            this.toast('🗑️ Layanan berhasil dihapus.');
        },
        moveLayanan(item, dir) {
            const arr = this.landingSettings.layanan;
            const i = arr.indexOf(item);
            const j = i + dir;
            if (j < 0 || j >= arr.length) return;
            [arr[i], arr[j]] = [arr[j], arr[i]];
            this.saveLandingSettings();
            this.toast('↕️ Urutan layanan diperbarui.');
        },

        // ---------- chart data helpers ----------
        revenueSeries() {
            if (this.revenueRange === 'mingguan') {
                return {
                    labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'],
                    data: [8.4, 10.1, 9.3, 12.7, 11.5, 14.2, 13.6, 16.8],
                };
            }
            return {
                labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'],
                data: [1.2, 1.8, 1.5, 2.1, 1.9, 2.6, 2.2, 3.1, 2.8, 3.4, 3.0, 3.8, 3.5, 4.1],
            };
        },
        salesSeries() {
            const sets = {
                Harian: { labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'], data: [2.1, 3.4, 2.8, 4.0, 3.6, 5.2, 3.1] },
                Mingguan: { labels: ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'], data: [9.2, 12.4, 10.8, 16.1] },
                Bulanan: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu'], data: [28, 32, 30, 35, 38, 41, 39, 46] },
                Tahunan: { labels: ['2022', '2023', '2024', '2025', '2026'], data: [180, 220, 260, 310, 340] },
            };
            return sets[this.reportPeriod] || sets.Mingguan;
        },

        // NOTE: Chart.js instances are intentionally NOT stored on `this` / Alpine's
        // reactive data. Alpine wraps reactive properties in a Proxy, and Chart.js
        // keeps internal registries/WeakMaps keyed by the exact canvas + instance
        // reference. Storing instances reactively breaks Chart.js's own cleanup,
        // which then throws "Canvas is already in use" on re-render and silently
        // aborts every chart after that. We use Chart.js's own Chart.getChart()
        // registry to safely find-and-destroy any prior instance on a canvas.
        destroyChartOn(canvasEl) {
            if (!canvasEl || typeof Chart === 'undefined') return;
            try {
                const existing = Chart.getChart(canvasEl);
                if (existing) existing.destroy();
            } catch (e) { /* no-op: nothing attached yet */ }
        },
        renderCharts() {
            if (this._renderChartsTimer) {
                clearTimeout(this._renderChartsTimer);
            }
            this._renderChartsTimer = setTimeout(() => {
                this._doRenderCharts();
            }, 60);
        },
        _doRenderCharts() {
            // Grafik hanya relevan untuk halaman Dashboard & Laporan (pengguna internal:
            // Owner, Admin, Kasir, dll). Kedua halaman ini punya canvas chart-nya
            // masing-masing (chartRevenue/chartStatus untuk Dashboard,
            // chartSales/chartProduk/chartBahan untuk Laporan — lihat blok di bawah).
            if ((this.page !== 'dashboard' && this.page !== 'laporan') || this.loginRole === 'Pelanggan') {
                return;
            }
            const el = id => document.getElementById(id);
            if (typeof Chart === 'undefined') {
                this._chartRetries = (this._chartRetries || 0) + 1;
                if (this._chartRetries <= 3) {
                    console.warn('[CETAK.OS] Menunggu Chart.js (percobaan ' + this._chartRetries + '/3)...');
                    setTimeout(() => this.renderCharts(), 400);
                } else {
                    console.warn('[CETAK.OS] Chart.js tidak tersedia. Grafik tidak dapat dirender.');
                }
                return;
            }
            this._chartRetries = 0;
            console.debug('[CETAK.OS] renderCharts() dipanggil — page:', this.page, 'role:', this.loginRole);
            Chart.defaults.font.family = "'Inter',sans-serif";
            Chart.defaults.color = '#6B7280';

            // Charts are created immediately below — never gated behind a
            // "wait until visible" check, because that kind of check can
            // silently stall forever (no console error) if it ever
            // mis-detects the canvas as not-ready. Instead, as a safety net
            // for the rare case a canvas reports a 0×0 size at creation time
            // (e.g. right as an x-show transition is finishing), we call
            // chart.resize() one animation frame later for every chart we
            // just created. This never blocks the initial render.
            const created = [];

            try {
                if (this.page === 'dashboard' && el('chartRevenue') && this.loginRole !== 'Pelanggan') {
                    const canvas = el('chartRevenue');
                    this.destroyChartOn(canvas);
                    const series = this.revenueSeries();
                    created.push(new Chart(canvas, {
                        type: 'line',
                        data: {
                            labels: series.labels,
                            datasets: [{ label: 'Pendapatan', data: series.data, borderColor: '#C2141A', backgroundColor: 'rgba(194,20,26,0.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2.5 }]
                        },
                        options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#F1EEE7' }, ticks: { callback: v => v + 'jt' } } }, responsive: true, maintainAspectRatio: false }
                    }));
                }
            } catch (e) { console.error('chartRevenue error:', e); }

            try {
                if (this.page === 'dashboard' && el('chartStatus')) {
                    const canvas = el('chartStatus');
                    this.destroyChartOn(canvas);
                    const dist = this.statusDist;
                    created.push(new Chart(canvas, {
                        type: 'doughnut',
                        data: { labels: dist.map(s => s.label), datasets: [{ data: dist.map(s => s.value), backgroundColor: dist.map(s => s.color), borderWidth: 0 }] },
                        options: { cutout: '70%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
                    }));
                }
            } catch (e) { console.error('chartStatus error:', e); }

            try {
                if (this.page === 'laporan' && el('chartSales')) {
                    const canvas = el('chartSales');
                    this.destroyChartOn(canvas);
                    const series = this.salesSeries();
                    created.push(new Chart(canvas, {
                        type: 'bar',
                        data: { labels: series.labels, datasets: [{ label: 'Penjualan', data: series.data, backgroundColor: '#C2141A', borderRadius: 8, maxBarThickness: 42 }] },
                        options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#F1EEE7' }, ticks: { callback: v => v + 'jt' } } }, responsive: true, maintainAspectRatio: false }
                    }));
                }
            } catch (e) { console.error('chartSales error:', e); }

            try {
                if (this.page === 'laporan' && el('chartProduk')) {
                    const canvas = el('chartProduk');
                    this.destroyChartOn(canvas);
                    const counts = this.orderCountsByJenis();
                    const palette = ['#C2141A', '#0F6E6E', '#7C5CFC', '#F0C51A', '#2A9D6B', '#0B1B3D'];
                    created.push(new Chart(canvas, {
                        type: 'doughnut',
                        data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: Object.keys(counts).map((_, i) => palette[i % palette.length]), borderWidth: 0 }] },
                        options: { cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, responsive: true, maintainAspectRatio: false }
                    }));
                }
            } catch (e) { console.error('chartProduk error:', e); }

            try {
                if (this.page === 'laporan' && el('chartBahan')) {
                    const canvas = el('chartBahan');
                    this.destroyChartOn(canvas);
                    created.push(new Chart(canvas, {
                        type: 'bar',
                        data: { labels: this.stok.map(s => s.nama), datasets: [{ label: 'Terpakai', data: this.stok.map(s => s.keluar), backgroundColor: '#0F6E6E', borderRadius: 8, maxBarThickness: 34 }] },
                        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#F1EEE7' } }, y: { grid: { display: false } } }, responsive: true, maintainAspectRatio: false }
                    }));
                }
            } catch (e) { console.error('chartBahan error:', e); }

            console.debug('[CETAK.OS] chart dibuat:', created.length, '/ canvas relevan untuk halaman ini');
            if (created.length) {
                requestAnimationFrame(() => {
                    created.forEach(c => { try { c.resize(); } catch (e) { /* chart may have been destroyed by a fast page switch */ } });
                });
            }
        }
    };
}

window.app = app;

if (window.Alpine) {
    window.Alpine.data('app', app);
}
document.addEventListener('alpine:init', () => {
    if (window.Alpine) {
        window.Alpine.data('app', app);
    }
});