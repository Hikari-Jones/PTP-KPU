import { useEffect, useState } from 'react'
import { request, download, message } from '../../../services/operations'
import { showToast as notify } from '../../../services/activity'
import { Workspace, field, button, useOperation } from '../ui/operations'
import { CharLimit } from '../ui/CharLimit'
import {
  Archive, ShieldCheck, History, HardDriveDownload, RefreshCw,
  FileText, CheckCircle2, Trash2, Plus,
} from 'lucide-react'

interface Backup {
  name: string
  size: number
}

interface SiapSusutDoc {
  id_dokumen: number
  nama_dokumen: string
  nomor_dokumen: string
  kode_klasifikasi?: string | null
  tanggal_dokumen: string
  nasib_akhir?: string | null
  arsip_vital?: boolean
  legal_hold?: boolean
}

interface PenyusutanItem {
  id: number
  nomor_ba: string
  jenis_penyusutan: string
  status: string
  alasan: string
  dokumen_ids: number[]
  nama_pengaju?: string | null
  nama_penyetuju?: string | null
  tanggal_eksekusi?: string | null
  created_at: string
}

interface AuthorityGrantItem {
  id: number
  pegawai_id: number
  nama_pegawai?: string | null
  action: string
  jabatan_penugasan?: string | null
  document_reference: string
  valid_from: string
  valid_until: string
  is_active: boolean
}

interface AuditLogItem {
  id: number
  id_dokumen?: number | null
  nomor_dokumen?: string | null
  nama_dokumen?: string | null
  aksi: string
  actor_nama?: string | null
  detail?: string | null
  created_at: string
}

interface PegawaiOpt {
  id_pegawai: number
  nama: string
  nip: string
}

type AdminTab = 'penyusutan' | 'otoritas' | 'audit' | 'cadangan'

