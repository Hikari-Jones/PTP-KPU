"""KIRANA chat agent: the local model plus a read-only database tool.

`run_agent()` is an async generator of events:

    {"type": "token",  "text": "..."}   piece of the answer, as it is generated
    {"type": "status", "text": "..."}   what the agent is doing (e.g. reading the DB)
    {"type": "reset"}                   discard the text sent so far (it was only a
                                        preamble before a database lookup)
    {"type": "done",   "model": "...", "used_database": bool}

The model decides by itself whether a question needs data. If it does, it emits
a `<tool_call>` with a SQL query (the tool-calling format Qwen 2.5 was trained
on), the query is validated and run by `kirana_db`, and the rows are fed back
so the model can answer from real data.
"""

import asyncio
import json
import re
import threading
from contextlib import aclosing
from datetime import date
from typing import Any, AsyncIterator, Dict, List, Optional, Sequence

from app.services import kirana_db

MAX_TOOL_ROUNDS = 3  # queries per question (lets the model fix a failed query)
MAX_HISTORY_MESSAGES = 6
MAX_HISTORY_CHARS = 900  # per past message (keeps 3B context focused on current turn)

TOOL_OPEN, TOOL_CLOSE = "<tool_call>", "</tool_call>"

_TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "query_database",
        "description": (
            "Menjalankan satu query SELECT (MySQL, hanya baca) pada database PTP-KPU "
            "dan mengembalikan barisnya. Gunakan setiap kali jawaban membutuhkan data "
            "nyata: surat, arsip, pegawai, bagian, pagu, atau realisasi anggaran. "
            "JANGAN dipakai untuk menyusun draf surat/nota dinas, menjelaskan, atau "
            "menjawab pertanyaan umum; tulis langsung jawabannya."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "Satu pernyataan SELECT MySQL."}
            },
            "required": ["sql"],
        },
    },
}

