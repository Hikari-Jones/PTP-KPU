import type { KodeKlasifikasiArsip, JenisSurat, SuratKeluar } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export const INITIAL_KLASIFIKASI: KodeKlasifikasiArsip[] = [
  { id_klasifikasi: 1, kode_klasifikasi: 'PL.01.1', nama_klasifikasi: 'Perencanaan Pemilu & Pilkada', kategori_utama: 'Penyelenggaraan Pemilu', retensi_aktif_tahun: 2, retensi_inaktif_tahun: 5, hak_akses: 'Internal' },
  { id_klasifikasi: 2, kode_klasifikasi: 'PL.02.1', nama_klasifikasi: 'Pemutakhiran Data Pemilih', kategori_utama: 'Penyelenggaraan Pemilu', retensi_aktif_tahun: 3, retensi_inaktif_tahun: 5, hak_akses: 'Internal' },
  { id_klasifikasi: 3, kode_klasifikasi: 'HR.01.2', nama_klasifikasi: 'Surat Tugas & Kepegawaian', kategori_utama: 'SDM & Kepegawaian', retensi_aktif_tahun: 2, retensi_inaktif_tahun: 5, hak_akses: 'Internal' },
  { id_klasifikasi: 4, kode_klasifikasi: 'HK.01.1', nama_klasifikasi: 'Peraturan & Keputusan KPU', kategori_utama: 'Hukum', retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: 'Publik' },
  { id_klasifikasi: 5, kode_klasifikasi: 'KU.01.3', nama_klasifikasi: 'DIPA & Pertanggungjawaban Keuangan', kategori_utama: 'Keuangan', retensi_aktif_tahun: 5, retensi_inaktif_tahun: 7, hak_akses: 'Internal' },
  { id_klasifikasi: 6, kode_klasifikasi: 'IT.01.1', nama_klasifikasi: 'Data & Infrastruktur IT', kategori_utama: 'Data & Informasi', retensi_aktif_tahun: 2, retensi_inaktif_tahun: 5, hak_akses: 'Internal' },
];

