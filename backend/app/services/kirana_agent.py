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
MAX_HISTORY_MESSAGES = 12
MAX_HISTORY_CHARS = 2000  # per past message

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
- Gunakan bahasa pengguna; bawaan bahasa Indonesia yang baku, jelas, dan ramah. Langsung ke inti, tidak bertele-tele.
- Gunakan Markdown bila membantu: daftar, **tebal**, dan tabel untuk data berbaris.
- Tulis nominal uang sebagai Rupiah dengan pemisah ribuan, contoh Rp 1.250.000.
- Jangan pernah mengarang data. Angka, nama, nomor surat, dan isi dokumen hanya boleh berasal dari hasil query_database. Jika hasilnya kosong atau query gagal, katakan apa adanya.
- Jika pertanyaan membutuhkan data sistem, LANGSUNG panggil query_database tanpa kalimat pembuka seperti "mohon tunggu". Jangan pernah menulis SQL atau tanda seperti [hasil query] di dalam jawaban; jalankan query-nya, lalu jawab dengan hasilnya.
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


def _held_back(text: str) -> int:
    """Length of the tail of `text` that might be the start of a <tool_call> tag."""
    for size in range(min(len(text), len(TOOL_OPEN) - 1), 0, -1):
        if TOOL_OPEN.startswith(text[-size:]):
            return size
    return 0


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
            result + "\nCoba sekali lagi dengan kata kunci lain atau LIKE '%kata%' pada "
            "kolom yang lebih tepat. Jika tetap kosong, sampaikan bahwa datanya tidak ditemukan."
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

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": build_system_prompt(context)},
        *_clean_history(history),
        {"role": "user", "content": message},
    ]
    used_database = False
    wrote_text = False

    for round_no in range(MAX_TOOL_ROUNDS + 1):
        output = ""
        emitted = 0
        tool_at = -1

        async with aclosing(_stream_model(messages, stop=[TOOL_CLOSE])) as stream:
            async for piece in stream:
                output += piece
                if tool_at == -1:
                    tool_at = output.find(TOOL_OPEN)
                if tool_at != -1:
                    continue  # collecting the tool call; nothing to show
                safe = len(output) - _held_back(output)
                if safe > emitted:
                    text = output[emitted:safe]
                    if not wrote_text:
                        text = text.lstrip()
                    if text:
                        wrote_text = True
                        yield {"type": "token", "text": text}
                    emitted = safe

        can_query = round_no < MAX_TOOL_ROUNDS

        if tool_at == -1:
            if emitted < len(output):  # held-back tail that was not a tag after all
                wrote_text = True
                yield {"type": "token", "text": output[emitted:]}
            queries = _sql_written_as_text(output) if can_query else []
            if not queries:
                break
            # The model described its queries instead of running them: run them
            # for it, drop that text, and let it answer from the real rows.
            calls = "\n".join(_tool_call_text(sql) for sql in queries)
        else:
            if not can_query:
                break  # out of attempts; handled below
            sql = _parse_tool_call(output[tool_at + len(TOOL_OPEN):])
            queries = [sql] if sql else []
            calls = output[tool_at:].rstrip() + "\n" + TOOL_CLOSE

        if wrote_text:  # "please wait" preamble, or SQL shown as text
            wrote_text = False
            yield {"type": "reset"}

        if queries:
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