_PERSONA = """\
Anda adalah KIRANA, asisten AI Sistem Informasi PTP-KPU (Pengelolaan Tata Persuratan, Arsip, dan Realisasi Anggaran) KPU Provinsi Sulawesi Utara.

Anda asisten serba bisa: menjawab pertanyaan umum, menjelaskan, merangkum, menerjemahkan, bertukar pikiran, dan menulis. Keahlian khusus Anda:
- Menyusun draf surat dinas, nota dinas, surat tugas, undangan, dan keputusan sesuai tata persuratan instansi pemerintah.
- Menjawab pertanyaan tentang data di sistem (surat keluar, arsip, pegawai, anggaran) dengan membaca database.
- Menjelaskan kode klasifikasi arsip, alur disposisi, dan administrasi perkantoran KPU.

Cara menjawab:
- Permintaan membuat, menyusun, atau menulis draf (nota dinas, surat, undangan, surat tugas) dijawab LANGSUNG dengan draf, TANPA query_database, walaupun menyebut nama bagian atau pejabat.
- Gunakan bahasa pengguna; bawaan bahasa Indonesia yang baku, jelas, dan ramah. Langsung ke inti, tidak bertele-tele.
- Jika pengguna menyapa (seperti "halo", "hai", "selamat pagi"), balas dengan ramah, alami, dan singkat sebagai KIRANA (asisten AI PTP-KPU Sulut) tanpa kalimat kaku seperti "Siapa yang mau berkomunikasi?".
- Gunakan Markdown bila membantu: daftar, **tebal**, dan tabel untuk data berbaris.
- Tulis nominal uang sebagai Rupiah dengan pemisah ribuan, contoh Rp 1.250.000.
- Jangan pernah mengarang data. Angka, nama, nomor surat, dan isi dokumen hanya boleh berasal dari hasil query_database. Jika hasilnya kosong atau query gagal, katakan apa adanya.
- Jika pertanyaan membutuhkan data sistem, LANGSUNG panggil query_database tanpa kalimat pembuka seperti "mohon tunggu". Jangan pernah menulis SQL atau tanda seperti [hasil query] di dalam jawaban; jalankan query-nya, lalu jawab dengan hasilnya.
- Setiap pertanyaan baru yang membutuhkan data sistem WAJIB memanggil query_database baru, meskipun percakapan sebelumnya sudah membahas topik lain. Jangan pernah menyalin, menebak, atau mencampur angka/nama dari topik sebelumnya.
- Semua draf dan saran AI perlu pemeriksaan manusia; bukan keputusan resmi.
- Data yang tersedia dibatasi oleh hak akses pengguna.
- Anda hanya bisa membaca data. Permintaan mengubah atau menghapus data ditolak dengan sopan dan diarahkan ke modul terkait di aplikasi.
- Jangan menampilkan SQL atau nama tabel kepada pengguna kecuali diminta.

Draf surat:
- Tidak perlu membaca database untuk menyusun draf, kecuali pengguna meminta data tertentu dimasukkan.
- Isi bagian yang belum diketahui dengan tanda kurung siku, contoh [nomor surat], bukan dengan karangan. ATK berarti Alat Tulis Kantor.
- Tulis draf di dalam blok kode (```) dengan bahasa dinas yang baku. Susunan nota dinas:
```
KOMISI PEMILIHAN UMUM PROVINSI SULAWESI UTARA

NOTA DINAS
Nomor: [nomor nota dinas]

Yth.    : [pejabat tujuan]
Dari    : [pejabat pengirim]
Tanggal : [tanggal]
Sifat   : [Biasa/Penting/Segera]
Hal     : [perihal]

[isi nota dinas]

[jabatan pengirim],

[nama pengirim]
NIP [nip]
```
- Ganti [isi nota dinas] dengan isi yang ditulis lengkap: satu kalimat pembuka (dasar atau latar belakang), paragraf inti berisi hal yang disampaikan atau dimohonkan beserta rinciannya, lalu kalimat penutup "Demikian disampaikan, atas perhatian Bapak/Ibu diucapkan terima kasih."
- Surat dinas memakai kop yang sama, lalu Nomor, Sifat, Lampiran, Hal, tempat dan tanggal, "Yth. [tujuan] di [tempat]", isi (pembuka, inti, penutup), dan tanda tangan pejabat.

Database (MySQL 8). Skema yang boleh dibaca:
{schema}

Petunjuk query:
- Modul persuratan saat ini memakai workflow_letter (kind = 'masuk' atau 'keluar'). Untuk rekap dan surat terbaru, gunakan tabel ini. surat_keluar adalah modul penomoran lama; jangan gabungkan hitungannya tanpa permintaan khusus.
- Hanya SELECT. Pilih kolom yang diperlukan saja dan JOIN untuk menampilkan nama, bukan id.
- Jangan pernah menjumlahkan atau menghitung sendiri. Untuk "berapa", "total", "rekap" biarkan SQL yang menghitung dengan COUNT/SUM/GROUP BY, lalu salin angka hasilnya apa adanya.
- Pencarian teks memakai LIKE '%kata%'. Urutkan data terbaru dengan ORDER BY tanggal DESC dan batasi dengan LIMIT.
- Realisasi anggaran yang sah adalah yang status = 'verified'. Sisa anggaran = pagu_aktif - total realisasi verified. Tabel pagu_anggaran tidak punya kolom status.
- Satu panggilan berisi satu query.
- JANGAN menambahkan filter yang tidak diminta. "Berapa jumlah surat masuk" berarti semua status (termasuk archived). Tambahkan filter status hanya jika pengguna menyebut statusnya.
- Contoh jumlah surat masuk: SELECT COUNT(*) AS jumlah FROM workflow_letter WHERE kind = 'masuk'
- realisasi_anggaran dan pagu_anggaran sudah memiliki kolom tahun (tahun anggaran). Contoh total realisasi terverifikasi tahun 2026: SELECT COALESCE(SUM(jumlah_realisasi), 0) AS total FROM realisasi_anggaran WHERE status = 'verified' AND tahun = 2026
- Jika hasil query 0 atau kosong, itulah jawabannya: sampaikan "0" atau "belum ada data" dengan jelas. Jangan mengulang query yang sama.
- Contoh TOTAL keseluruhan (satu baris): SELECT (SELECT SUM(pagu_aktif) FROM pagu_anggaran) AS total_pagu, (SELECT SUM(jumlah_realisasi) FROM realisasi_anggaran WHERE status = 'verified') AS total_realisasi
- Arsip yang aktif adalah dokumen_arsip dengan status_hapus = 0. Cari arsip lewat nama_dokumen LIKE '%kata%'; cari surat lewat perihal LIKE '%kata%'.
- Contoh RINCIAN per akun (hanya bila diminta per akun): SELECT a.kode_akun, a.nama_akun, p.pagu_aktif, COALESCE(SUM(r.jumlah_realisasi), 0) AS realisasi, p.pagu_aktif - COALESCE(SUM(r.jumlah_realisasi), 0) AS sisa FROM pagu_anggaran p JOIN akun_anggaran a ON a.id_akun_anggaran = p.id_akun_anggaran LEFT JOIN realisasi_anggaran r ON r.id_pagu = p.id_pagu AND r.status = 'verified' GROUP BY p.id_pagu, a.kode_akun, a.nama_akun, p.pagu_aktif
- Jika query gagal, perbaiki sesuai pesan galat lalu coba lagi.

Hari ini {today}."""

