# Expreso Bisonte — Excel PoC

PoC de automatización de procesos Excel para Expreso Bisonte (Tucumán).
Desarrollado por AlegentAI.

---

## Stack

| Capa | Tecnología | Puerto |
|---|---|---|
| Backend API | FastAPI (Python 3.11) | `:9000` |
| Frontend | React 18 + TypeScript + Vite | `:3000` (dev) |
| Proxy SPA | Python `http.server` | `:9090` |
| Base de datos operativa | PostgreSQL 16 (Docker) | `:5435` |
| Base de datos vectorial | Qdrant (Docker) | `:6335` |
| Túnel externo (opcional) | Cloudflare Tunnel | URL dinámica |

---

## Procesos implementados

### 1. CDO / PTE de Facturación (flujo split + pipeline)

Cruza el CDO Sistema y el PTE de Fact Sistema contra sus versiones trabajadas (validadas por Pablo Ruiz).
Muestra las diferencias fila a fila en la app para que la gerenta toque solo lo que falta.

**Flujo:**
1. Subir `expreso_bisonte_combinado.xlsx` (4 sheets: CDO Sistema, PTE de Fact Sistema, CDO TRABAJADA, PF TRABAJADA)
2. Click **Ejecutar CDO/PTE** → genera archivos de salida comparados
3. Click **Auditoría** → vista lado a lado sistema vs trabajada

**Endpoints:**
- `POST /api/v1/excel/upload` — sube el combinado
- `POST /api/v1/excel/split-system-sheets/{file_id}` — separa CDO y PF
- `POST /api/v1/excel/pipeline/static` — motor de comparación con baseline histórico
- `POST /api/v1/excel/pipeline/compare-manual` — compara fila a fila

---

### 2. Cobranzas Contado — Merge INICIAL + SISTEMA = FINAL

Automatiza el proceso diario de Edith: cruzar la planilla acumulada (INICIAL) con la descarga fresca de Transoft (SISTEMA) para generar el FINAL listo para trabajar por todas las sucursales.

**Reglas del merge:**

| Caso | Resultado |
|---|---|
| Guía en AMBOS (existente) | Preserva JUSTIFICACIÓN, REFERENTE, ESTADO, OBSERVACIÓN de Edith |
| Solo en SISTEMA (nueva) | Aparece con campos manuales en blanco — equipo la completa |
| Solo en INICIAL (eliminada) | No aparece — ya fue cobrada o cerrada en Transoft |

**Columnas del FINAL:**
`nro · JUSTIFICACIÓN · REFERENTE · ESTADO · OBSERVACIÓN · DIAS_ATRASO · guiafec · razsocc · clase · fechaedit · sucori · sucdest · importe · saldo · succobro · tiporec · sucursal · nrogen_a`

**DIAS_ATRASO** se calcula desde `fechaedit` (última edición en Transoft), zona horaria Argentina (UTC-3).

**Endpoints:**
- `POST /api/v1/excel/merge-contado` — genera el FINAL (recibe INICIAL + SISTEMA como UploadFile)
- `POST /api/v1/excel/contado/preview` — parsea Excel y devuelve `{ columns, rows }` para la tabla editable
- `POST /api/v1/excel/contado/export` — aplica ediciones y devuelve Excel descargable
- `POST /api/v1/excel/contado/save` — **UPSERT en PostgreSQL** (graba el FINAL editado en BD)
- `GET  /api/v1/excel/contado/save` — recupera todas las guías guardadas desde BD

**Tabla editable (ContadoTable):**
- Todas las celdas editables (onBlur)
- Filtros dinámicos: REFERENTE, ESTADO, SUCDEST, JUSTIFICACIÓN, días de atraso, sin asignar, búsqueda libre
- Botón **Guardar y descargar FINAL**: primero graba en BD (UPSERT por `nro`), luego descarga el Excel
- Badge verde con timestamp del último guardado persistido en `localStorage`

---

## Base de datos — PostgreSQL

```bash
# Levantar
cd /home/server/proyectos/excel-merger-poc
docker compose -f docker-compose.db.yml up -d

# Verificar
docker exec bisonte-db pg_isready -U bisonte -d bisonte
```

**Conexión:**
- Host: `localhost:5435`
- DB: `bisonte`
- User: `bisonte`
- Password: `bisonte2026`

### Tabla `contado_guias`

