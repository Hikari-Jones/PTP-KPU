import { consumeChatStream } from './chatStream';
import type { KodeKlasifikasiArsip, JenisSurat, SuratKeluar } from '../types';
import type {
  BagianResponse,
  TahunAnggaranCreatePayload,
  TahunAnggaranUpdatePayload,
  TahunAnggaranResponse,
  TahunAnggaranListResponse,
  AkunAnggaranCreatePayload,
  AkunAnggaranUpdatePayload,
  AkunAnggaranResponse,
  AkunAnggaranListResponse,
  PaguAnggaranResponse,
  PaguAnggaranListResponse,
  RealisasiAnggaranCreatePayload,
  RealisasiAnggaranResponse,
  RealisasiAnggaranListResponse,
  DashboardSummaryResponse,
  MonthlyReportResponse,
  RevisiAnggaranCreatePayload,
  RevisiAnggaranResponse,
  RevisiAnggaranListResponse,
  FileUploadResponse,
} from '../app/components/RealisasiAnggaran/types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

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
  const res = await fetch(`${API_BASE_URL}/klasifikasi`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Gagal memuat data (${res.status})`);
  }
  return res.json();
};

export const fetchJenisSurat = async (): Promise<JenisSurat[]> => {
  const res = await fetch(`${API_BASE_URL}/jenis-surat`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Gagal memuat data (${res.status})`);
  }
  return res.json();
};

export const fetchSuratKeluar = async (): Promise<SuratKeluar[]> => {
  const res = await fetch(`${API_BASE_URL}/surat-keluar`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Gagal memuat data (${res.status})`);
  }
  return res.json();
};

export const createDraftSuratKeluar = async (data: unknown): Promise<SuratKeluar> => {
  const res = await fetch(`${API_BASE_URL}/surat-keluar/draft`, {method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data)});
  if (!res.ok) throw new Error((await res.json()).detail || 'Gagal menyimpan draft');
  return res.json();
};
export const finalisasiSuratAtomic = async (id: number, _pegawai?: number): Promise<SuratKeluar> => {
  const res = await fetch(`${API_BASE_URL}/surat-keluar/${id}/finalisasi`, {method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({})});
  if (!res.ok) throw new Error((await res.json()).detail || 'Gagal menerbitkan nomor');
  return res.json();
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
  const res = await fetch(`${API_BASE_URL}/satker/`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Gagal memuat data (${res.status})`);
  }
  return res.json();
};

// ----------------- AI Chatbot KIRANA (model lokal di backend) -----------------

export interface ChatAttachment {
  name: string;
  content: string;
  mimeType: string;
  sizeStr: string;
}

export interface ChatApiResponse {
  reply: string;
  model_used: string;
  source: 'local_model' | 'fallback_agent';
  fileAttachment?: ChatAttachment;
}

export const sendChatMessage = async (message: string, context?: string): Promise<ChatApiResponse> => {
  const res = await fetch(`${API_BASE_URL}/ai/chat`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({message, context}) });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Asisten tidak tersedia (${res.status})`);
  }
  return res.json();
};

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'status'; text: string }
  | { type: 'reset' }
  | { type: 'error'; text: string }
  | { type: 'done'; model: string; source: 'local_model' | 'fallback_agent'; used_database: boolean };

/**
 * Ask KIRANA and receive the answer piece by piece (Server-Sent Events).
 * Abort the signal to stop the generation. Throws if the backend is unreachable.
 */
export const streamChatMessage = async (
  message: string,
  history: ChatTurn[],
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, history }),
    signal,
  });
  if (!res.ok || !res.body) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Layanan AI mengembalikan status ${res.status}`);
  }

  await consumeChatStream(res.body, onEvent);
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
    const res = await fetch(`${API_BASE_URL}/tahun-anggaran/`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('fetchTahunAnggaran failed', e);
  }
  return [];
};

