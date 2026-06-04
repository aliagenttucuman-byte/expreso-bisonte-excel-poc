"""Configuración de la aplicación."""
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Expreso Bisonte Dinamic Analyzer PoC"
    UPLOAD_DIR: str = "/tmp/excel-merger"
    MAX_UPLOAD_SIZE_MB: int = 50
    CORS_ORIGINS: list[str] = ["*"]
    
    # NVIDIA NIM Free API
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    # Modelos disponibles: elige según necesidad
    NVIDIA_MODEL: str = "qwen/qwen3.5-397b-a17b"  # default: potente para coding/data
    
    class Config:
        env_file = ".env"
        env_prefix = ""

settings = Settings()
