"""
Endpoint: POST /api/v1/excel/merge-contado
Endpoint: POST /api/v1/excel/contado/preview  → datos del Excel para tabla editable
Endpoint: POST /api/v1/excel/contado/export   → exportar ediciones como Excel
Endpoint: POST /api/v1/excel/contado/save     → persistir tabla editada en PostgreSQL
Endpoint: GET  /api/v1/excel/contado/save     → recuperar último FINAL desde PostgreSQL
"""

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
import io, json, os
from datetime import datetime

import psycopg2
import psycopg2.extras

from app.services.contado_merger import merge_contado, excel_to_table, table_to_excel

router = APIRouter()

# ── DB connection ──────────────────────────────────────────────────────────────

DB_DSN = os.getenv(
    "BISONTE_DB_DSN",
    "host=localhost port=5435 dbname=bisonte user=bisonte password=bisonte2026"
)

def _get_conn():
    return psycopg2.connect(DB_DSN)

# ── Mapeo columnas frontend → BD ───────────────────────────────────────────────
# Las columnas del frontend pueden venir con tildes tal cual están en FINAL_COLS
_COL_MAP = {
    "nro":           "nro",
    "JUSTIFICACIÓN": "justificacion",
    "REFERENTE":     "referente",
    "ESTADO":        "estado",
    "OBSERVACIÓN":   "observacion",
    "DIAS_ATRASO":   "dias_atraso",
    "guiafec":       "guiafec",
    "razsocc":       "razsocc",
    "clase":         "clase",
    "fechaedit":     "fechaedit",
    "sucori":        "sucori",
    "sucdest":       "sucdest",
    "importe":       "importe",
    "saldo":         "saldo",
    "succobro":      "succobro",
    "tiporec":       "tiporec",
    "sucursal":      "sucursal",
    "nrogen_a":      "nrogen_a",
}

def _to_num(v):
    """Convierte a float o None."""
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "."))
    except Exception:
        return None

def _to_int(v):
    if v is None or v == "":
        return None
    try:
        return int(float(str(v)))
    except Exception:
        return None


