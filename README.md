# Excel Merger PoC

PoC para cruzar datos de múltiples archivos Excel/CSV mediante reglas de negocio configurables, con visualización web y pipeline basado en Polars + NVIDIA NIM Free API.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11, FastAPI, Polars, OpenAI SDK |
| Frontend | React 19, Vite 6, Axios |
| Procesamiento | Polars (joins, concat, transforms) |
| Reglas LLM | NVIDIA NIM Free API (placeholder listo) |

## Estructura

```
excel-merger-poc/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + CORS
│   │   ├── core/config.py       # Settings (upload dir, NVIDIA keys)
│   │   ├── schemas/excel.py     # Pydantic models
│   │   ├── services/
│   │   │   └── excel_processor.py # Polars engine + LLM rules
│   │   └── api/v1/
│   │       └── excel.py           # Endpoints upload/merge/preview/download
│   └── pyproject.toml
└── frontend/
    ├── src/
    │   ├── pages/HomePage.tsx     # UI drag & drop + tablas + merge
    │   ├── api/client.ts          # Axios client
    │   └── App.tsx
    ├── vite.config.ts            # Proxy /api → localhost:8000
    └── package.json
```

## Endpoints API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/v1/excel/upload` | Subir 1 Excel |
| POST | `/api/v1/excel/upload-multiple` | Subir varios Excels |
| GET | `/api/v1/excel/preview/{file_id}` | Preview tabla (50 filas) |
| GET | `/api/v1/excel/files` | Listar archivos subidos |
| POST | `/api/v1/excel/merge` | Ejecutar cruce con reglas |
| GET | `/api/v1/excel/download/{file_id}` | Descargar Excel resultante |

## Reglas de negocio

El sistema soporta:
- **Merge** (join) por columna entre 2+ archivos: `inner`, `left`, `outer`
- **Concat** (apilar verticalmente)
- **Reglas LLM** (opcional): envía muestra del DataFrame a NVIDIA NIM para interpretar reglas complejas en lenguaje natural y generar código Polars automáticamente

### Ejemplo payload /merge

```json
{
  "file_ids": ["uuid-1", "uuid-2"],
  "rules": [
    {
      "left_key": "ID_Cliente",
      "right_key": "ClienteID",
      "join_type": "inner",
      "how": "merge"
    }
  ],
  "llm_prompt": "Filtrar solo donde Estado='Activo' y calcular Total = Cantidad * Precio"
}
```

## Levantar local

### Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend se abre en `http://localhost:5173` y proxyea `/api` al backend en `:8000`.

## Próximos pasos cuando lleguen los Excels reales

1. Ajustar tipos de datos en Polars según las columnas reales
2. Configurar `NVIDIA_API_KEY` en `.env` para activar reglas LLM
3. Ajustar las `MergeRule` si necesitan más operaciones (groupby, pivot, etc.)
4. Agregar validación de esquema antes del merge

## Licencia

MIT — Equipo Nelson
