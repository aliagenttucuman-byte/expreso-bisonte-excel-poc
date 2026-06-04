"""Servicio de procesamiento de Excel con Polars."""
import os
import uuid
from pathlib import Path
from typing import Any

import polars as pl
import requests
from openai import OpenAI

from app.core.config import settings

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Cache de DataFrames en memoria para preview
_df_cache: dict[str, pl.DataFrame] = {}

# Catálogo de modelos NVIDIA NIM recomendados
NIM_MODELS = {
    "qwen35": "qwen/qwen3.5-397b-a17b",
    "mistral": "mistralai/mistral-medium-3.5-128b",
    "deepseek": "deepseek-ai/deepseek-v4-pro",
    "llama": "meta/llama-3.2-90b-vision-instruct",
    "nemotron": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
}

PREFERRED_JOIN_KEYS = [
    "dni", "id", "id_cliente", "cliente_id", "email", "cuit", "documento",
]


def save_upload(file_bytes: bytes, original_filename: str) -> tuple[str, str]:
    file_id = str(uuid.uuid4())
    ext = Path(original_filename).suffix or ".xlsx"
    path = UPLOAD_DIR / f"{file_id}{ext}"
    with open(path, "wb") as f:
        f.write(file_bytes)
    return file_id, str(path)


def load_df(file_id: str, file_path: str) -> pl.DataFrame:
    if file_id in _df_cache:
        return _df_cache[file_id]
    path = Path(file_path)
    if path.suffix == ".csv":
        df = pl.read_csv(path, infer_schema_length=10000)
    else:
        df = pl.read_excel(path)
    _df_cache[file_id] = df
    return df


def get_preview(file_id: str, file_path: str, limit: int = 50) -> dict[str, Any]:
    df = load_df(file_id, file_path)
    total = len(df)
    preview = df.head(limit).to_dicts()
    return {
        "file_id": file_id,
        "filename": Path(file_path).name,
        "columns": df.columns,
        "rows": preview,
        "total_rows": total,
    }


def merge_dataframes(
    left_id: str, left_path: str,
    right_id: str, right_path: str,
    left_key: str, right_key: str,
    join_type: str = "inner",
) -> pl.DataFrame:
    left = load_df(left_id, left_path)
    right = load_df(right_id, right_path)
    if left_key not in left.columns:
        raise ValueError(f"Columna '{left_key}' no existe en archivo izquierdo. Columnas: {left.columns}")
    if right_key not in right.columns:
        raise ValueError(f"Columna '{right_key}' no existe en archivo derecho. Columnas: {right.columns}")
    left = left.with_columns(pl.col(left_key).cast(pl.Utf8))
    right = right.with_columns(pl.col(right_key).cast(pl.Utf8))
    suffix = f"_{right_id[:6]}"
    result = left.join(
        right,
        left_on=left_key,
        right_on=right_key,
        how=join_type,
        suffix=suffix,
    )
    return result


def infer_join_keys(left: pl.DataFrame, right: pl.DataFrame) -> tuple[str | None, str | None]:
    """Intenta inferir columnas de cruce entre dos DataFrames por nombre de columna."""
    left_map = {c.lower(): c for c in left.columns}
    right_map = {c.lower(): c for c in right.columns}
    common_lower = set(left_map.keys()) & set(right_map.keys())
    if not common_lower:
        return None, None

    for candidate in PREFERRED_JOIN_KEYS:
        if candidate in common_lower:
            return left_map[candidate], right_map[candidate]

    chosen = sorted(common_lower)[0]
    return left_map[chosen], right_map[chosen]


def apply_llm_rules(df: pl.DataFrame, prompt: str, model_key: str = "qwen35") -> pl.DataFrame:
    """Aplica reglas de negocio descritas en lenguaje natural via NVIDIA NIM.
    
    El usuario describe qué quiere hacer con los datos (cruces, filtros, cálculos)
    y el LLM genera código Polars que se ejecuta de forma segura.
    """
    if not settings.NVIDIA_API_KEY:
        return df
    
    model_name = NIM_MODELS.get(model_key, settings.NVIDIA_MODEL)
    client = OpenAI(
        base_url=settings.NVIDIA_BASE_URL,
        api_key=settings.NVIDIA_API_KEY,
    )
    
    # Preparar contexto del DataFrame
    schema_desc = "\n".join([f"  - {c}: {df[c].dtype}" for c in df.columns])
    sample = df.head(5).to_dicts()
    sample_str = "\n".join([f"  {row}" for row in sample])
    
    full_prompt = f"""Sos un experto en análisis de datos con Polars (Python). Te voy a dar un DataFrame y una descripción de lo que necesita hacer el usuario.

Tu tarea es:
1. Entender la intención del usuario (cruces, filtros, cálculos, agrupaciones).
2. Generar **una única línea o expresión de código Python** usando Polars (`import polars as pl`) que transforme el DataFrame `df`.
3. La expresión debe devolver un nuevo DataFrame de Polars.
4. No escribas explicaciones. Solo código. No uses markdown.

REGLAS DE SEGURIDAD:
- NO uses `eval()`, `exec()`, `open()`, `os`, `sys`, `subprocess`.
- SOLO usa operaciones de Polars: filtros, joins, groupby, select, with_columns, etc.
- El resultado debe ser un DataFrame de Polars.

---

ESTRUCTURA DEL DATAFRAME:
{schema_desc}

MUESTRA DE DATOS (primeras 5 filas):
{sample_str}

---

DESCRIPCIÓN DEL USUARIO DE LO QUE QUIERE HACER:
{prompt}

---

GENERÁ SOLO EL CÓDIGO (una expresión que devuelva el DataFrame transformado):"""
    
    try:
        resp = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": full_prompt}],
            temperature=0.1,
            max_tokens=2048,
        )
        code = resp.choices[0].message.content.strip()
        # Limpiar markdown
        if code.startswith("```python"):
            code = code.split("```python", 1)[1]
        elif code.startswith("```"):
            code = code.split("```", 1)[1]
        if code.endswith("```"):
            code = code.rsplit("```", 1)[0]
        code = code.strip()
        
        # Ejecutar el código generado de forma segura
        local_ns = {"pl": pl, "df": df}
        safe_globals = {"__builtins__": {}, "pl": pl}

        # 1) Si vino expresión directa: df.filter(...), la evaluamos
        result = None
        try:
            eval_result = eval(code, safe_globals, local_ns)
            if isinstance(eval_result, pl.DataFrame):
                result = eval_result
        except Exception:
            pass

        # 2) Si no, probamos como bloque (asignaciones / varias líneas)
        if result is None:
            exec(code, safe_globals, local_ns)
            result = local_ns.get("df", df)

        if not isinstance(result, pl.DataFrame):
            # Si el código asignó a otra variable
            for key, val in local_ns.items():
                if isinstance(val, pl.DataFrame) and key != "df":
                    result = val
                    break
        return result
    except Exception as e:
        print(f"[LLM RULE ERROR] {e}")
        return df


def save_result(df: pl.DataFrame, original_name: str = "merged") -> tuple[str, str]:
    file_id = str(uuid.uuid4())
    filename = f"{original_name}_{file_id}.xlsx"
    path = UPLOAD_DIR / filename
    df.write_excel(path)
    return file_id, str(path)


def get_available_models() -> dict[str, str]:
    """Devuelve catálogo de modelos NVIDIA NIM disponibles."""
    return NIM_MODELS
