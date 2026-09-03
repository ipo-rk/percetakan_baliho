# Direktori Diagram Arsitektur & Perancangan Sistem (Mermaid)

Direktori ini memuat seluruh berkas spesifikasi diagram **Mermaid (.mmd)** mandiri untuk sistem **CETAK.OS — Percetakan Digital KugiyaiTobe (Waghete, Deiyai)**.

---

## 📁 Daftar Berkas Diagram

| No | Berkas | Jenis Diagram | Deskripsi |
|---|---|---|---|
| 1 | [`dfd_level_0.mmd`](./dfd_level_0.mmd) | DFD Level 0 (Context Diagram) | Batasan sistem utama terhadap 6 aktor eksternal (Pelanggan, Owner, Admin/Kasir, Desainer, Operator, Kurir). |
| 2 | [`dfd_level_1.mmd`](./dfd_level_1.mmd) | DFD Level 1 (Data Flow Terinci) | Dekomposisi 6 sub-proses bisnis dan 4 data store persisten. |
| 3 | [`use_case.mmd`](./use_case.mmd) | Use Case Diagram | Pemetaan hak akses dan kapabilitas fungsional berdasarkan Role-Based Access Control (RBAC). |
| 4 | [`erd.mmd`](./erd.mmd) | Entity Relationship Diagram | Struktur relasi entitas operasional (`CUSTOMER`, `ORDER`, `DESIGN`, `PAYMENT`, `PENGANTARAN`, `DRIVER`, `STOK`, `USER`). |
| 5 | [`flowchart_bisnis.mmd`](./flowchart_bisnis.mmd) | Flowchart Alur Operasional | Alur end-to-end pemesanan, verifikasi, proofing, cetak, hingga serah terima barang. |
| 6 | [`component_diagram.mmd`](./component_diagram.mmd) | Component Diagram | Arsitektur modular client-side: Presentation, Logic (Alpine.js), Third-Party (Leaflet/CartoDB), & Storage Engine. |
| 7 | [`sequence_diagram.mmd`](./sequence_diagram.mmd) | Sequence Diagram | Siklus sekuensial pemrosesan order, transaksi DP, pelacakan GPS kurir, dan konfirmasi terima. |

---

## 🛠️ Cara Membuka & Merender Diagram

1. **GitHub / GitLab**: Seluruh berkas ini ter-render otomatis di repositori GitHub atau di dalam dokumen utama [`../README.md`](../README.md).
2. **VS Code**: Pasang ekstensi **Markdown Preview Mermaid Support** atau **Mermaid Preview**.
3. **Mermaid Live Editor**: Buka [mermaid.live](https://mermaid.live/) lalu salin-tempel (copy-paste) kode dari berkas `.mmd` yang diinginkan.
4. **Export ke PNG / SVG / PDF**:
   Gunakan Mermaid CLI (`@mermaid-js/mermaid-cli`):
   ```bash
   npx @mermaid-js/mermaid-cli -i diagrams/dfd_level_0.mmd -o diagrams/dfd_level_0.svg
   ```