_TOOLS_BLOCK = """

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{tools}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{{"name": <function-name>, "arguments": <args-json-object>}}
</tool_call>"""


_BULAN = ("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
          "Agustus", "September", "Oktober", "November", "Desember")


def _today() -> str:
    today = date.today()
    return f"{today.day} {_BULAN[today.month - 1]} {today.year} ({today.isoformat()})"


_DRAFT_REQUEST = re.compile(
    r"\b(buat(kan|lah)?|susun(kan|lah)?|tulis(kan|lah)?|bikin(kan)?|rancang(kan)?|siapkan)\b"
    r".{0,60}\b(draf|draft|konsep|nota\s+dinas|surat\s+dinas|surat\s+undangan|undangan|surat\s+tugas|surat\s+edaran)\b",
    re.IGNORECASE | re.DOTALL,
)
# Requests that mention a letter type but actually ask for data ("buat rekap surat tugas").
_DATA_REQUEST = re.compile(r"\b(rekap|daftar|jumlah|berapa|total|statistik|laporan\s+realisasi)\b", re.IGNORECASE)


def _is_draft_request(message: str) -> bool:
    return bool(_DRAFT_REQUEST.search(message or "")) and not _DATA_REQUEST.search(message or "")


_DOMAIN_PATTERNS = {
    "surat": re.compile(
        r"\b(surat|nota\s+dinas|disposisi|undangan|perihal|alur\s+persuratan|nomor\s+surat|pengirim|penerima)\b",
        re.IGNORECASE,
    ),
    "anggaran": re.compile(
        r"\b(anggaran|pagu|realisasi|dipa|pok|rpd|triwulan|akun\s+anggaran|belanja|revisi\s+anggaran|serapan|rupiah|blokir|tahun\s+anggaran)\b",
        re.IGNORECASE,
    ),
    "arsip": re.compile(
        r"\b(arsip|dokumen|berkas|klasifikasi|retensi|jra|penyusutan|alih\s+media|skkaad|rahasia)\b",
        re.IGNORECASE,
    ),
    "pegawai": re.compile(
        r"\b(pegawai|nip|staf|staff|karyawan|subbagian|bagian|jabatan|kasubbag|sekretaris|admin|pengguna|user)\b",
        re.IGNORECASE,
    ),
}

_FOLLOWUP_CUE = re.compile(
    r"\b((?:yang|hal|data|surat|draf|draft|berkas|dokumen|angka|bagian|akun|pagu)\s+itu|"
    r"tersebut|tadi|sebelumnya|di\s+atas|barusan|ubah|ganti|revisi|perbaiki|"
    r"tambahkan|tambah|kurangi|hapus|singkat|ringkas|perpanjang|rincikan|detailnya|"
    r"jelaskan\s+(lagi|lebih)|lanjut(kan)?|coba\s+lagi|versi|format\s+ulang|"
    r"yang\s+(sama|tadi))\b",
    re.IGNORECASE,
)

