from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "PTP-KPU Local Operations API"
    DATABASE_URL: str = "mysql+aiomysql://root:@localhost:3306/kpu_db"
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:latest"
    SECRET_KEY: str = "kpu_sulut_secret_key_2026_change_in_production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    class Config:
        env_file = (".env", "app/.env")
        extra = "ignore"

settings = Settings()