def _upsert_rows(columns: list, rows: list, updated_by: str = "sistema") -> int:
    """
    Persiste filas en las 3 tablas de la DB (guia, contado_anotacion, contado_guias).
    Devuelve la cantidad de registros guardados.
    Levanta Exception si falla la DB.
    """
    is_dict_rows = len(rows) > 0 and isinstance(rows[0], dict)

    records = []
    now = datetime.now()
    for row in rows:
        rec = {}
        for col_frontend, col_db in _COL_MAP.items():
            if is_dict_rows:
                val = row.get(col_frontend)
            else:
                if col_frontend in columns:
                    idx = columns.index(col_frontend)
                    val = row[idx] if idx < len(row) else None
                else:
                    val = None
            if col_db in ("importe", "saldo"):
                val = _to_num(val)
            elif col_db == "dias_atraso":
                val = _to_int(val)
            else:
                val = str(val).strip() if val not in (None, "") else None
            rec[col_db] = val
        if rec.get("nro"):
            rec["updated_at"] = now
            rec["updated_by"] = updated_by
            records.append(rec)

    if not records:
        return 0

    conn = _get_conn()
    cur  = conn.cursor()

    sql_guia = """
        INSERT INTO guia (
            nro, guiafec, razsocc, clase, fechaedit,
            sucori, sucdest, importe, saldo, succobro,
            tiporec, sucursal, nrogen_a, estado_actual,
            ultima_vez_visto, fuente
        ) VALUES (
            %(nro)s, %(guiafec)s, %(razsocc)s, %(clase)s, %(fechaedit)s,
            %(sucori)s, %(sucdest)s, %(importe)s, %(saldo)s, %(succobro)s,
            %(tiporec)s, %(sucursal)s, %(nrogen_a)s, %(estado)s,
            %(updated_at)s, 'transoft'
        )
        ON CONFLICT (nro) DO UPDATE SET
            guiafec        = EXCLUDED.guiafec,
            razsocc        = EXCLUDED.razsocc,
            clase          = EXCLUDED.clase,
            fechaedit      = EXCLUDED.fechaedit,
            sucori         = EXCLUDED.sucori,
            sucdest        = EXCLUDED.sucdest,
            importe        = EXCLUDED.importe,
            saldo          = EXCLUDED.saldo,
            succobro       = EXCLUDED.succobro,
            tiporec        = EXCLUDED.tiporec,
            sucursal       = EXCLUDED.sucursal,
            nrogen_a       = EXCLUDED.nrogen_a,
            estado_actual  = EXCLUDED.estado_actual,
            ultima_vez_visto = EXCLUDED.ultima_vez_visto
    """
    psycopg2.extras.execute_batch(cur, sql_guia, records, page_size=200)

    sql_anotacion = """
        INSERT INTO contado_anotacion (
            nro, justificacion, referente, estado_gestion,
            observacion, dias_atraso, updated_at, updated_by
        ) VALUES (
            %(nro)s, %(justificacion)s, %(referente)s, %(estado)s,
            %(observacion)s, %(dias_atraso)s, %(updated_at)s, %(updated_by)s
        )
        ON CONFLICT (nro) DO UPDATE SET
            justificacion  = EXCLUDED.justificacion,
            referente      = EXCLUDED.referente,
            estado_gestion = EXCLUDED.estado_gestion,
            observacion    = EXCLUDED.observacion,
            dias_atraso    = EXCLUDED.dias_atraso,
            updated_at     = EXCLUDED.updated_at,
            updated_by     = EXCLUDED.updated_by
    """
    psycopg2.extras.execute_batch(cur, sql_anotacion, records, page_size=200)

    sql_legacy = """
        INSERT INTO contado_guias
            (nro, justificacion, referente, estado, observacion, dias_atraso,
             guiafec, razsocc, clase, fechaedit, sucori, sucdest,
             importe, saldo, succobro, tiporec, sucursal, nrogen_a,
             updated_at, updated_by)
        VALUES
            (%(nro)s, %(justificacion)s, %(referente)s, %(estado)s, %(observacion)s,
             %(dias_atraso)s, %(guiafec)s, %(razsocc)s, %(clase)s, %(fechaedit)s,
             %(sucori)s, %(sucdest)s, %(importe)s, %(saldo)s, %(succobro)s,
             %(tiporec)s, %(sucursal)s, %(nrogen_a)s, %(updated_at)s, %(updated_by)s)
        ON CONFLICT (nro) DO UPDATE SET
            justificacion = EXCLUDED.justificacion,
            referente     = EXCLUDED.referente,
            estado        = EXCLUDED.estado,
            observacion   = EXCLUDED.observacion,
            dias_atraso   = EXCLUDED.dias_atraso,
            guiafec       = EXCLUDED.guiafec,
            razsocc       = EXCLUDED.razsocc,
            clase         = EXCLUDED.clase,
            fechaedit     = EXCLUDED.fechaedit,
            sucori        = EXCLUDED.sucori,
            sucdest       = EXCLUDED.sucdest,
            importe       = EXCLUDED.importe,
            saldo         = EXCLUDED.saldo,
            succobro      = EXCLUDED.succobro,
            tiporec       = EXCLUDED.tiporec,
            sucursal      = EXCLUDED.sucursal,
            nrogen_a      = EXCLUDED.nrogen_a,
            updated_at    = EXCLUDED.updated_at,
            updated_by    = EXCLUDED.updated_by
    """
    psycopg2.extras.execute_batch(cur, sql_legacy, records, page_size=200)

    conn.commit()
    cur.close()
    conn.close()
    return len(records)