export function ArsipAdminView({ theme }: { theme: 'light' | 'dark' }) {
  const [tab, setTab] = useState<AdminTab>('penyusutan')
  const { busy, error, run, setError } = useOperation()

  // Tab 1: Penyusutan JRA
  const [siapSusut, setSiapSusut] = useState<SiapSusutDoc[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [jenisSusut, setJenisSusut] = useState<'musnah' | 'serah' | 'pindah'>('musnah')
  const [alasanSusut, setAlasanSusut] = useState('')
  const [penyusutanList, setPenyusutanList] = useState<PenyusutanItem[]>([])

  // Tab 2: Otoritas Penugasan (SK)
  const [grants, setGrants] = useState<AuthorityGrantItem[]>([])
  const [pegawaiList, setPegawaiList] = useState<PegawaiOpt[]>([])
  const [grantForm, setGrantForm] = useState({
    pegawai_id: '',
    action: 'verify_budget',
    jabatan_penugasan: '',
    document_reference: '',
    valid_from: new Date().toLocaleDateString('en-CA'),
    valid_until: `${new Date().getFullYear()}-12-31`,
  })

  // Tab 3: Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [auditFilter, setAuditFilter] = useState('')

  // Tab 4: Backups
  const [backups, setBackups] = useState<Backup[]>([])

  const loadPenyusutan = async () => {
    const [docs, list] = await Promise.all([
      request<SiapSusutDoc[]>('/arsip/?status_retensi=siap_susut&limit=200'),
      request<PenyusutanItem[]>('/arsip/penyusutan'),
    ])
    setSiapSusut(docs)
    setPenyusutanList(list)
  }

  const loadGrants = async () => {
    const [g, p] = await Promise.all([
      request<AuthorityGrantItem[]>('/authority-grants/'),
      pegawaiList.length ? Promise.resolve(pegawaiList) : request<PegawaiOpt[]>('/pegawai/?limit=500'),
    ])
    setGrants(g)
    if (!pegawaiList.length) setPegawaiList(p)
  }

  const loadAudit = async (aksi?: string) => {
    const q = aksi ? `?aksi=${encodeURIComponent(aksi)}&limit=100` : '?limit=100'
    setAuditLogs(await request<AuditLogItem[]>(`/arsip/audit-logs${q}`))
  }

  const loadBackups = async () => {
    setBackups(await request<Backup[]>('/backups'))
  }

  useEffect(() => {
    setError(null)
    if (tab === 'penyusutan') loadPenyusutan().catch((e) => setError(message(e)))
    else if (tab === 'otoritas') loadGrants().catch((e) => setError(message(e)))
    else if (tab === 'audit') loadAudit(auditFilter).catch((e) => setError(message(e)))
    else if (tab === 'cadangan') loadBackups().catch((e) => setError(message(e)))
  }, [tab, auditFilter])

  const tabBtn = (id: AdminTab, label: string, Icon: typeof Archive) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
        tab === id
          ? 'bg-red-600 text-white shadow-xs'
          : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  )

  return (
    <Workspace
      theme={theme}
      category="Administrasi"
      title="Tata Kelola Arsip, Otoritas & Cadangan"
      description="Penyusutan JRA (PKPU 17/2023), Manajemen SK Penugasan Pejabat, Jejak Audit Arsip, dan Cadangan Sistem"
    >
      <div className="flex flex-wrap gap-2">
        {tabBtn('penyusutan', 'Penyusutan JRA', Archive)}
        {tabBtn('otoritas', 'SK Penugasan (Otoritas)', ShieldCheck)}
        {tabBtn('audit', 'Log Audit Arsip', History)}
        {tabBtn('cadangan', 'Cadangan Sistem', HardDriveDownload)}
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
          {error}
        </div>
      )}

      {/* TAB 1: PENYUSUTAN JRA */}
      {tab === 'penyusutan' && (
        <div className="space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-black/20">
            <div>
              <h3 className="font-bold text-sm">Evaluasi Jadwal Retensi Arsip (PKPU 17/2023)</h3>
              <p className="text-slate-500 mt-0.5">Hitung ulang status Aktif / Inaktif / Siap Susut untuk seluruh dokumen berklasifikasi.</p>
            </div>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await request<{ checked: number; updated: number }>('/arsip/rehitung-retensi', 'POST')
                  notify('success', `JRA diperiksa: ${res.checked} dokumen, ${res.updated} diperbarui`)
                  await loadPenyusutan()
                })
              }
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Hitung Ulang JRA</span>
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
            <h3 className="font-bold text-sm">Arsip Siap Susut ({siapSusut.length})</h3>
            {siapSusut.length === 0 ? (
              <p className="text-slate-500 py-3">Belum ada dokumen yang melewati masa retensi inaktif.</p>
            ) : (
              <>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {siapSusut.map((d) => {
                    const blocked = Boolean(d.arsip_vital || d.legal_hold || (jenisSusut === 'musnah' && d.nasib_akhir === 'permanen'))
                    return (
                      <label key={d.id_dokumen} className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-white/10 ${blocked ? 'opacity-50' : 'cursor-pointer'}`}>
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={blocked}
                            checked={selectedIds.includes(d.id_dokumen)}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked ? [...prev, d.id_dokumen] : prev.filter((id) => id !== d.id_dokumen)
                              )
                            }
                          />
                          <span className="font-semibold">{d.nama_dokumen}</span>
                          <span className="font-mono text-[11px] text-slate-500">({d.nomor_dokumen})</span>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {d.kode_klasifikasi || '-'} · {d.nasib_akhir || 'musnah'}
                          {d.arsip_vital ? ' · VITAL' : ''}
                          {d.legal_hold ? ' · LEGAL HOLD' : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                  <select
                    className={field}
                    value={jenisSusut}
                    onChange={(e) => {
                      setJenisSusut(e.target.value as 'musnah' | 'serah' | 'pindah')
                      setSelectedIds([])
                    }}
                  >
                    <option value="musnah">Usul Musnah</option>
                    <option value="serah">Usul Serah (ANRI / Arsip Statis)</option>
                    <option value="pindah">Usul Pindah (Depo Inaktif)</option>
                  </select>
                  <div className="sm:col-span-2 space-y-1">
                    <input
                      className={field}
                      maxLength={500}
                      placeholder="Dasar / Alasan penyusutan (min. 5 karakter)..."
                      value={alasanSusut}
                      onChange={(e) => setAlasanSusut(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <CharLimit value={alasanSusut} max={500} />
                    </div>
                  </div>
                </div>
                <button
                  className={button}
                  disabled={busy || selectedIds.length === 0 || alasanSusut.trim().length < 5}
                  onClick={() =>
                    void run(async () => {
                      await request('/arsip/penyusutan', 'POST', {
                        jenis_penyusutan: jenisSusut,
                        alasan: alasanSusut.trim(),
                        dokumen_ids: selectedIds,
                      })
                      setSelectedIds([])
                      setAlasanSusut('')
                      notify('success', 'Usulan penyusutan dibuat')
                      await loadPenyusutan()
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Daftar Usul ({selectedIds.length} dokumen)</span>
                </button>
              </>
            )}
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
            <h3 className="font-bold text-sm">Daftar Usul & Berita Acara Penyusutan</h3>
            {penyusutanList.length === 0 ? (
              <p className="text-slate-500">Belum ada riwayat usulan penyusutan.</p>
            ) : (
              <div className="space-y-2">
                {penyusutanList.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">
                        {p.nomor_ba} · <span className="uppercase text-red-600 dark:text-red-400">{p.jenis_penyusutan}</span> · Status: {p.status}
                      </p>
                      <p className="text-slate-500 mt-0.5">{p.dokumen_ids.length} dokumen · {p.alasan}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.status === 'diajukan' && (
                        <button
                          className={`${button} !px-3 !py-1.5 !text-xs`}
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Setujui dan eksekusi penyusutan ${p.nomor_ba}?`)) {
                              void run(async () => {
                                await request(`/arsip/penyusutan/${p.id}/eksekusi`, 'POST', { catatan_persetujuan: 'Disetujui Administrator' })
                                notify('success', `Penyusutan ${p.nomor_ba} dieksekusi`)
                                await loadPenyusutan()
                              })
                            }
                          }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Eksekusi
                        </button>
                      )}
                      <button
                        className={`${button} !px-3 !py-1.5 !text-xs !bg-slate-700 hover:!bg-slate-800`}
                        disabled={busy}
                        onClick={() => void run(() => download(`/arsip/penyusutan/${p.id}/berita-acara`, `${p.nomor_ba.replace(/\//g, '_')}.pdf`))}
                      >
                        <FileText className="w-3.5 h-3.5" /> Berita Acara PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SK PENUGASAN / AUTHORITY GRANTS */}
      {tab === 'otoritas' && (
        <div className="space-y-4 text-xs">
          <form
            className="p-4 rounded-xl border border-slate-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!grantForm.pegawai_id || !grantForm.document_reference.trim()) return
              void run(async () => {
                await request('/authority-grants/', 'POST', {
                  pegawai_id: Number(grantForm.pegawai_id),
                  action: grantForm.action,
                  jabatan_penugasan: grantForm.jabatan_penugasan.trim() || null,
                  document_reference: grantForm.document_reference.trim(),
                  valid_from: grantForm.valid_from,
                  valid_until: grantForm.valid_until,
                })
                setGrantForm({ ...grantForm, jabatan_penugasan: '', document_reference: '' })
                notify('success', 'SK Penugasan berhasil ditambahkan')
                await loadGrants()
              })
            }}
          >
            <select required className={field} value={grantForm.pegawai_id} onChange={(e) => setGrantForm({ ...grantForm, pegawai_id: e.target.value })}>
              <option value="">Pilih Pegawai Penerima Otoritas *</option>
              {pegawaiList.map((p) => (
                <option key={p.id_pegawai} value={p.id_pegawai}>{p.nama} ({p.nip})</option>
              ))}
            </select>
            <select className={field} value={grantForm.action} onChange={(e) => setGrantForm({ ...grantForm, action: e.target.value })}>
              <option value="verify_budget">verify_budget (Verifikator Realisasi / PPK / PPSPM)</option>
              <option value="sign_letter">sign_letter (Penandatangan Surat Dinas)</option>
              <option value="access_secret_archive">access_secret_archive (Akses Arsip Rahasia & Audit)</option>
              <option value="approve_disposal">approve_disposal (Panitia Penyusutan Arsip)</option>
            </select>
            <div className="space-y-1">
              <input required maxLength={200} className={field} placeholder="Nomor SK Penugasan *" value={grantForm.document_reference} onChange={(e) => setGrantForm({ ...grantForm, document_reference: e.target.value })} />
              <div className="flex justify-end"><CharLimit value={grantForm.document_reference} max={200} /></div>
            </div>
            <div className="space-y-1">
              <input maxLength={200} className={field} placeholder="Jabatan Penugasan (mis. PPK / PPSPM)" value={grantForm.jabatan_penugasan} onChange={(e) => setGrantForm({ ...grantForm, jabatan_penugasan: e.target.value })} />
              <div className="flex justify-end"><CharLimit value={grantForm.jabatan_penugasan} max={200} /></div>
            </div>
            <input type="date" required className={field} value={grantForm.valid_from} onChange={(e) => setGrantForm({ ...grantForm, valid_from: e.target.value })} />
            <input type="date" required className={field} value={grantForm.valid_until} onChange={(e) => setGrantForm({ ...grantForm, valid_until: e.target.value })} />
            <div className="sm:col-span-2 lg:col-span-3">
              <button className={button} disabled={busy}>
                <Plus className="w-3.5 h-3.5" /> Simpan SK Penugasan
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {grants.map((g) => (
              <div key={g.id} className="p-3 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {g.nama_pegawai || `Pegawai #${g.pegawai_id}`} · <span className="font-mono text-red-600 dark:text-red-400">{g.action}</span>
                    {!g.is_active && <span className="ml-2 text-slate-400">(Dicabut)</span>}
                  </p>
                  <p className="text-slate-500">
                    SK: {g.document_reference}{g.jabatan_penugasan ? ` (${g.jabatan_penugasan})` : ''} · Berlaku {g.valid_from} s.d. {g.valid_until}
                  </p>
                </div>
                {g.is_active && (
                  <button
                    className="text-xs font-bold text-red-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    onClick={() =>
                      void run(async () => {
                        await request(`/authority-grants/${g.id}`, 'DELETE')
                        notify('info', 'Otoritas SK dicabut')
                        await loadGrants()
                      })
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Cabut
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: LOG AUDIT ARSIP */}
      {tab === 'audit' && (
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <select className={`${field} !w-auto`} value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)}>
              <option value="">Semua Aksi Audit</option>
              <option value="create">create</option>
              <option value="view">view</option>
              <option value="download">download</option>
              <option value="update">update</option>
              <option value="grant_access">grant_access</option>
              <option value="revoke_access">revoke_access</option>
              <option value="new_version">new_version</option>
              <option value="legal_hold">legal_hold</option>
              <option value="permanent_delete">permanent_delete</option>
              <option value="disposal_execute">disposal_execute</option>
            </select>
            <button className={`${button} !px-3 !py-1.5 !text-xs`} onClick={() => void run(() => loadAudit(auditFilter))}>
              <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang
            </button>
          </div>
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3 rounded-lg border border-slate-200 dark:border-white/10">
                <div className="flex justify-between gap-2">
                  <span className="font-bold uppercase text-[10px] text-red-600 dark:text-red-400">{log.aksi}</span>
                  <span className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleString('id-ID')}</span>
                </div>
                <p className="font-semibold mt-0.5">{log.nama_dokumen || '-'} ({log.nomor_dokumen || '-'})</p>
                <p className="text-slate-500">{log.actor_nama || 'Sistem'} — {log.detail || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CADANGAN SISTEM */}
      {tab === 'cadangan' && (
        <div className="space-y-3 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            Cadangan berisi dump MySQL, berkas upload, dan checksum SHA-256. Simpan salinan unduhan pada media terpisah.
          </p>
          <p className="text-slate-500">
            Pemulihan dilakukan administrator server ke database kosong terpisah menggunakan <code>restore_backup.py</code>. Uji hasilnya sebelum mengganti database operasional.
          </p>
          <button
            className={button}
            disabled={busy}
            onClick={() => void run(async () => { await request('/backups', 'POST'); await loadBackups() })}
          >
            {busy ? 'Memproses…' : 'Buat Cadangan Baru'}
          </button>
          <div className="space-y-2">
            {backups.map((x) => (
              <div className="border border-slate-200 dark:border-white/10 rounded-xl p-3 flex items-center justify-between" key={x.name}>
                <span className="font-mono">{x.name} · {(x.size / 1048576).toFixed(2)} MB</span>
                <button className={button} disabled={busy} onClick={() => void run(() => download(`/backups/${x.name}`, x.name))}>
                  Unduh
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Workspace>
  )
}