_DATA_DOMAIN_QUERY = re.compile(
    r"\b(berapa|jumlah|total|rekap|daftar|tampilkan|lihat|cari|cek|siapa|"
    r"apa\s+saja|terbaru|terakhir|status|sisa|persentase|statistik|laporan)\b",
    re.IGNORECASE,
)


def _detect_domains(text: str) -> set[str]:
    if not text:
        return set()
    return {name for name, pat in _DOMAIN_PATTERNS.items() if pat.search(text)}


def _select_relevant_history(
    message: str,
    history: Optional[Sequence[Dict[str, Any]]],
) -> List[Dict[str, str]]:
    """Keep recent turns only when the new message genuinely continues the topic.

    Small local models (3B) anchor strongly on earlier turns and skip tool calls or
    hallucinate when the user switches topics inside the same chat thread.
    """
    cleaned = _clean_history(history)
    if not cleaned:
        return []

    if _FOLLOWUP_CUE.search(message or ""):
        return cleaned

    words = re.findall(r"\w+", message or "")
    new_domains = _detect_domains(message)
    recent_text = " ".join(turn["content"] for turn in cleaned[-2:])
    prev_domains = _detect_domains(recent_text)

    # Clear switch between distinct PTP-KPU domains (e.g. Anggaran -> Surat).
    if new_domains and prev_domains and not (new_domains & prev_domains):
        return []

    # Switch between a specific PTP-KPU domain and an unrelated general topic.
    if len(words) >= 3 and bool(new_domains) != bool(prev_domains):
        return []

    # Fresh standalone database lookup without follow-up references: start clean so
    # the 3B model calls query_database instead of imitating prior plain-text turns.
    if len(words) >= 4 and _DATA_DOMAIN_QUERY.search(message or "") and new_domains:
        return []

    return cleaned


def build_system_prompt(context: Optional[str] = None) -> str:
    prompt = _PERSONA.format(schema=kirana_db.SCHEMA_DOC, today=_today())
    if context:
        prompt += f"\n\nKonteks halaman yang sedang dibuka pengguna:\n{context[:1500]}"
    return prompt + _TOOLS_BLOCK.format(tools=json.dumps(_TOOL_SPEC, ensure_ascii=False))


def _clean_history(history: Optional[Sequence[Dict[str, Any]]]) -> List[Dict[str, str]]:
    turns: List[Dict[str, str]] = []
    for turn in (history or [])[-MAX_HISTORY_MESSAGES:]:
        role, content = turn.get("role"), turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            turns.append({"role": role, "content": content.strip()[:MAX_HISTORY_CHARS]})
    return turns


_GREETING_RE = re.compile(
    r"^\s*(?P<salut>halo+|hallo+|hai+|hay+|hi+|hello+|helo+|selamat\s+(?:pagi|siang|sore|malam)|"
    r"ass?alamu[\s']*alaikum(?:\s+wr\.?\s*wb\.?)?|salam|permisi|tes+|test+|ping|p)"
    r"(?:[\s,!\.]*(?:kirana|ai|asisten|bot|kak|min|admin|semua))?[\s!\.\?]*$",
    re.IGNORECASE,
)

_ASKED_FOR_SQL_RE = re.compile(r"\b(sql|query|kueri)\b", re.IGNORECASE)
_JSON_TOOL_START_RE = re.compile(r'\{\s*"name"\s*:\s*"query_database"', re.IGNORECASE)
_FENCED_SQL_START_RE = re.compile(r"```\s*sql\b", re.IGNORECASE)
_FENCED_JSON_TOOL_RE = re.compile(r'```\s*json\s*\n?\s*\{\s*"name"\s*:\s*"query_database"', re.IGNORECASE)
_BARE_SQL_LINE_RE = re.compile(r"(?im)^\s*(?:SELECT|WITH)\b[\s\S]+?\bFROM\b")
_TRAILING_SQL_OR_TAG_RE = re.compile(
    r"(?:^|\n)[ \t]*(?:<t?o?o?l?[_a-z]*|```[a-z]*|\{\s*\"?n?a?m?e?\"?|(?:SELECT|WITH)\b[^\n]*)$",
    re.IGNORECASE,
)


