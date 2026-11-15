from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "PTP-KPU Local Operations API"
    DATABASE_URL: str = "mysql+aiomysql://root:@localhost:3306/kpu_db"
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:latest"
    SECRET_KEY: str

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret(cls, value: str) -> str:
        if len(value) < 32 or value == "kpu_sulut_secret_key_2026_change_in_production":
            raise ValueError("Set SECRET_KEY to a unique random secret of at least 32 characters")
        return value
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ENABLE_API_DOCS: bool = False
    OFFICIAL_ISSUANCE_ENABLED: bool = False
    AUTHORITY_GRANTS: list[dict] = []
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 25

    class Config:
        env_file = (".env", "app/.env")
        extra = "ignore"

settings = Settings()
