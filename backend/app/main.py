from fastapi import FastAPI, HTTPException
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
}

@app.middleware("http")
async def require_jwt(request, call_next):
    path = request.url.path
    normalized_path = path.rstrip("/") or "/"
    is_public_verification = "/verifikasi/" in path
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