@router.post("/merge-contado")
async def merge_contado_endpoint(
    inicial: UploadFile = File(...),
    sistema: UploadFile = File(...),
    sheet_inicial: str = "INICIAL",
    sheet_sistema: str = "SISTEMA",
):
    try:
        inicial_bytes = await inicial.read()
        sistema_bytes = await sistema.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivos: {e}")

    try:
        final_bytes, stats = merge_contado(
            inicial_bytes, sistema_bytes,
            sheet_inicial=sheet_inicial,
            sheet_sistema=sheet_sistema,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en el merge: {e}")

    # Persistir en DB automáticamente — pisa el procesamiento anterior
    try:
        table = excel_to_table(final_bytes)
        _upsert_rows(table["columns"], table["rows"], updated_by="merge_auto")
        db_saved = len(table["rows"])
    except Exception as e:
        # No bloquear la descarga si la DB falla — el usuario igual recibe el Excel
        db_saved = -1
        stats["db_error"] = str(e)

    fecha = datetime.now().strftime("%Y%m%d_%H%M")
    return StreamingResponse(
        io.BytesIO(final_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=CONTADO_FINAL_{fecha}.xlsx",
            "X-Stats-Existentes":   str(stats["existentes"]),
            "X-Stats-Nuevos":       str(stats["nuevos"]),
            "X-Stats-Eliminados":   str(stats["eliminados"]),
            "X-Stats-EstadoCambio": str(stats["estado_cambio"]),
            "X-Stats-DbSaved":      str(db_saved),
        },
    )


@router.post("/contado/preview")
async def contado_preview(file: UploadFile = File(...)):
    """Recibe un Excel (FINAL) y devuelve filas + columnas para la tabla editable."""
    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")
    try:
        result = excel_to_table(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parseando Excel: {e}")
    return result


@router.post("/contado/export")
async def contado_export(payload: dict):
    """
    Recibe { columns: [...], rows: [...], original_bytes_b64: '...' }
    Devuelve Excel con las ediciones aplicadas.
    """
    try:
        import base64
        columns      = payload["columns"]
        rows         = payload["rows"]
        orig_b64     = payload.get("original_bytes_b64", "")
        orig_bytes   = base64.b64decode(orig_b64) if orig_b64 else None
        final_bytes  = table_to_excel(columns, rows, orig_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando Excel: {e}")

    fecha = datetime.now().strftime("%Y%m%d_%H%M")
    return StreamingResponse(
        io.BytesIO(final_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=CONTADO_EDITADO_{fecha}.xlsx"},
    )


# ── SAVE → PostgreSQL ──────────────────────────────────────────────────────────

@router.post("/contado/save")
async def contado_save(payload: dict):
    """
    Recibe { columns: [...], rows: [...], updated_by?: '...' }
    UPSERT en dos tablas del nuevo schema:
      - guia: datos base de Transoft
      - contado_anotacion: campos manuales de Edith
    También graba en contado_guias (legacy) para compatibilidad.
    Devuelve { saved: N, updated_at: '...' }
    """
    try:
        columns    = payload["columns"]
        rows       = payload["rows"]
        updated_by = payload.get("updated_by", "sistema")
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Campo requerido: {e}")

    if not rows:
        return {"saved": 0, "updated_at": datetime.now().isoformat()}

    try:
        saved = _upsert_rows(columns, rows, updated_by=updated_by)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error grabando en BD: {e}")

    ts = datetime.now().strftime("%d/%m/%Y %H:%M")
    return {"saved": saved, "updated_at": ts}


@router.get("/contado/save")
async def contado_load():
    """
    Recupera todas las guías guardadas desde PostgreSQL.
    Devuelve { columns: [...], rows: [...], total: N, updated_at: '...' }
    """
    try:
        conn = _get_conn()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT nro, justificacion AS "JUSTIFICACIÓN", referente AS "REFERENTE",
                   estado AS "ESTADO", observacion AS "OBSERVACIÓN",
                   dias_atraso AS "DIAS_ATRASO", guiafec, razsocc, clase, fechaedit,
                   sucori, sucdest, importe, saldo, succobro, tiporec, sucursal, nrogen_a,
                   updated_at, updated_by
            FROM contado_guias
            ORDER BY updated_at DESC
        """)
        rows_db = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo BD: {e}")

    if not rows_db:
        return {"columns": [], "rows": [], "total": 0, "updated_at": None}

    columns = list(rows_db[0].keys())
    rows    = [[str(r[c]) if r[c] is not None else "" for c in columns] for r in rows_db]
    last_ts = rows_db[0].get("updated_at")
    ts_str  = last_ts.strftime("%d/%m/%Y %H:%M") if last_ts else None

    return {"columns": columns, "rows": rows, "total": len(rows), "updated_at": ts_str}
