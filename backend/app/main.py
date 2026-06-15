from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1 import excel as excel_router
from app.api.v1.endpoints.contado import router as contado_router

app = FastAPI(title=settings.APP_NAME, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Stats-Existentes", "X-Stats-Nuevos", "X-Stats-Eliminados", "X-Stats-EstadoCambio", "Content-Disposition"],
)

app.include_router(excel_router.router, prefix="/api/v1")
app.include_router(contado_router, prefix="/api/v1/excel")

@app.get("/health")
def health():
    return {"status": "ok", "service": settings.APP_NAME}
