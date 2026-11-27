import logging
import re
from fastapi import FastAPI, HTTPException
from sqlalchemy.exc import IntegrityError, OperationalError
from fastapi.security import HTTPAuthorizationCredentials
from app.core.auth import get_current_user
from app.core.database import AsyncSessionLocal
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from app.core.config import settings
from app.api.v1.router import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs" if settings.ENABLE_API_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_API_DOCS else None
)

logger = logging.getLogger("ptp_kpu")


async def _backfill_archive() -> None:
    from app.services.arsip_sync import sync_all
    try:
        async with AsyncSessionLocal() as session:
            counts = await sync_all(session)
        logger.info("Arsip tersinkron: %s", counts)
    except Exception:  # noqa: BLE001 - e.g. migration not applied yet; never block startup
        logger.exception("Sinkronisasi arsip saat startup gagal; jalankan migrasi lalu POST /arsip/sinkronkan")


_background_tasks: set = set()


@app.on_event("startup")
async def backfill_archive() -> None:
    """Make sure letters and budget evidence saved earlier appear in the archive.
    Runs in the background so the app is available immediately after a restart."""
    import asyncio
    task = asyncio.create_task(_backfill_archive())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# Every request uses its own session; uncommitted changes are discarded (rolled back)
# when the session closes. These handlers turn failures into a JSON "detail" message
# that the frontend shows to the user instead of a bare "500".
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request, exc: IntegrityError):
    logger.warning("Integrity error on %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse(
        status_code=409,
        content={"detail": "Data tidak dapat disimpan karena bertentangan dengan data yang ada "
                           "atau ada data wajib yang belum diisi. Tidak ada perubahan yang disimpan."},
    )


@app.exception_handler(OperationalError)
async def database_unavailable_handler(request, exc: OperationalError):
    logger.error("Database error on %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database sedang tidak dapat dihubungi. Silakan coba lagi beberapa saat lagi."},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Terjadi kesalahan pada server dan permintaan tidak selesai. Muat ulang halaman "
                           "untuk memeriksa data sebelum mencoba lagi, atau hubungi administrator."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PUBLIC_PATHS = {
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/auth/login",
    "/api/auth/login",
    "/api/v1/auth/register",
    "/api/auth/register",
    "/api/v1/auth/register-status",
    "/api/auth/register-status",
    "/api/v1/auth/unit-options",
    "/api/auth/unit-options",
}

@app.middleware("http")
async def require_jwt(request, call_next):
    path = request.url.path
    normalized_path = path.rstrip("/") or "/"
    is_public_verification = bool(re.fullmatch(r"/api(?:/v1)?/verifikasi/[^/]+/?", path))
    if (
        request.method == "OPTIONS"
        or normalized_path in PUBLIC_PATHS
        or path.startswith("/docs/")
        or is_public_verification
        or not (path.startswith("/api/") or path.startswith("/api/v1/"))
    ):
        return await call_next(request)

    authorization = request.headers.get("Authorization", "")
    if not authorization.lower().startswith("bearer "):
        return JSONResponse(
            status_code=401,
            content={"detail": "Bearer token diperlukan"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        jwt.decode(
            authorization[7:].strip(),
            settings.SECRET_KEY,
            algorithms=["HS256"],
        )
    except JWTError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Token tidak valid atau sudah kedaluwarsa"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        async with AsyncSessionLocal() as db:
            await get_current_user(db, HTTPAuthorizationCredentials(scheme='Bearer', credentials=authorization[7:].strip()))
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={'detail': exc.detail})
    except OperationalError as exc:
        # Exception handlers do not cover middleware: report the outage the same way.
        return await database_unavailable_handler(request, exc)
    return await call_next(request)

app.include_router(api_router, prefix="/api/v1")
app.include_router(api_router, prefix="/api")

@app.get("/health", tags=["Health Check"])
async def health_check():
    return {"status": "online", "system": settings.PROJECT_NAME}

@app.get("/health/ready", tags=["Health Check"])
async def readiness_check():
    from sqlalchemy import text
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
            await db.execute(text("SELECT session_version, is_active FROM pegawai LIMIT 0"))
            await db.execute(text("SELECT id FROM workflow_letter LIMIT 0"))
            await db.execute(text("SELECT id FROM budget_event LIMIT 0"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}