def _greeting_reply(message: str, user=None) -> Optional[str]:
    """Return a clean, instant Indonesian reply for simple greetings without invoking the 3B model."""
    m = _GREETING_RE.match(message or "")
    if not m:
        return None
    salut = m.group("salut").strip().lower()
    raw_name = getattr(user, "nama", None) or ""
    first_name = raw_name.strip().split(",")[0].strip() if raw_name.strip() else ""
    who = f", {first_name}" if first_name else ""

    if salut.startswith("ass") or salut.startswith("asalamu"):
        opener = f"Waalaikumsalam{who}!"
    elif salut.startswith("selamat "):
        opener = f"{salut.capitalize()}{who}!"
    else:
        opener = f"Halo{who}!"

    return (
        f"{opener} Saya **KIRANA**, asisten AI Sistem Informasi PTP-KPU Provinsi Sulawesi Utara. "
        "Ada yang bisa saya bantu hari ini? Anda dapat menanyakan data persuratan, arsip, pegawai, "
        "realisasi anggaran, atau meminta saya menyusun draf surat dinas."
    )


def _find_tool_start(output: str) -> int:
    """Return earliest index where a tool call or SQL query begins, or -1 if none."""
    indices = []
    idx = output.find(TOOL_OPEN)
    if idx != -1:
        indices.append(idx)
    for pat in (_FENCED_SQL_START_RE, _FENCED_JSON_TOOL_RE, _JSON_TOOL_START_RE, _BARE_SQL_LINE_RE):
        m = pat.search(output)
        if m:
            indices.append(m.start())
    return min(indices) if indices else -1


def _strip_leaked_queries(text: str, user_asked_sql: bool) -> str:
    """Remove any residual tool XML tags or SQL code blocks before showing text to the user."""
    if not text:
        return ""
    cleaned = re.sub(r"<tool_call>[\s\S]*?</tool_call>", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"<tool_response>[\s\S]*?</tool_response>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</?tool_(?:call|response)>", "", cleaned, flags=re.IGNORECASE)
    if not user_asked_sql:
        cleaned = re.sub(r"```\s*sql\b[\s\S]*?```", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'```\s*json\s*[\s\S]*?"query_database"[\s\S]*?```', "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\{\s*"name"\s*:\s*"query_database"[\s\S]*?\}\s*\}?', "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"(?im)^\s*(?:SELECT|WITH)\b[^\n;]*\bFROM\b[^\n;]*;?\s*$", "", cleaned)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def _extract_queries_from_output(output: str, tool_at: int) -> List[str]:
    """Extract SQL queries from <tool_call>, raw JSON, ```sql blocks, or bare SELECT lines."""
    queries: List[str] = []
    # 1. Explicit <tool_call> or JSON {"name": "query_database", ...}
    if tool_at != -1:
        tail = output[tool_at:]
        if tail.startswith(TOOL_OPEN):
            sql = _parse_tool_call(tail[len(TOOL_OPEN):])
            if sql:
                queries.append(sql)
        else:
            m_json = _JSON_TOOL_START_RE.search(tail)
            if m_json:
                sql = _parse_tool_call(tail[m_json.start():])
                if sql:
                    queries.append(sql)
    # 2. Fenced ```sql ... ```
    if not queries:
        queries.extend(_sql_written_as_text(output))
    # 3. Bare SELECT/WITH statement
    if not queries:
        m_bare = re.search(r"(?im)^\s*((?:SELECT|WITH)\b[\s\S]+?\bFROM\b[^;`\n]+(?:;)?)", output)
        if m_bare:
            candidate = m_bare.group(1).strip().rstrip(";").strip()
            if candidate:
                queries.append(candidate)
    return queries[:3]


def _held_back(text: str, *, suppress_sql_prefix: bool = False) -> int:
    """Length of the tail of `text` that might be the start of a tool call or SQL query."""
    best = 0
    markers = (TOOL_OPEN, "<tool_response>", "```sql", "```SQL", "```json", '{"name"')
    for marker in markers:
        for size in range(min(len(text), len(marker) - 1), 0, -1):
            if marker.lower().startswith(text[-size:].lower()):
                if size > best:
                    best = size
                break
    if suppress_sql_prefix:
        m = _TRAILING_SQL_OR_TAG_RE.search(text)
        if m:
            tail_len = len(text) - m.start()
            if tail_len > best:
                best = tail_len
    return best


