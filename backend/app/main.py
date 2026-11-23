from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from app.core.config import settings
from app.api.v1.router import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    return await call_next(request)

app.include_router(api_router, prefix="/api/v1")
app.include_router(api_router, prefix="/api")

@app.get("/health", tags=["Health Check"])
async def health_check():
    return {"status": "online", "system": settings.PROJECT_NAME}