```sql
CREATE TABLE contado_guias (
    nro             TEXT PRIMARY KEY,     -- clave única Transoft, ej: A.0053.00111316
    justificacion   TEXT,                 -- ej: "SGCP 6562"
    referente       TEXT,                 -- ej: "BA", "CC", "HM"
    estado          TEXT,                 -- ED, DT, TT, RL, RT, DO, DI, OB, NR
    observacion     TEXT,                 -- ej: "VER DIF", "RETENCION"
    dias_atraso     INTEGER,              -- hoy(AR) - fechaedit
    guiafec         TEXT,                 -- fecha emisión guía (string DD/MM/YYYY)
    razsocc         TEXT,                 -- razón social cliente
    clase           TEXT,
    fechaedit       TEXT,                 -- última edición en Transoft
    sucori          TEXT,                 -- sucursal origen
    sucdest         TEXT,                 -- sucursal destino
    importe         NUMERIC(18,2),
    saldo           NUMERIC(18,2),
    succobro        TEXT,                 -- sucursal de cobro (CC, BA, JU, RO, SA)
    tiporec         TEXT,
    sucursal        TEXT,
    nrogen_a        TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      TEXT DEFAULT 'sistema'
);
```

**UPSERT:** cada vez que Edith aprieta "Guardar y descargar FINAL", todas las guías visibles hacen `INSERT ... ON CONFLICT (nro) DO UPDATE`. Se preserva historial de `updated_at` y `updated_by`.

---

## Estructura del proyecto

```
excel-merger-poc/
├── backend/
│   ├── app/
│   │   ├── main.py                          # FastAPI app + CORS + routers
│   │   ├── core/config.py                   # settings (UPLOAD_DIR, CORS_ORIGINS)
│   │   ├── api/v1/
│   │   │   ├── excel.py                     # endpoints CDO/PTE pipeline
│   │   │   └── endpoints/
│   │   │       └── contado.py               # endpoints Cobranzas Contado + save BD
│   │   └── services/
│   │       ├── excel_processor.py           # motor split + compare
│   │       └── contado_merger.py            # merge INICIAL+SISTEMA=FINAL
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/HomePage.tsx               # UI principal, todos los flujos
│       └── components/
│           └── ContadoTable.tsx             # tabla editable con filtros
├── docker-compose.db.yml                    # PostgreSQL :5435 + Qdrant :6335
├── spa_proxy.py                             # proxy :9090 → sirve dist/ + /api/* → :9000
└── README.md
```

---

## Levantar en desarrollo (Tailscale)

```bash
# 1. BDs (si no están corriendo)
cd /home/server/proyectos/excel-merger-poc
docker compose -f docker-compose.db.yml up -d

# 2. Backend
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 9000 > /tmp/excel_backend.log 2>&1 &

# 3. Proxy SPA
python3 /home/server/proyectos/excel-merger-poc/spa_proxy.py > /tmp/expreso_proxy.log 2>&1 &

# URL Tailscale
# http://100.110.8.13:9090
```

> Para acceso externo (demo con cliente): levantar Cloudflare Tunnel
> ```bash
> cloudflared tunnel --url http://localhost:9090 > /tmp/cf_expreso.log 2>&1 &
> sleep 8 && grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf_expreso.log | tail -1
> ```

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `BISONTE_DB_DSN` | `host=localhost port=5435 dbname=bisonte user=bisonte password=bisonte2026` | Conexión PostgreSQL |
| `UPLOAD_DIR` | `/tmp/excel-merger` | Directorio temporal de uploads |

---

## Estados de guía (Transoft)

| Código | Significado |
|---|---|
| ED | Entregada pendiente de cobro ← único que trabaja esta matriz |
| DT | Despachada en tránsito |
| TT | En tránsito |
| RL | Recibida en depósito local |
| RT | Retornada |
| DO | Devuelta al origen |
| DI | Documentación incompleta |
| OB | Observada |
| NR | No retirada |

## REFERENTE — responsable del cobro

| Código | Significado |
|---|---|
| BA | Buenos Aires |
| CC | Casa Central (Tucumán) |
| JU | Jujuy |
| RO | Rosario |
| SA | Salta |
| HM / HMS | Héctor M. (comercial) |
| MRA | Comercial MRA |
| FN | Federico Nacif (comercial) |
| NDS / NDE | Sin asignar — filtro para nuevas del día |

---

## Notas técnicas

- El backend NO usa venv — corre con el Python del sistema (`python3 -m uvicorn`)
- `UPLOAD_DIR` se limpia en cada reinicio del server (es `/tmp`) — el combinado debe rearmarse siempre
- `_upload_registry` es en memoria — se pierde al reiniciar el backend
- El spa_proxy y backend NO son servicios systemd — caen con cada reinicio del server
- El frontend Next.js en `:3000` sí sobrevive reinicios (pid estable)
- `psycopg2` disponible en el Python del sistema (v2.9.12)

---

*AlegentAI © 2026 — Proyecto confidencial Expreso Bisonte*