def _parse_tool_call(raw: str) -> Optional[str]:
    """Extract the SQL from the text following a <tool_call> tag."""
    start = raw.find("{")
    if start == -1:
        return None
    try:
        call, _ = json.JSONDecoder().raw_decode(raw[start:])
    except ValueError:
        return None
    if not isinstance(call, dict):
        return None
    args = call.get("arguments", call)
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            return args  # the model put the bare SQL there
    if isinstance(args, dict):
        sql = args.get("sql") or args.get("query")
        return sql if isinstance(sql, str) else None
    return None


_SQL_BLOCK = re.compile(r"```sql\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def _sql_written_as_text(output: str) -> List[str]:
    """SQL the model put in its answer instead of calling the tool (small models
    do this now and then). Returned so it can be run on the model's behalf."""
    return [
        block.strip()
        for block in _SQL_BLOCK.findall(output)
        if block.strip().lower().startswith(("select", "with"))
    ][:3]


def _with_guidance(result: str) -> str:
    """Tell the model what to do next when a query did not produce rows."""
    if result.startswith("ERROR"):
        return (
            result + "\nPerbaiki query sesuai galat di atas dan panggil query_database "
            "lagi. Jangan menjawab pengguna sebelum query berhasil."
        )
    if result.startswith("Hasil: 0 baris"):
        return (
            "Hasil: 0 baris (tidak ada data di database). Sampaikan kepada pengguna secara "
            "singkat dan jelas bahwa datanya belum tersedia, tanpa menyalin teks instruksi ini."
        )
    return result


def _tool_call_text(sql: str) -> str:
    call = {"name": "query_database", "arguments": {"sql": sql}}
    return f"{TOOL_OPEN}\n{json.dumps(call, ensure_ascii=False)}\n{TOOL_CLOSE}"


async def _stream_model(messages: List[Dict[str, str]], **options) -> AsyncIterator[str]:
    """Run the blocking model in a worker thread and yield its output here."""
    import kirana_llm

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    cancelled = threading.Event()
    done = object()

    def put(item: Any) -> None:
        try:
            loop.call_soon_threadsafe(queue.put_nowait, item)
        except RuntimeError:
            pass  # event loop already closed

    def worker() -> None:
        try:
            stream = kirana_llm.stream_chat(messages, cancel=cancelled, **options)
            try:
                for piece in stream:
                    put(piece)
            finally:
                stream.close()  # releases the model for the next request
        except BaseException as exc:
            put(exc)
        finally:
            put(done)

    loop.run_in_executor(None, worker)
    try:
        while True:
            item = await queue.get()
            if item is done:
                return
            if isinstance(item, BaseException):
                raise item
            yield item
    finally:
        # Also reached when the client disconnects or presses "stop".
        cancelled.set()


async def run_agent(
    message: str,
    history: Optional[Sequence[Dict[str, Any]]] = None,
    context: Optional[str] = None,
    *,
    user=None,
) -> AsyncIterator[Dict[str, Any]]:
    import kirana_llm

    greeting = _greeting_reply(message, user=user)
    if greeting is not None:
        yield {"type": "token", "text": greeting}
        yield {"type": "done", "model": kirana_llm.MODEL_NAME, "used_database": False}
        return

    # Drafting needs no data; small models still tend to look up names they see in
    # the request, so the request is marked and any database call is redirected.
    draft_mode = _is_draft_request(message)
    user_asked_sql = bool(_ASKED_FOR_SQL_RE.search(message or ""))
    relevant_history = _select_relevant_history(message, history)
    user_content = message
    if draft_mode:
        user_content += ("\n\n(Catatan sistem: ini permintaan penyusunan draf. Tulis drafnya langsung "
                         "dengan tanda kurung siku untuk data yang belum diketahui; jangan memanggil query_database.)")
    elif relevant_history and _DATA_DOMAIN_QUERY.search(message or ""):
        user_content += ("\n\n(Catatan sistem: fokus HANYA pada pertanyaan terbaru ini. Jika butuh data sistem, "
                         "WAJIB panggil query_database baru dan jangan mengarang atau menyalin data dari topik sebelumnya.)")
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": build_system_prompt(context)},
        *relevant_history,
        {"role": "user", "content": user_content},
    ]
    used_database = False
    wrote_text = False
    likely_rag = (not draft_mode) and bool(_DATA_DOMAIN_QUERY.search(message or "") or _detect_domains(message or ""))

    for round_no in range(MAX_TOOL_ROUNDS + 1):
        output = ""
        emitted = 0
        tool_at = -1
        can_query = round_no < MAX_TOOL_ROUNDS
        # Buffer initial RAG round until we know whether the model emits a query,
        # so SQL / preambles never flicker in the chatbox during database lookup.
        buffer_round = can_query and likely_rag and round_no == 0 and not user_asked_sql

        async with aclosing(_stream_model(messages, stop=[TOOL_CLOSE])) as stream:
            async for piece in stream:
                output += piece
                if tool_at == -1 and not user_asked_sql:
                    tool_at = _find_tool_start(output)
                    if tool_at != -1:
                        if wrote_text:
                            wrote_text = False
                            yield {"type": "reset"}
                        yield {"type": "status", "text": "Membaca database…"}
                if tool_at != -1 or buffer_round:
                    continue  # collecting the tool call or buffering RAG round; hide SQL from chatbox
                safe = len(output) - _held_back(output, suppress_sql_prefix=can_query)
                if safe > emitted:
                    text = output[emitted:safe]
                    if not wrote_text:
                        text = text.lstrip()
                    if text:
                        wrote_text = True
                        yield {"type": "token", "text": text}
                    emitted = safe

        if tool_at == -1 and not user_asked_sql:
            tool_at = _find_tool_start(output)

        queries = _extract_queries_from_output(output, tool_at) if can_query else []

        if not queries and tool_at == -1:
            if buffer_round:
                cleaned_out = _strip_leaked_queries(output, user_asked_sql)
                if cleaned_out:
                    wrote_text = True
                    yield {"type": "token", "text": cleaned_out}
            elif emitted < len(output):  # held-back tail that was not a tag/query after all
                tail = _strip_leaked_queries(output[emitted:], user_asked_sql)
                if tail:
                    wrote_text = True
                    yield {"type": "token", "text": tail}
            break

        if not can_query:
            cleaned_final = _strip_leaked_queries(output, user_asked_sql)
            if wrote_text:
                wrote_text = False
                yield {"type": "reset"}
            if cleaned_final:
                wrote_text = True
                yield {"type": "token", "text": cleaned_final}
            break

        if queries:
            calls = "\n".join(_tool_call_text(sql) for sql in queries)
        else:
            calls = output[tool_at:].rstrip() + "\n" + TOOL_CLOSE

        if wrote_text:  # "please wait" preamble, or SQL shown as text
            wrote_text = False
            yield {"type": "reset"}

        if queries and draft_mode:
            results = ["ERROR: Untuk draf, jangan membaca database. Tulis draf lengkap sekarang; "
                       "isi data yang belum diketahui dengan tanda kurung siku, contoh [nama pejabat]."]
        elif queries:
            yield {"type": "status", "text": "Membaca database…"}
            results = [_with_guidance(await kirana_db.run_query(sql, user=user)) for sql in queries]
            used_database = True
        else:
            results = [
                'ERROR: Format tool_call tidak valid. Gunakan '
                '{"name": "query_database", "arguments": {"sql": "SELECT ..."}}.'
            ]

        messages.append({"role": "assistant", "content": calls})
        messages.append({
            "role": "user",
            "content": "\n".join(f"<tool_response>\n{r}\n</tool_response>" for r in results),
        })
        yield {"type": "status", "text": "Menyusun jawaban…"}

    if not wrote_text:
        yield {
            "type": "token",
            "text": "Maaf, saya belum berhasil mendapatkan jawabannya. Coba ajukan pertanyaan dengan lebih spesifik.",
        }
    yield {"type": "done", "model": kirana_llm.MODEL_NAME, "used_database": used_database}
