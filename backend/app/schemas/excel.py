from pydantic import BaseModel
from typing import Any


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    rows: int
    columns: int
    columns_list: list[str]


class MergeRule(BaseModel):
    left_key: str
    right_key: str
    join_type: str = "inner"  # inner, left, outer
    how: str = "merge"  # merge, concat, custom_llm


class MergeRequest(BaseModel):
    file_ids: list[str]
    rules: list[MergeRule]
    # Si how=custom_llm, se envía prompt al LLM de NVIDIA
    llm_prompt: str | None = None
    # Modelo NVIDIA NIM a usar (default: qwen35)
    model: str = "qwen35"


class PlanSuggestRequest(BaseModel):
    file_ids: list[str]
    objective: str


class PlanStep(BaseModel):
    step: int
    title: str
    explanation: str
    left_file_id: str
    right_file_id: str
    left_key: str
    right_key: str
    join_type: str = "inner"
    how: str = "merge"


class PlanSuggestResponse(BaseModel):
    summary: str
    suggested_result: str
    steps: list[PlanStep]


class MergeResult(BaseModel):
    file_id: str
    filename: str
    rows: int
    columns: int
    columns_list: list[str]
    preview: list[dict[str, Any]]
    download_url: str


class ProcedureCreateRequest(BaseModel):
    name: str
    objective: str
    expected_result: str | None = None
    model: str = "qwen35"


class Procedure(BaseModel):
    procedure_id: str
    name: str
    objective: str
    expected_result: str | None = None
    model: str = "qwen35"
    run_count: int = 0
    created_at: str
    updated_at: str
    sort_order: int


class ProcedureOrderRequest(BaseModel):
    ordered_ids: list[str]


class ProcedureDuplicateRequest(BaseModel):
    name: str | None = None


class StaticPipelineRequest(BaseModel):
    # Modo legacy: un único libro con ambas hojas de sistema.
    file_id: str | None = None

    # Modo operativo: dos archivos separados (uno CDO Sistema y otro PTE de Fact Sistema).
    cdo_file_id: str | None = None
    pf_file_id: str | None = None

    assignment_pool: list[str] | None = None


class ManualComparisonRequest(BaseModel):
    manual_file_id: str
    cdo_output_file_id: str
    pf_output_file_id: str
    manual_cdo_sheet: str = "CDO TRABAJADA"
    manual_pf_sheet: str = "PF TRABAJADA"
    output_cdo_sheet: str = "CDO Trabajada"
    output_pf_sheet: str = "PF Trabajada"


class TablePreview(BaseModel):
    file_id: str
    filename: str
    columns: list[str]
    rows: list[dict[str, Any]]
    total_rows: int


class UpdateSheetRequest(BaseModel):
    sheet_name: str
    rows: list[dict[str, Any]]
    columns: list[str] | None = None