export const fetchAkunAnggaran = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/akun-anggaran/`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('fetchAkunAnggaran failed', e);
  }
  return [];
};

export const createRealisasiAnggaranApi = async (payload: any) => {
  try {
    const res = await fetch(`${API_BASE_URL}/realisasi-anggaran/`, {
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

// =========================================================
// MODULAR API CLIENTS (PHASE 7 - 11 INTEGRATION)
// =========================================================

export const bagianApi = {
  getAll: async (params?: { skip?: number; limit?: number }): Promise<BagianResponse[]> => {
    const query = new URLSearchParams();
    if (params?.skip !== undefined) query.append('skip', String(params.skip));
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    const qs = query.toString();
    const url = `${API_BASE_URL}/bagian/${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat daftar bagian (${res.status})`);
    return await res.json();
  },
};

export const tahunAnggaranApi = {
  getAll: async (params?: {
    search?: string;
    status?: 'draft' | 'active' | 'closed';
    skip?: number;
    limit?: number;
  }): Promise<TahunAnggaranListResponse> => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.skip !== undefined) query.append('skip', String(params.skip));
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    const qs = query.toString();
    const url = `${API_BASE_URL}/tahun-anggaran/${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat tahun anggaran (${res.status})`);
    return await res.json();
  },
  getById: async (id: number): Promise<TahunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/tahun-anggaran/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat detail tahun anggaran (${res.status})`);
    return await res.json();
  },
  create: async (payload: TahunAnggaranCreatePayload): Promise<TahunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/tahun-anggaran/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal membuat tahun anggaran (${res.status})`);
    }
    return await res.json();
  },
  update: async (id: number, payload: TahunAnggaranUpdatePayload): Promise<TahunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/tahun-anggaran/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal memperbarui tahun anggaran (${res.status})`);
    }
    return await res.json();
  },
  delete: async (id: number): Promise<TahunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/tahun-anggaran/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal menghapus tahun anggaran (${res.status})`);
    }
    return await res.json();
  },
};

export const akunAnggaranApi = {
  getAll: async (params?: {
    kode_akun?: string;
    nama_akun?: string;
    id_bagian?: number;
    jenis_belanja?: string;
    program?: string;
    sub_program?: string;
    status?: 'active' | 'inactive';
    search?: string;
    skip?: number;
    limit?: number;
  }): Promise<AkunAnggaranListResponse> => {
    const query = new URLSearchParams();
    if (params?.kode_akun) query.append('kode_akun', params.kode_akun);
    if (params?.nama_akun) query.append('nama_akun', params.nama_akun);
    if (params?.id_bagian !== undefined) query.append('id_bagian', String(params.id_bagian));
    if (params?.jenis_belanja) query.append('jenis_belanja', params.jenis_belanja);
    if (params?.program) query.append('program', params.program);
    if (params?.sub_program) query.append('sub_program', params.sub_program);
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.skip !== undefined) query.append('skip', String(params.skip));
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    const qs = query.toString();
    const url = `${API_BASE_URL}/akun-anggaran/${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat akun anggaran (${res.status})`);
    return await res.json();
  },
  getById: async (id: number): Promise<AkunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/akun-anggaran/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat detail akun anggaran (${res.status})`);
    return await res.json();
  },
  create: async (payload: AkunAnggaranCreatePayload): Promise<AkunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/akun-anggaran/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal membuat akun anggaran (${res.status})`);
    }
    return await res.json();
  },
  update: async (id: number, payload: AkunAnggaranUpdatePayload): Promise<AkunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/akun-anggaran/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal memperbarui akun anggaran (${res.status})`);
    }
    return await res.json();
  },
  delete: async (id: number): Promise<AkunAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/akun-anggaran/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal menghapus akun anggaran (${res.status})`);
    }
    return await res.json();
  },
};

export const paguAnggaranApi = {
  getAll: async (params?: {
    id_tahun_anggaran?: number;
    id_akun_anggaran?: number;
    id_bagian?: number;
    status_tahun?: 'draft' | 'active' | 'closed';
    search?: string;
    skip?: number;
    limit?: number;
  }): Promise<PaguAnggaranListResponse> => {
    const query = new URLSearchParams();
    if (params?.id_tahun_anggaran !== undefined) query.append('id_tahun_anggaran', String(params.id_tahun_anggaran));
    if (params?.id_akun_anggaran !== undefined) query.append('id_akun_anggaran', String(params.id_akun_anggaran));
    if (params?.id_bagian !== undefined) query.append('id_bagian', String(params.id_bagian));
    if (params?.status_tahun) query.append('status_tahun', params.status_tahun);
    if (params?.search) query.append('search', params.search);
    if (params?.skip !== undefined) query.append('skip', String(params.skip));
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    const qs = query.toString();
    const url = `${API_BASE_URL}/pagu-anggaran/${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat pagu anggaran (${res.status})`);
    return await res.json();
  },
};

export const realisasiAnggaranApi = {
  getAll: async (params?: {
    id_pagu?: number;
    id_tahun_anggaran?: number;
    id_bagian?: number;
    id_akun_anggaran?: number;
    bulan?: number;
    status?: 'draft' | 'submitted' | 'verified' | 'rejected';
    search?: string;
    tanggal_mulai?: string;
    tanggal_selesai?: string;
    skip?: number;
    limit?: number;
  }): Promise<RealisasiAnggaranListResponse> => {
    const query = new URLSearchParams();
    if (params?.id_pagu !== undefined) query.append('id_pagu', String(params.id_pagu));
    if (params?.id_tahun_anggaran !== undefined) query.append('id_tahun_anggaran', String(params.id_tahun_anggaran));
    if (params?.id_bagian !== undefined) query.append('id_bagian', String(params.id_bagian));
    if (params?.id_akun_anggaran !== undefined) query.append('id_akun_anggaran', String(params.id_akun_anggaran));
    if (params?.bulan !== undefined) query.append('bulan', String(params.bulan));
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.tanggal_mulai) query.append('tanggal_mulai', params.tanggal_mulai);
    if (params?.tanggal_selesai) query.append('tanggal_selesai', params.tanggal_selesai);
    if (params?.skip !== undefined) query.append('skip', String(params.skip));
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    const qs = query.toString();
    const url = `${API_BASE_URL}/realisasi-anggaran/${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat realisasi anggaran (${res.status})`);
    return await res.json();
  },
  getAllPages: async (params?: {
    id_pagu?: number;
    id_tahun_anggaran?: number;
    id_bagian?: number;
    id_akun_anggaran?: number;
    bulan?: number;
    status?: 'draft' | 'submitted' | 'verified' | 'rejected';
    search?: string;
    tanggal_mulai?: string;
    tanggal_selesai?: string;
    batchSize?: number;
    maxPages?: number;
  }): Promise<RealisasiAnggaranResponse[]> => {
    const batchLimit = Math.min(Math.max(params?.batchSize || 500, 1), 500);
    const maxSafetyPages = params?.maxPages || 50; // Safeguard up to 25,000 transactions
    const allItems: RealisasiAnggaranResponse[] = [];
    let skip = 0;
    let pageCount = 0;
    let totalItems = Infinity;

    while (skip < totalItems && pageCount < maxSafetyPages) {
      pageCount++;
      const res = await realisasiAnggaranApi.getAll({
        id_pagu: params?.id_pagu,
        id_tahun_anggaran: params?.id_tahun_anggaran,
        id_bagian: params?.id_bagian,
        id_akun_anggaran: params?.id_akun_anggaran,
        bulan: params?.bulan,
        status: params?.status,
        search: params?.search,
        tanggal_mulai: params?.tanggal_mulai,
        tanggal_selesai: params?.tanggal_selesai,
        skip,
        limit: batchLimit,
      });

      if (typeof res.total === 'number') {
        totalItems = res.total;
      }

      const items = res.items || [];
      if (items.length === 0 && skip < totalItems && totalItems !== Infinity) {
        throw new Error(`Data tidak konsisten: server melaporkan total ${totalItems} data tetapi halaman ke-${pageCount} kosong.`);
      }

      allItems.push(...items);

      if (items.length < batchLimit || items.length === 0) {
        break;
      }

      skip += items.length;
    }

    if (pageCount >= maxSafetyPages && skip < totalItems && totalItems !== Infinity) {
      throw new Error(`Batas pengunduhan halaman tercapai (${maxSafetyPages} halaman). Silakan persempit filter data.`);
    }

    return allItems;
  },
  getById: async (id: number): Promise<RealisasiAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/realisasi-anggaran/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat detail realisasi (${res.status})`);
    return await res.json();
  },
  createDraft: async (payload: RealisasiAnggaranCreatePayload): Promise<RealisasiAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/realisasi-anggaran/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal menyimpan transaksi realisasi (${res.status})`);
    }
    return await res.json();
  },
  update: async (id: number, payload: Partial<RealisasiAnggaranCreatePayload>): Promise<RealisasiAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/realisasi-anggaran/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal memperbarui transaksi realisasi (${res.status})`);
    }
    return await res.json();
  },
  delete: async (id: number): Promise<RealisasiAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/realisasi-anggaran/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal menghapus transaksi realisasi (${res.status})`);
    }
    return await res.json();
  },
};

export const dashboardAnggaranApi = {
  getSummary: async (params?: {
    id_tahun_anggaran?: number;
    id_akun_anggaran?: number;
    id_bagian?: number;
    bulan?: number;
  }): Promise<DashboardSummaryResponse> => {
    const query = new URLSearchParams();
    if (params?.id_tahun_anggaran !== undefined) query.append('id_tahun_anggaran', String(params.id_tahun_anggaran));
    if (params?.id_akun_anggaran !== undefined) query.append('id_akun_anggaran', String(params.id_akun_anggaran));
    if (params?.id_bagian !== undefined) query.append('id_bagian', String(params.id_bagian));
    if (params?.bulan !== undefined) query.append('bulan', String(params.bulan));
    const qs = query.toString();
    const url = `${API_BASE_URL}/anggaran/summary${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat ringkasan anggaran (${res.status})`);
    return await res.json();
  },
  getMonthlyReport: async (params?: {
    id_tahun_anggaran?: number;
    id_akun_anggaran?: number;
    id_bagian?: number;
  }): Promise<MonthlyReportResponse> => {
    const query = new URLSearchParams();
    if (params?.id_tahun_anggaran !== undefined) query.append('id_tahun_anggaran', String(params.id_tahun_anggaran));
    if (params?.id_akun_anggaran !== undefined) query.append('id_akun_anggaran', String(params.id_akun_anggaran));
    if (params?.id_bagian !== undefined) query.append('id_bagian', String(params.id_bagian));
    const qs = query.toString();
    const url = `${API_BASE_URL}/anggaran/monthly-report${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat laporan bulanan anggaran (${res.status})`);
    return await res.json();
  },
};

export const revisiAnggaranApi = {
  getAll: async (params?: {
    id_pagu?: number;
    id_tahun_anggaran?: number;
    skip?: number;
    limit?: number;
  }): Promise<RevisiAnggaranListResponse> => {
    const query = new URLSearchParams();
    if (params?.id_pagu !== undefined) query.append('id_pagu', String(params.id_pagu));
    if (params?.id_tahun_anggaran !== undefined) query.append('id_tahun_anggaran', String(params.id_tahun_anggaran));
    if (params?.skip !== undefined) query.append('skip', String(params.skip));
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    const qs = query.toString();
    const url = `${API_BASE_URL}/revisi-anggaran/${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat riwayat revisi anggaran (${res.status})`);
    return await res.json();
  },
  getById: async (id_revisi: number): Promise<RevisiAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/revisi-anggaran/${id_revisi}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Gagal memuat detail revisi anggaran (${res.status})`);
    return await res.json();
  },
  create: async (payload: RevisiAnggaranCreatePayload): Promise<RevisiAnggaranResponse> => {
    const res = await fetch(`${API_BASE_URL}/revisi-anggaran/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Terjadi kesalahan pada server' }));
      throw new Error(err.detail || `Gagal mengeksekusi revisi anggaran (${res.status})`);
    }
    return await res.json();
  },
};

export interface LoginPayload {
  nip: string;
  password: string;
}

export interface UserProfileResponse {
  id_pegawai: number;
  name: string;
  nip: string;
  email: string;
  role: string;
  jabatan: string;
  subbagian: string;
  id_bagian?: number | null;
}

export interface LoginApiResponse {
  access_token: string;
  token_type: string;
  user: UserProfileResponse;
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<LoginApiResponse> => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Gagal terhubung ke server autentikasi' }));
      throw new Error(err.detail || `Login gagal (${res.status})`);
    }

    return await res.json();
  },
  getMe: async (): Promise<UserProfileResponse> => {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('ptp_kpu_token');
        localStorage.removeItem('ptp_kpu_user');
      }
      const err = await res.json().catch(() => ({ detail: 'Sesi kedaluwarsa atau tidak valid' }));
      throw new Error(err.detail || `Gagal memverifikasi identitas pengguna (${res.status})`);
    }

    return await res.json();
  },
};

export const filesApi = {
  upload: async (file: File, category: string = 'realisasi'): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);

    const token = localStorage.getItem('ptp_kpu_token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Gagal mengunggah berkas ke server' }));
      throw new Error(err.detail || `Upload berkas gagal (${res.status})`);
    }

    return await res.json();
  },
  getDownloadUrl: (fileId: number): string => {
    return `${API_BASE_URL}/files/${fileId}`;
  },
};
