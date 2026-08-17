function printShopApp() {
    return {
        // ---------- NAV / ROLE ----------
        activeTab: 'dashboard',
        currentRole: 'Owner',
        roles: ['Owner', 'Admin', 'Designer', 'Operator Produksi', 'Kasir', 'Pelanggan'],
        menuItems: [
            { key: 'dashboard', label: 'Dashboard', icon: 'bi bi-speedometer2' },
            { key: 'pelanggan', label: 'Data Pelanggan', icon: 'bi bi-people' },
            { key: 'pemesanan', label: 'Pemesanan / Order', icon: 'bi bi-receipt' },
            { key: 'desain', label: 'Manajemen Desain', icon: 'bi bi-palette' },
            { key: 'produksi', label: 'Produksi', icon: 'bi bi-gear-wide-connected' },
            { key: 'pembayaran', label: 'Pembayaran', icon: 'bi bi-cash-stack' },
            { key: 'stok', label: 'Stok / Bahan', icon: 'bi bi-box-seam' },
            { key: 'laporan', label: 'Laporan', icon: 'bi bi-bar-chart-line' },
            { key: 'user', label: 'User & Hak Akses', icon: 'bi bi-shield-lock' },
            { key: 'portal-order', label: 'Buat Pesanan', icon: 'bi bi-plus-square' },
            { key: 'portal-pesanan', label: 'Pesanan Saya', icon: 'bi bi-list-check' },
            { key: 'portal-bayar', label: 'Bayar Tagihan', icon: 'bi bi-wallet2' },
        ],
        pageTitles: {
            dashboard: 'Dashboard', pelanggan: 'Data Pelanggan', pemesanan: 'Pemesanan / Order', desain: 'Manajemen Desain',
            produksi: 'Produksi', pembayaran: 'Pembayaran', stok: 'Stok / Bahan', laporan: 'Laporan', user: 'User & Hak Akses',
            'portal-order': 'Buat Pesanan', 'portal-pesanan': 'Pesanan Saya', 'portal-bayar': 'Bayar Tagihan'
        },
        permissions: {
            'Owner': ['dashboard', 'pelanggan', 'pemesanan', 'desain', 'produksi', 'pembayaran', 'stok', 'laporan', 'user'],
            'Admin': ['dashboard', 'pelanggan', 'pemesanan', 'desain', 'produksi', 'pembayaran', 'stok', 'laporan'],
            'Designer': ['dashboard', 'desain', 'pemesanan'],
            'Operator Produksi': ['dashboard', 'produksi', 'stok'],
            'Kasir': ['dashboard', 'pembayaran', 'pemesanan'],
            'Pelanggan': ['portal-pesanan', 'portal-order', 'portal-bayar'],
        },
        todayLabel: new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),

        // ---------- MASTER DATA ----------
        statusList: ['Pesanan Baru', 'Menunggu Desain', 'Menunggu Persetujuan', 'Siap Cetak', 'Sedang Dicetak', 'Finishing', 'Selesai'],
        productionStages: ['Menunggu Desain', 'Menunggu Persetujuan', 'Siap Cetak', 'Sedang Dicetak', 'Finishing', 'Selesai'],
        filterOrderStatus: '',
        searchPelanggan: '',
        periodeLaporan: 'harian',

        // Daftar harga resmi — dipakai konsisten oleh form order staf maupun portal pelanggan
        priceList: { 'Baliho': 35000, 'Spanduk': 25000, 'Banner Standing': 45000, 'Stiker': 20000, 'Neon Box': 450000 },
        finishingDefault: 25000,
        designFeeDefault: 50000,

        // Portal pelanggan (login demo & form pesan/bayar mandiri)
        pelangganLoginId: 1,
        portalOrder: {},
        portalPay: { orderId: '', jumlah: 0, metode: 'QRIS' },
        notify: { show: false, message: '', type: 'success' },

        pelanggan: [
            { id: 1, nama: 'Budi Santoso', hp: '0812-3456-7890', instansi: 'Toko Makmur Jaya', alamat: 'Jl. Ahmad Yani No. 12, Jayapura' },
            { id: 2, nama: 'Siti Aminah', hp: '0821-9988-1122', instansi: 'Panitia HUT RI Kelurahan', alamat: 'Jl. Percetakan No. 5' },
            { id: 3, nama: 'PT Nusantara Sejahtera', hp: '0813-2211-4455', instansi: 'PT Nusantara Sejahtera', alamat: 'Ruko Sentosa Blok C2' },
            { id: 4, nama: 'Andi Wijaya', hp: '0857-1122-3344', instansi: '', alamat: 'Jl. Kelapa Dua No. 8' },
        ],

        orders: [],
        riwayatTransaksi: [],
        bahan: [
            { id: 1, nama: 'Flexi China', satuan: 'm²', stok: 340, minStok: 50, jumlahInput: null },
            { id: 2, nama: 'Flexi Korea', satuan: 'm²', stok: 120, minStok: 40, jumlahInput: null },
            { id: 3, nama: 'Vinyl Sticker', satuan: 'roll', stok: 8, minStok: 5, jumlahInput: null },
            { id: 4, nama: 'Tinta Solvent', satuan: 'liter', stok: 14, minStok: 6, jumlahInput: null },
            { id: 5, nama: 'Mata Ayam', satuan: 'pcs', stok: 900, minStok: 200, jumlahInput: null },
            { id: 6, nama: 'Bahan Finishing (Lipat+Lem)', satuan: 'paket', stok: 35, minStok: 10, jumlahInput: null },
        ],
        users: [
            { id: 1, nama: 'Yohanes Pattiasina', username: 'yohanes', role: 'Owner' },
            { id: 2, nama: 'Maria Kando', username: 'maria', role: 'Admin' },
            { id: 3, nama: 'Dedi Kurniawan', username: 'dedi', role: 'Designer' },
            { id: 4, nama: 'Rudi Hartono', username: 'rudi', role: 'Operator Produksi' },
            { id: 5, nama: 'Lestari Putri', username: 'lestari', role: 'Kasir' },
        ],

        // ---------- MODAL / FORM STATE ----------
        modal: { pelanggan: false, riwayat: false, order: false, orderDetail: false, payment: false, stok: false, user: false, nota: false },
        form: {
            pelanggan: {}, order: {}, payment: {}, stok: {}, user: {}
        },
        riwayatPelangganAktif: null,
        orderDetailAktif: null,
        paymentOrderAktif: null,
        notaOrder: null,
        orderCounter: 0,

        // ---------- INIT ----------
        init() {
            this.seedOrders();
            this.resetPortalOrderForm();
            this.$nextTick(() => {
                this.renderDashboardCharts();
                this.renderReportCharts();
            });
            this.$watch('activeTab', (val) => {
                this.$nextTick(() => {
                    if (val === 'dashboard') this.renderDashboardCharts();
                    if (val === 'laporan') this.renderReportCharts();
                });
            });
            // Konsisten: begitu ganti peran, langsung diarahkan ke menu yang relevan untuk peran itu
            this.$watch('currentRole', (val) => {
                if (val === 'Pelanggan') {
                    this.activeTab = 'portal-pesanan';
                } else if (!this.permissions[val].includes(this.activeTab)) {
                    this.activeTab = 'dashboard';
                }
            });
        },

        seedOrders() {
            const base = [
                { pelangganId: 1, jenis: 'Baliho', panjang: 2, lebar: 1, jumlah: 2, hargaM2: 35000, biayaDesain: 50000, biayaFinishing: 30000, dp: 200000, deadline: this.plusDays(2), status: 'Sedang Dicetak', catatan: 'Warna dominan merah-putih' },
                { pelangganId: 2, jenis: 'Spanduk', panjang: 3, lebar: 1, jumlah: 5, hargaM2: 25000, biayaDesain: 0, biayaFinishing: 20000, dp: 150000, deadline: this.plusDays(1), status: 'Menunggu Desain', catatan: 'Untuk acara 17 Agustus' },
                { pelangganId: 3, jenis: 'Neon Box', panjang: 1.2, lebar: 0.6, jumlah: 1, hargaM2: 450000, biayaDesain: 100000, biayaFinishing: 150000, dp: 500000, deadline: this.plusDays(7), status: 'Menunggu Persetujuan', catatan: '' },
                { pelangganId: 4, jenis: 'Banner Standing', panjang: 0.6, lebar: 1.6, jumlah: 3, hargaM2: 45000, biayaDesain: 0, biayaFinishing: 15000, dp: 100000, deadline: this.plusDays(4), status: 'Siap Cetak', catatan: '' },
                { pelangganId: 1, jenis: 'Stiker', panjang: 1, lebar: 1, jumlah: 10, hargaM2: 20000, biayaDesain: 0, biayaFinishing: 0, dp: 250000, deadline: this.plusDays(-1), status: 'Selesai', catatan: 'Sudah diambil' },
                { pelangganId: 2, jenis: 'Baliho', panjang: 4, lebar: 2, jumlah: 1, hargaM2: 35000, biayaDesain: 75000, biayaFinishing: 40000, dp: 0, deadline: this.plusDays(3), status: 'Pesanan Baru', catatan: '' },
                { pelangganId: 3, jenis: 'Spanduk', panjang: 2, lebar: 1, jumlah: 8, hargaM2: 25000, biayaDesain: 0, biayaFinishing: 30000, dp: 400000, deadline: this.plusDays(-2), status: 'Finishing', catatan: '' },
            ];
            base.forEach(o => this.orders.push(this.buildOrder(o)));
            // seed a bit of payment history matching DP amounts
            this.orders.forEach(o => {
                if (o.dp > 0) {
                    this.riwayatTransaksi.push({ id: this.uid(), tanggal: this.plusDays(-3), nomorOrder: o.nomor, jumlah: o.dp, metode: 'Transfer Bank' });
                }
            });
        },

        // ---------- HELPERS ----------
        uid() { return Date.now() + Math.floor(Math.random() * 1000); },
        plusDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); },
        formatRupiah(v) { v = Number(v) || 0; return 'Rp ' + v.toLocaleString('id-ID'); },
        customerName(id) { const p = this.pelanggan.find(p => p.id === id); return p ? p.nama : '-'; },
        countStatus(s) {
            if (Array.isArray(s)) return this.orders.filter(o => s.includes(o.status)).length;
            return this.orders.filter(o => o.status === s).length;
        },
        statusBadge(status) {
            const map = {
                'Pesanan Baru': 'bg-secondary', 'Menunggu Desain': 'bg-warning text-dark', 'Menunggu Persetujuan': 'bg-info text-dark',
                'Siap Cetak': 'bg-primary', 'Sedang Dicetak': 'bg-amber text-white', 'Finishing': 'bg-purple text-white', 'Selesai': 'bg-success'
            };
            return map[status] || 'bg-secondary';
        },
        computeOrderTotal(o) {
            const luas = (Number(o.panjang) || 0) * (Number(o.lebar) || 0) * (Number(o.jumlah) || 0);
            return Math.round(luas * (Number(o.hargaM2) || 0) + (Number(o.biayaDesain) || 0) + (Number(o.biayaFinishing) || 0));
        },
        buildOrder(data) {
            this.orderCounter++;
            const total = this.computeOrderTotal(data);
            return {
                id: this.uid(),
                nomor: 'ORD-' + new Date().getFullYear() + '-' + String(this.orderCounter).padStart(4, '0'),
                pelangganId: data.pelangganId,
                jenis: data.jenis,
                panjang: data.panjang, lebar: data.lebar, jumlah: data.jumlah,
                hargaM2: data.hargaM2, biayaDesain: data.biayaDesain || 0, biayaFinishing: data.biayaFinishing || 0,
                total, dp: data.dp || 0, deadline: data.deadline, catatan: data.catatan || '', status: data.status || 'Pesanan Baru',
                desain: { preview: null, versi: 1, disetujui: data.status === 'Selesai' || this.productionStages.slice(2).includes(data.status) }
            };
        },

        get totalPendapatan() { return this.riwayatTransaksi.reduce((a, t) => a + t.jumlah, 0); },
        get totalPiutang() { return this.orders.reduce((a, o) => a + Math.max(o.total - o.dp, 0), 0); },
        get pelangganAktif() { return this.pelanggan.find(p => p.id === this.pelangganLoginId); },
        get pesananSaya() { return this.orders.filter(o => o.pelangganId === this.pelangganLoginId); },
        get tagihanSaya() { return this.pesananSaya.reduce((a, o) => a + Math.max(o.total - o.dp, 0), 0); },
        get filteredPelanggan() {
            const q = this.searchPelanggan.toLowerCase().trim();
            if (!q) return this.pelanggan;
            return this.pelanggan.filter(p => (p.nama + p.hp + p.instansi).toLowerCase().includes(q));
        },

        // ---------- PELANGGAN ----------
        openPelangganForm(p = null) { this.form.pelanggan = p ? { ...p } : { nama: '', hp: '', instansi: '', alamat: '' }; this.modal.pelanggan = true; },
        savePelanggan() {
            if (this.form.pelanggan.id) {
                const i = this.pelanggan.findIndex(p => p.id === this.form.pelanggan.id);
                this.pelanggan[i] = { ...this.form.pelanggan };
            } else {
                this.pelanggan.push({ ...this.form.pelanggan, id: this.uid() });
            }
            this.modal.pelanggan = false;
            this.showToast('Data pelanggan berhasil disimpan.');
        },
        deletePelanggan(id) { if (confirm('Hapus data pelanggan ini?')) this.pelanggan = this.pelanggan.filter(p => p.id !== id); },
        viewRiwayat(p) { this.riwayatPelangganAktif = p; this.modal.riwayat = true; },

        // ---------- ORDER ----------
        openOrderForm(o = null) {
            this.form.order = o ? { ...o } : { pelangganId: '', jenis: 'Baliho', panjang: 1, lebar: 1, jumlah: 1, hargaM2: 30000, biayaDesain: 0, biayaFinishing: 0, dp: 0, deadline: this.plusDays(3), catatan: '', status: 'Pesanan Baru' };
            this.modal.order = true;
        },
        saveOrder() {
            const total = this.computeOrderTotal(this.form.order);
            if (this.form.order.id) {
                const i = this.orders.findIndex(o => o.id === this.form.order.id);
                this.orders[i] = { ...this.orders[i], ...this.form.order, total };
            } else {
                this.orders.push(this.buildOrder(this.form.order));
            }
            this.modal.order = false;
            this.showToast('Order berhasil disimpan.');
            this.$nextTick(() => { this.renderDashboardCharts(); this.renderReportCharts(); });
        },
        deleteOrder(id) { if (confirm('Hapus order ini?')) this.orders = this.orders.filter(o => o.id !== id); },
        openOrderDetail(o) { this.orderDetailAktif = o; this.modal.orderDetail = true; },

        // ---------- DESAIN ----------
        uploadDesain(o, evt) {
            const file = evt.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            o.desain.preview = url;
            o.desain.disetujui = false;
            if (o.status === 'Menunggu Desain') o.status = 'Menunggu Persetujuan';
        },
        requestRevisi(o) { o.desain.versi++; o.desain.disetujui = false; o.status = 'Menunggu Desain'; },
        approveDesain(o) { o.desain.disetujui = true; if (o.status !== 'Selesai') o.status = 'Siap Cetak'; },

        // ---------- PRODUKSI ----------
        moveStage(o, dir) {
            const idx = this.productionStages.indexOf(o.status);
            const next = idx + dir;
            if (next >= 0 && next < this.productionStages.length) o.status = this.productionStages[next];
            this.$nextTick(() => { this.renderDashboardCharts(); this.renderReportCharts(); });
        },

        // ---------- PEMBAYARAN ----------
        openPaymentForm(o) { this.paymentOrderAktif = o; this.form.payment = { jumlah: o.total - o.dp, metode: 'Tunai' }; this.modal.payment = true; },
        savePayment() {
            const o = this.paymentOrderAktif;
            const jumlah = Math.min(Number(this.form.payment.jumlah) || 0, o.total - o.dp);
            o.dp += jumlah;
            this.riwayatTransaksi.push({ id: this.uid(), tanggal: this.plusDays(0), nomorOrder: o.nomor, jumlah, metode: this.form.payment.metode });
            this.modal.payment = false;
            this.showToast('Pembayaran berhasil dicatat.');
            this.$nextTick(() => { this.renderDashboardCharts(); this.renderReportCharts(); });
        },
        printNota(o) { this.notaOrder = o; this.modal.nota = true; },

        // ---------- NOTIFIKASI ----------
        showToast(message, type = 'success') {
            this.notify = { show: true, message, type };
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => { this.notify.show = false; }, 3000);
        },

        // ---------- PORTAL PELANGGAN: PESAN MANDIRI ----------
        resetPortalOrderForm() {
            const jenisAwal = Object.keys(this.priceList)[0];
            this.portalOrder = { jenis: jenisAwal, hargaM2: this.priceList[jenisAwal], panjang: 1, lebar: 1, jumlah: 1, butuhDesain: false, catatan: '', deadline: this.plusDays(3) };
        },
        computePortalTotal() {
            const luas = (Number(this.portalOrder.panjang) || 0) * (Number(this.portalOrder.lebar) || 0) * (Number(this.portalOrder.jumlah) || 0);
            const biayaCetak = luas * (this.portalOrder.hargaM2 || 0);
            const biayaDesain = this.portalOrder.butuhDesain ? this.designFeeDefault : 0;
            return Math.round(biayaCetak + biayaDesain + this.finishingDefault);
        },
        submitPortalOrder() {
            const o = this.buildOrder({
                pelangganId: this.pelangganLoginId,
                jenis: this.portalOrder.jenis,
                panjang: this.portalOrder.panjang,
                lebar: this.portalOrder.lebar,
                jumlah: this.portalOrder.jumlah,
                hargaM2: this.portalOrder.hargaM2,
                biayaDesain: this.portalOrder.butuhDesain ? this.designFeeDefault : 0,
                biayaFinishing: this.finishingDefault,
                dp: 0,
                deadline: this.portalOrder.deadline,
                catatan: this.portalOrder.catatan,
                status: 'Pesanan Baru',
            });
            this.orders.push(o);
            this.showToast('Pesanan ' + o.nomor + ' berhasil dikirim. Silakan lakukan pembayaran.');
            this.resetPortalOrderForm();
            this.activeTab = 'portal-pesanan';
            this.$nextTick(() => { this.renderDashboardCharts(); this.renderReportCharts(); });
        },

        // ---------- PORTAL PELANGGAN: BAYAR MANDIRI ----------
        openPortalPay(o) {
            this.portalPay = { orderId: o.id, jumlah: o.total - o.dp, metode: 'QRIS' };
        },
        setPortalPayDefault() {
            const o = this.orders.find(o => o.id === this.portalPay.orderId);
            if (o) this.portalPay.jumlah = o.total - o.dp;
        },
        confirmPortalPayment() {
            const o = this.orders.find(o => o.id === this.portalPay.orderId);
            if (!o) return;
            const jumlah = Math.max(0, Math.min(Number(this.portalPay.jumlah) || 0, o.total - o.dp));
            if (jumlah <= 0) return;
            o.dp += jumlah;
            this.riwayatTransaksi.push({ id: this.uid(), tanggal: this.plusDays(0), nomorOrder: o.nomor, jumlah, metode: this.portalPay.metode });
            this.showToast('Pembayaran ' + this.formatRupiah(jumlah) + ' untuk ' + o.nomor + ' berhasil dikonfirmasi.');
            this.portalPay = { orderId: '', jumlah: 0, metode: 'QRIS' };
            this.activeTab = 'portal-pesanan';
            this.$nextTick(() => { this.renderDashboardCharts(); this.renderReportCharts(); });
        },

        // ---------- STOK ----------
        openStokForm() { this.form.stok = { nama: '', satuan: '', stok: 0, minStok: 0 }; this.modal.stok = true; },
        saveStok() { this.bahan.push({ ...this.form.stok, id: this.uid(), jumlahInput: null }); this.modal.stok = false; },
        stokMasuk(b) { const j = Number(b.jumlahInput) || 0; if (j <= 0) return; b.stok += j; b.jumlahInput = null; },
        stokKeluar(b) { const j = Number(b.jumlahInput) || 0; if (j <= 0) return; b.stok = Math.max(0, b.stok - j); b.jumlahInput = null; this.$nextTick(() => this.renderReportCharts()); },

        // ---------- USER ----------
        openUserForm(u = null) { this.form.user = u ? { ...u } : { nama: '', username: '', role: 'Kasir' }; this.modal.user = true; },
        saveUser() {
            if (this.form.user.id) {
                const i = this.users.findIndex(u => u.id === this.form.user.id);
                this.users[i] = { ...this.form.user };
            } else {
                this.users.push({ ...this.form.user, id: this.uid() });
            }
            this.modal.user = false;
        },
        deleteUser(id) { if (confirm('Hapus user ini?')) this.users = this.users.filter(u => u.id !== id); },

        // ---------- CHARTS ----------
        charts: {},
        renderDashboardCharts() {
            const revCanvas = document.getElementById('chartDashRevenue');
            const statusCanvas = document.getElementById('chartDashStatus');
            if (!revCanvas || !statusCanvas) return;

            const days = [...Array(7)].map((_, i) => this.plusDays(i - 6));
            const revByDay = days.map(d => this.riwayatTransaksi.filter(t => t.tanggal === d).reduce((a, t) => a + t.jumlah, 0));

            if (this.charts.dashRevenue) this.charts.dashRevenue.destroy();
            this.charts.dashRevenue = new Chart(revCanvas, {
                type: 'line',
                data: { labels: days.map(d => d.slice(5)), datasets: [{ label: 'Pendapatan', data: revByDay, borderColor: '#F2994A', backgroundColor: 'rgba(242,153,74,.15)', fill: true, tension: .35 }] },
                options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => 'Rp' + (v / 1000) + 'rb' } } } }
            });

            if (this.charts.dashStatus) this.charts.dashStatus.destroy();
            const statusCounts = this.statusList.map(s => this.countStatus(s));
            this.charts.dashStatus = new Chart(statusCanvas, {
                type: 'doughnut',
                data: { labels: this.statusList, datasets: [{ data: statusCounts, backgroundColor: ['#94a3b8', '#f6c453', '#38bdf8', '#0F2038', '#F2994A', '#a78bfa', '#22c55e'] }] },
                options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
            });
        },

        renderReportCharts() {
            const revCanvas = document.getElementById('chartLaporanRevenue');
            const produkCanvas = document.getElementById('chartLaporanProduk');
            const piutangCanvas = document.getElementById('chartLaporanPiutang');
            const bahanCanvas = document.getElementById('chartLaporanBahan');
            if (!revCanvas) return;

            let labels = [], data = [];
            if (this.periodeLaporan === 'harian') {
                labels = [...Array(7)].map((_, i) => this.plusDays(i - 6).slice(5));
                data = [...Array(7)].map((_, i) => {
                    const d = this.plusDays(i - 6);
                    return this.riwayatTransaksi.filter(t => t.tanggal === d).reduce((a, t) => a + t.jumlah, 0);
                });
            } else if (this.periodeLaporan === 'mingguan') {
                labels = ['Minggu -3', 'Minggu -2', 'Minggu -1', 'Minggu Ini'];
                data = labels.map((_, i) => this.totalPendapatan / 4 * (i + 1) / 4); // demo distribution
            } else if (this.periodeLaporan === 'bulanan') {
                labels = ['Mei', 'Jun', 'Jul', 'Agu'];
                data = labels.map((_, i) => Math.round(this.totalPendapatan * (0.15 + i * 0.1)));
            } else {
                labels = ['2023', '2024', '2025', '2026'];
                data = labels.map((_, i) => Math.round(this.totalPendapatan * (0.5 + i * 0.4)));
            }

            if (this.charts.laporanRevenue) this.charts.laporanRevenue.destroy();
            this.charts.laporanRevenue = new Chart(revCanvas, {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Pendapatan', data, backgroundColor: '#0F2038', borderRadius: 6 }] },
                options: { plugins: { legend: { display: false } } }
            });

            const produkCount = {};
            this.orders.forEach(o => produkCount[o.jenis] = (produkCount[o.jenis] || 0) + o.jumlah);
            if (this.charts.laporanProduk) this.charts.laporanProduk.destroy();
            this.charts.laporanProduk = new Chart(produkCanvas, {
                type: 'bar',
                data: { labels: Object.keys(produkCount), datasets: [{ label: 'Qty Dipesan', data: Object.values(produkCount), backgroundColor: '#F2994A', borderRadius: 6 }] },
                options: { indexAxis: 'y', plugins: { legend: { display: false } } }
            });

            const piutangByCustomer = {};
            this.orders.forEach(o => {
                const sisa = o.total - o.dp;
                if (sisa > 0) {
                    const nm = this.customerName(o.pelangganId);
                    piutangByCustomer[nm] = (piutangByCustomer[nm] || 0) + sisa;
                }
            });
            if (this.charts.laporanPiutang) this.charts.laporanPiutang.destroy();
            this.charts.laporanPiutang = new Chart(piutangCanvas, {
                type: 'pie',
                data: { labels: Object.keys(piutangByCustomer), datasets: [{ data: Object.values(piutangByCustomer), backgroundColor: ['#F2994A', '#0F2038', '#38bdf8', '#a78bfa', '#f6c453'] }] },
                options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
            });

            if (this.charts.laporanBahan) this.charts.laporanBahan.destroy();
            this.charts.laporanBahan = new Chart(bahanCanvas, {
                type: 'polarArea',
                data: { labels: this.bahan.map(b => b.nama), datasets: [{ data: this.bahan.map(b => b.stok), backgroundColor: ['#0F2038', '#1B3A5F', '#F2994A', '#DB7F2E', '#94a3b8', '#a78bfa'] }] },
                options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
            });
        },
    }
}