export const INITIAL_JENIS_SURAT: JenisSurat[] = [
  { id_jenis_surat: 1, kode_jenis: 'SD', nama_jenis: 'Surat Dinas', format_nomor: '{nomor_urut}/{kode_klasifikasi}-SD/71/{bulan_romawi}/{tahun}' },
  { id_jenis_surat: 2, kode_jenis: 'ST', nama_jenis: 'Surat Tugas', format_nomor: '{nomor_urut}/{kode_klasifikasi}-ST/71/{bulan_romawi}/{tahun}' },
  { id_jenis_surat: 3, kode_jenis: 'ND', nama_jenis: 'Nota Dinas', format_nomor: '{nomor_urut}/ND-{kode_bagian}/71/{bulan_romawi}/{tahun}' },
  { id_jenis_surat: 4, kode_jenis: 'Kpt', nama_jenis: 'Keputusan KPU', format_nomor: '{nomor_urut}/{kode_klasifikasi}-Kpt/71/{tahun}' },
  { id_jenis_surat: 5, kode_jenis: 'Und', nama_jenis: 'Surat Undangan', format_nomor: '{nomor_urut}/{kode_klasifikasi}-Und/71/{bulan_romawi}/{tahun}' },
];

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('ptp_kpu_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const fetchKlasifikasi = async (): Promise<KodeKlasifikasiArsip[]> => {
  try {
    const res = await fetch(`${API_BASE_URL}/klasifikasi`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Backend API offline, using local initial klasifikasi data', e);
  }
  return INITIAL_KLASIFIKASI;
};

export const fetchJenisSurat = async (): Promise<JenisSurat[]> => {
  try {
    const res = await fetch(`${API_BASE_URL}/jenis-surat`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Backend API offline, using local initial jenis_surat data', e);
  }
  return INITIAL_JENIS_SURAT;
};

export const fetchSuratKeluar = async (): Promise<SuratKeluar[]> => {
  try {
    const res = await fetch(`${API_BASE_URL}/surat-keluar`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Backend API offline, using fallback surat keluar list', e);
  }
  return [];
};

export const createDraftSuratKeluar = async (data: any): Promise<SuratKeluar> => {
  try {
    const res = await fetch(`${API_BASE_URL}/surat-keluar/draft`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Backend API call failed, generating simulated draft', e);
  }
  return {
    id_surat_keluar: Math.floor(Math.random() * 1000) + 1,
    id_pegawai: data.id_pegawai || 1,
    id_bagian: data.id_bagian || 1,
    id_klasifikasi: data.id_klasifikasi || 1,
    id_jenis_surat: data.id_jenis_surat || 1,
    tahun: 2026,
    bulan_romawi: 'X',
    sifat_surat: data.sifat_surat || 'Biasa',
    perihal: data.perihal,
    tujuan_surat: data.tujuan_surat,
    isi_surat: data.isi_surat,
    status: 'draft',
    tanggal_surat: data.tanggal_surat || new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
  };
};

export const finalisasiSuratAtomic = async (id_surat_keluar: number, id_pegawai: number = 1): Promise<SuratKeluar> => {
  try {
    const res = await fetch(`${API_BASE_URL}/surat-keluar/${id_surat_keluar}/finalisasi`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id_pegawai, catatan: 'Finalisasi penerbitan nomor resmi atomic' }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Backend API call failed, generating simulated atomic number', e);
  }
  const nextNum = Math.floor(Math.random() * 50) + 10;
  return {
    id_surat_keluar,
    id_pegawai,
    id_bagian: 1,
    id_klasifikasi: 2,
    id_jenis_surat: 1,
    nomor_urut: nextNum,
    nomor_surat: `${nextNum}/PL.02.1-SD/71/X/2026`,
    tahun: 2026,
    bulan_romawi: 'X',
    sifat_surat: 'Biasa',
    perihal: 'Surat Terbit Resmi',
    tujuan_surat: 'KPU Kabupaten/Kota Se-Sulut',
    status: 'terbit',
    tanggal_surat: new Date().toISOString().split('T')[0],
    tanggal_terbit: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
};

export interface SatkerData {
  id_satker: number;
  kode_satker: string;
  nama_satker: string;
  tingkat: string;
  alamat: string;
  pagu: number;
  realisasi: number;
  persentase: number;
  status_dipa: string;
}

export const fetchSatker = async (): Promise<SatkerData[]> => {
  try {
    const res = await fetch(`${API_BASE_URL}/satker`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Backend API offline, using fallback satker list', e);
  }
  return [];
};

// ----------------- AI Chatbot KIRANA (Local Ollama) -----------------

export interface ChatAttachment {
  name: string;
  content: string;
  mimeType: string;
  sizeStr: string;
}

export interface ChatApiResponse {
  reply: string;
  model_used: string;
  source: 'local_ollama' | 'fallback_agent';
  fileAttachment?: ChatAttachment;
}

export const sendChatMessage = async (message: string, context?: string): Promise<ChatApiResponse> => {
  try {
    const res = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, context }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Backend AI offline, fallback to local agent simulation', e);
  }
  return {
    reply: `Halo! Saya KIRANA Agent. Sistem sedang berjalan dalam mode asistensi lokal. Pertanyaan Anda: "${message}". Untuk menjalankan inferensi kecerdasan penuh, pastikan Ollama berjalan di PC kantor (ollama run qwen2.5).`,
    model_used: 'KIRANA Local Rule Agent',
    source: 'fallback_agent',
  };
};

export const checkAiStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/ai/status`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    return { status: 'offline', message: 'Tidak dapat terhubung ke service AI backend' };
  }
};

// ----------------- Realisasi Anggaran -----------------

export const fetchTahunAnggaran = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/tahun-anggaran`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('fetchTahunAnggaran failed', e);
  }
  return [];
};

export const fetchAkunAnggaran = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/akun-anggaran`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('fetchAkunAnggaran failed', e);
  }
  return [];
};

export const createRealisasiAnggaranApi = async (payload: any) => {
  try {
    const res = await fetch(`${API_BASE_URL}/realisasi-anggaran`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('createRealisasiAnggaranApi failed', e);
  }
  return null;
};
