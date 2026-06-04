import { useState, useCallback, useEffect } from 'react'
import client from '../api/client'

interface UploadedFile {
  file_id: string
  filename: string
  rows: number
  columns: number
  columns_list: string[]
}

interface PipelineStage {
  name: string
  rows: number
}

interface StaticPipelineResult {
  ok: boolean
  source_file: string
  source_files?: {
    cdo_file: string
    pf_file: string
  }
  sheets_detected: Record<string, string | null>
  row_stats?: {
    cdo_sistema_rows: number
    pf_sistema_rows: number
    cdo_trabajada_rows: number
    pf_trabajada_rows: number
  }
  source_row_stats?: {
    cdo_sistema_sheet_total_rows: number
    cdo_sistema_sheet_nonempty_rows: number
    cdo_sistema_data_rows: number
    pf_sistema_sheet_total_rows: number
    pf_sistema_sheet_nonempty_rows: number
    pf_sistema_data_rows: number
  }
  result: { file_id: string; filename: string; download_url: string }
  result_files?: {
    cdo_trabajada: { file_id: string; filename: string; download_url: string }
    pf_trabajada: { file_id: string; filename: string; download_url: string }
  }
  stages: PipelineStage[]
  preview: {
    cdo_trabajada: Array<Record<string, unknown>>
    pf_trabajada: Array<Record<string, unknown>>
  }
}

interface ComparisonSheetResult {
  manual_rows: number
  output_rows: number
  manual_columns: number
  output_columns: number
  common_columns: number
  rows_intersection: number
  rows_only_manual: number
  rows_only_output: number
  exact_match: boolean
}

interface ManualComparisonResult {
  ok: boolean
  comparison_ok: boolean
  manual_file: string
  pipeline_files: {
    cdo_output: string
    pf_output: string
  }
  results: {
    cdo_trabajada: ComparisonSheetResult
    pf_trabajada: ComparisonSheetResult
  }
}

interface SheetPreviewData {
  file_id: string
  filename: string
  sheet_name: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  total_rows: number
}

const PROCESSES = [
  { id: 'cdo_pf', label: 'CDO / PTE Facturación' },
  { id: 'proc_2', label: 'Proceso 2' },
  { id: 'proc_3', label: 'Proceso 3' },
  { id: 'proc_4', label: 'Proceso 4' },
  { id: 'proc_5', label: 'Proceso 5' },
  { id: 'proc_6', label: 'Proceso 6' },
  { id: 'proc_7', label: 'Proceso 7' },
  { id: 'proc_8', label: 'Proceso 8' },
]

const TABS = [
  { id: 'datos', label: '📊 Datos' },
  { id: 'auditoria', label: '🔍 Auditoría' },
] as const

type TabId = typeof TABS[number]['id']

const toErrorMessage = (err: any): string => {
  const detail = err?.response?.data?.detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d: any) => d?.msg || (typeof d === 'string' ? d : JSON.stringify(d)))
      .filter(Boolean)
    return msgs.join(' | ') || 'Error de validación en la solicitud'
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || JSON.stringify(detail)
  }
  if (typeof detail === 'string' && detail.trim()) return detail
  return err?.message || 'Error inesperado'
}

export default function HomePage() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [activeProcess, setActiveProcess] = useState('cdo_pf')
  const [activeTab, setActiveTab] = useState<TabId>('datos')

  const [staticPipelineResult, setStaticPipelineResult] = useState<StaticPipelineResult | null>(null)
  const [staticPipelineLoading, setStaticPipelineLoading] = useState(false)
  const [cdoSourceFileId, setCdoSourceFileId] = useState('')
  const [pfSourceFileId, setPfSourceFileId] = useState('')
  const [manualReferenceFileId, setManualReferenceFileId] = useState('')
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [manualComparisonResult, setManualComparisonResult] = useState<ManualComparisonResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sheetPreviews, setSheetPreviews] = useState<{
    manualCdo?: SheetPreviewData
    pipelineCdo?: SheetPreviewData
    manualPf?: SheetPreviewData
    pipelinePf?: SheetPreviewData
  } | null>(null)
  const [pipelineEdits, setPipelineEdits] = useState<{
    cdo?: SheetPreviewData
    pf?: SheetPreviewData
  } | null>(null)
  const [saveEditLoading, setSaveEditLoading] = useState<'cdo' | 'pf' | null>(null)

  const sourceCandidates = files.filter((f) => {
    const n = (f.filename || '').toLowerCase().trim()
    const isGeneratedName =
      n.startsWith('pipeline_') ||
      n.startsWith('merged_') ||
      n.startsWith('cdo_trabajada_') ||
      n.startsWith('pf_trabajada_') ||
      n === 'cdo trabajada.xlsx' ||
      n === 'pf trabajada.xlsx'
    return n.endsWith('.xlsx') && !isGeneratedName
  })

  const hasSplitSources = sourceCandidates.some((f) => f.filename === 'CDO Sistema.xlsx')
    && sourceCandidates.some((f) => f.filename === 'PTE de Fact Sistema.xlsx')

  const sourceFiles = hasSplitSources
    ? sourceCandidates.filter((f) => f.filename === 'CDO Sistema.xlsx' || f.filename === 'PTE de Fact Sistema.xlsx')
    : sourceCandidates

  const manualFiles = sourceCandidates

  const generatedFiles = files.filter((f) => {
    const n = (f.filename || '').toLowerCase().trim()
    return (
      n.startsWith('pipeline_') ||
      n.startsWith('merged_') ||
      n.startsWith('cdo_trabajada_') ||
      n.startsWith('pf_trabajada_') ||
      n === 'cdo trabajada.xlsx' ||
      n === 'pf trabajada.xlsx'
    )
  })

  useEffect(() => {
    if (sourceFiles.length === 0) {
      setCdoSourceFileId('')
      setPfSourceFileId('')
      setManualReferenceFileId('')
      return
    }

    if (!cdoSourceFileId || !sourceFiles.some((f) => f.file_id === cdoSourceFileId)) {
      const cdoByName = sourceFiles.find((f) => f.filename === 'CDO Sistema.xlsx')
      setCdoSourceFileId((cdoByName || sourceFiles[0]).file_id)
    }

    if (!pfSourceFileId || !sourceFiles.some((f) => f.file_id === pfSourceFileId) || (pfSourceFileId === cdoSourceFileId && sourceFiles.length > 1)) {
      const pfByName = sourceFiles.find((f) => f.filename === 'PTE de Fact Sistema.xlsx')
      const second = sourceFiles.find((f) => f.file_id !== (cdoSourceFileId || sourceFiles[0].file_id))
      setPfSourceFileId((pfByName || second || sourceFiles[0]).file_id)
    }

    if (!manualReferenceFileId || !manualFiles.some((f) => f.file_id === manualReferenceFileId)) {
      setManualReferenceFileId((manualFiles[0] || sourceFiles[0]).file_id)
    }
  }, [sourceFiles, manualFiles, cdoSourceFileId, pfSourceFileId, manualReferenceFileId])

  const handleDrag = (e: any) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = useCallback((e: any) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
  }, [])

  const handleFileInput = (e: any) => {
    if (e.target.files) uploadFiles(e.target.files)
  }

  const uploadFiles = async (fileList: FileList) => {
    setLoading(true)
    setError('')
    const formData = new FormData()

    for (const file of Array.from(fileList)) {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        formData.append('files', file)
      }
    }

    try {
      const uploadResp = await client.post('/excel/upload-multiple', formData)
      const uploaded = uploadResp.data as UploadedFile[]

      for (const f of uploaded) {
        try {
          await client.post(`/excel/split-system-sheets/${f.file_id}`)
        } catch {
          // no-op
        }
      }

      await loadFiles(true)
      setStaticPipelineResult(null)
      setManualComparisonResult(null)
      setSheetPreviews(null)
      setPipelineEdits(null)
    } catch (err: any) {
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const loadFiles = async (attemptSplit: boolean = false) => {
    try {
      const resp = await client.get('/excel/files')
      const list = resp.data as UploadedFile[]

      if (attemptSplit) {
        const sourceCandidates = list.filter((f) => {
          const n = (f.filename || '').toLowerCase().trim()
          const isGeneratedName =
            n.startsWith('pipeline_') ||
            n.startsWith('merged_') ||
            n.startsWith('cdo_trabajada_') ||
            n.startsWith('pf_trabajada_') ||
            n === 'cdo trabajada.xlsx' ||
            n === 'pf trabajada.xlsx'
          return n.endsWith('.xlsx') && !isGeneratedName
        })

        const hasSplit = sourceCandidates.some((f) => f.filename === 'CDO Sistema.xlsx')
          && sourceCandidates.some((f) => f.filename === 'PTE de Fact Sistema.xlsx')

        if (!hasSplit) {
          for (const f of sourceCandidates) {
            try {
              await client.post(`/excel/split-system-sheets/${f.file_id}`)
            } catch {
              // ignore
            }
          }
          const resp2 = await client.get('/excel/files')
          setFiles(resp2.data as UploadedFile[])
          return
        }
      }

      setFiles(list)
    } catch {
      // silencioso en PoC
    }
  }

  const deleteFile = async (fileId: string) => {
    await client.delete(`/excel/files/${fileId}`)
    await loadFiles(true)
    setStaticPipelineResult(null)
    setManualComparisonResult(null)
    setSheetPreviews(null)
    setPipelineEdits(null)
  }

  const clearFiles = async () => {
    await client.post('/excel/files/clear')
    setFiles([])
    setStaticPipelineResult(null)
    setManualComparisonResult(null)
    setSheetPreviews(null)
    setPipelineEdits(null)
  }

  const runStaticPipeline = async () => {
    setStaticPipelineLoading(true)
    setError('')

    try {
      if (!cdoSourceFileId || !pfSourceFileId) {
        throw new Error('Seleccioná explícitamente CDO Sistema y PTE de Fact Sistema antes de ejecutar.')
      }

      const resp = await client.post('/excel/pipeline/static', {
        cdo_file_id: cdoSourceFileId,
        pf_file_id: pfSourceFileId,
      })
      setStaticPipelineResult(resp.data as StaticPipelineResult)
      setManualComparisonResult(null)
      setSheetPreviews(null)
      setPipelineEdits(null)
      setActiveTab('datos')
    } catch (err: any) {
      setError(toErrorMessage(err))
    } finally {
      setStaticPipelineLoading(false)
    }
  }

  const runManualComparison = async () => {
    if (!staticPipelineResult?.result_files) {
      setError('Primero ejecutá el pipeline estático para generar ambas salidas.')
      return
    }
    if (!manualReferenceFileId) {
      setError('Seleccioná un archivo manual de referencia para comparar.')
      return
    }

    setComparisonLoading(true)
    setError('')

    try {
      const resp = await client.post('/excel/pipeline/compare-manual', {
        manual_file_id: manualReferenceFileId,
        cdo_output_file_id: staticPipelineResult.result_files.cdo_trabajada.file_id,
        pf_output_file_id: staticPipelineResult.result_files.pf_trabajada.file_id,
      })
      setManualComparisonResult(resp.data as ManualComparisonResult)
      setActiveTab('auditoria')
    } catch (err: any) {
      setError(toErrorMessage(err))
    } finally {
      setComparisonLoading(false)
    }
  }

  const loadSheetPreviews = async () => {
    if (!staticPipelineResult?.result_files || !manualReferenceFileId) {
      setError('Necesitás ejecutar pipeline y seleccionar manual de referencia para visualizar documentos.')
      return
    }

    setPreviewLoading(true)
    setError('')
    try {
      const [manualCdo, pipelineCdo, manualPf, pipelinePf] = await Promise.all([
        client.get(`/excel/preview-sheet/${manualReferenceFileId}`, { params: { sheet_name: 'CDO TRABAJADA', limit: 5000 } }),
        client.get(`/excel/preview-sheet/${staticPipelineResult.result_files.cdo_trabajada.file_id}`, { params: { sheet_name: 'CDO Trabajada', limit: 5000 } }),
        client.get(`/excel/preview-sheet/${manualReferenceFileId}`, { params: { sheet_name: 'PF TRABAJADA', limit: 5000 } }),
        client.get(`/excel/preview-sheet/${staticPipelineResult.result_files.pf_trabajada.file_id}`, { params: { sheet_name: 'PF Trabajada', limit: 5000 } }),
      ])

      const manualCdoData = manualCdo.data as SheetPreviewData
      const pipelineCdoData = pipelineCdo.data as SheetPreviewData
      const manualPfData = manualPf.data as SheetPreviewData
      const pipelinePfData = pipelinePf.data as SheetPreviewData

      setSheetPreviews({
        manualCdo: manualCdoData,
        pipelineCdo: pipelineCdoData,
        manualPf: manualPfData,
        pipelinePf: pipelinePfData,
      })

      setPipelineEdits({
        cdo: {
          ...pipelineCdoData,
          rows: pipelineCdoData.rows.map((r) => ({ ...r })),
        },
        pf: {
          ...pipelinePfData,
          rows: pipelinePfData.rows.map((r) => ({ ...r })),
        },
      })
    } catch (err: any) {
      setError(toErrorMessage(err))
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    loadFiles(true)
  }, [])

  const onEditPipelineCell = (kind: 'cdo' | 'pf', rowIndex: number, column: string, value: string) => {
    setPipelineEdits((prev) => {
      if (!prev) return prev
      const target = kind === 'cdo' ? prev.cdo : prev.pf
      if (!target) return prev

      const nextRows = target.rows.map((r) => ({ ...r }))
      const row = { ...(nextRows[rowIndex] || {}) }
      row[column] = value
      nextRows[rowIndex] = row

      const updated: SheetPreviewData = {
        ...target,
        rows: nextRows,
      }

      return kind === 'cdo'
        ? { ...prev, cdo: updated }
        : { ...prev, pf: updated }
    })
  }

  const savePipelineSheet = async (kind: 'cdo' | 'pf') => {
    const target = kind === 'cdo' ? pipelineEdits?.cdo : pipelineEdits?.pf
    if (!target) {
      setError('No hay datos editables para guardar.')
      return
    }

    setSaveEditLoading(kind)
    setError('')
    try {
      await client.post(`/excel/update-sheet/${target.file_id}`, {
        sheet_name: target.sheet_name,
        columns: target.columns,
        rows: target.rows,
      })

      setSheetPreviews((prev) => {
        if (!prev) return prev
        return kind === 'cdo'
          ? { ...prev, pipelineCdo: { ...target, rows: target.rows.map((r) => ({ ...r })) } }
          : { ...prev, pipelinePf: { ...target, rows: target.rows.map((r) => ({ ...r })) } }
      })

      await loadFiles(true)
    } catch (err: any) {
      setError(toErrorMessage(err))
    } finally {
      setSaveEditLoading(null)
    }
  }

  /* ───────────── RENDERERS ───────────── */

  const renderPreviewTable = (data?: SheetPreviewData, rowLimit: number = 50) => {
    if (!data) {
      return <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Sin datos de previsualización.</div>
    }

    const cols = data.columns
    const allRows = data.rows
    const displayRows = rowLimit <= 0 ? allRows : allRows.slice(0, rowLimit)
    return (
      <div>
        <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.35rem' }}>
          hoja: <strong>{data.sheet_name}</strong> · filas totales: <strong>{data.total_rows}</strong> · columnas: <strong>{cols.length}</strong>
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '420px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: `${cols.length * 140}px` }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                {cols.map((col) => (
                  <th key={col} style={{ borderBottom: '1px solid #e2e8f0', padding: '0.35rem', textAlign: 'left', background: '#f1f5f9', whiteSpace: 'nowrap', minWidth: '120px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {cols.map((col) => {
                    const cellValue = String(row[col] ?? '')
                    const isVerDif = cellValue.toUpperCase().includes('VER DIF')
                    return (
                      <td key={col} style={{
                        borderBottom: '1px solid #f1f5f9',
                        padding: '0.35rem',
                        whiteSpace: 'nowrap',
                        minWidth: '120px',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        backgroundColor: isVerDif ? '#fee2e2' : 'inherit',
                        color: isVerDif ? '#b91c1c' : 'inherit',
                        fontWeight: isVerDif ? 700 : 'inherit',
                      }}>
                        {cellValue}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allRows.length > displayRows.length && (
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            Mostrando {displayRows.length} de {allRows.length} filas. Descargá el Excel para ver todo.
          </div>
        )}
      </div>
    )
  }

  const renderEditablePipelineTable = (kind: 'cdo' | 'pf') => {
    const data = kind === 'cdo' ? pipelineEdits?.cdo : pipelineEdits?.pf
    if (!data) {
      return <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Sin datos editables.</div>
    }

    const cols = data.columns
    const visibleRows = data.rows

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.78rem', color: '#475569' }}>
            hoja: <strong>{data.sheet_name}</strong> · filas totales: <strong>{data.total_rows}</strong> · columnas: <strong>{cols.length}</strong>
          </div>
          <button
            onClick={() => savePipelineSheet(kind)}
            disabled={saveEditLoading !== null}
            style={{ padding: '0.35rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}
          >
            {saveEditLoading === kind ? 'Guardando...' : '💾 Guardar cambios'}
          </button>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '520px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: `${cols.length * 155}px` }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                {cols.map((col) => (
                  <th key={col} style={{ borderBottom: '1px solid #e2e8f0', padding: '0.35rem', textAlign: 'left', background: '#dbeafe', whiteSpace: 'nowrap', minWidth: '120px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {cols.map((col) => {
                    const cellValue = String(row[col] ?? '')
                    const isVerDif = cellValue.toUpperCase().includes('VER DIF')
                    return (
                    <td key={col} style={{ borderBottom: '1px solid #f1f5f9', padding: '0.15rem', whiteSpace: 'nowrap', minWidth: '120px' }}>
                      <input
                        value={cellValue}
                        onChange={(e) => onEditPipelineCell(kind, i, col, e.target.value)}
                        style={{
                          width: '100%',
                          minWidth: '120px',
                          border: isVerDif ? '1px solid #ef4444' : '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '0.25rem 0.35rem',
                          fontSize: '0.74rem',
                          backgroundColor: isVerDif ? '#fee2e2' : '#fff',
                          color: isVerDif ? '#b91c1c' : '#0f172a',
                          fontWeight: isVerDif ? 700 : 400,
                        }}
                      />
                    </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  /* ───────────── HEADER ───────────── */

  const renderHeader = () => (
    <div style={{ marginBottom: '1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <img
          src="/expreso-bisonte-logo.jpg"
          alt="Expreso Bisonte"
          style={{ width: '68px', height: '68px', objectFit: 'contain', borderRadius: '8px', background: '#f8fafc' }}
        />
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem', marginTop: '0.25rem' }}>Dinamic Analyzer PoC</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
            Automatización de procesos operativos · Expreso Bisonte
          </p>
        </div>
      </div>
    </div>
  )

  /* ───────────── PROCESS SELECTOR ───────────── */

  const renderProcessSelector = () => (
    <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>Proceso:</span>
      <select
        value={activeProcess}
        onChange={(e) => {
          setActiveProcess(e.target.value)
          setActiveTab('datos')
          setStaticPipelineResult(null)
          setManualComparisonResult(null)
          setSheetPreviews(null)
          setPipelineEdits(null)
        }}
        style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff', cursor: 'pointer', minWidth: '220px' }}
      >
        {PROCESSES.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {activeProcess === 'cdo_pf' ? '2 orígenes → 2 salidas' : 'En definición con operación'}
        </span>
      </div>
    </div>
  )

  /* ───────────── TABS ───────────── */

  const renderTabs = () => (
    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.25rem' }}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        const isDisabled = false
        return (
          <button
            key={tab.id}
            onClick={() => !isDisabled && setActiveTab(tab.id)}
            disabled={isDisabled}
            style={{
              padding: '0.55rem 1rem',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: isActive ? '#fff' : 'transparent',
              color: isDisabled ? '#94a3b8' : isActive ? '#2563eb' : '#64748b',
              fontWeight: isActive ? 700 : 500,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: '0.88rem',
              borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: '-2px',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )

  /* ───────────── TAB: DATOS ───────────── */

  const renderDatosTab = () => {
    if (activeProcess !== 'cdo_pf') {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>📋 En definición</div>
          <div>Este proceso aún no tiene flujo configurado. Se definirá con la gerenta de operaciones.</div>
        </div>
      )
    }

    return (
      <div>
        {/* Upload */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            border: dragActive ? '2px dashed #2563eb' : '2px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '1.3rem',
            textAlign: 'center',
            background: dragActive ? '#eff6ff' : '#f8fafc',
            cursor: 'pointer',
            marginBottom: '1rem',
          }}
        >
          <input type="file" multiple accept=".xlsx,.xls,.csv" onChange={handleFileInput} style={{ display: 'none' }} id="fileInput" />
          <label htmlFor="fileInput" style={{ cursor: 'pointer', display: 'block' }}>
            <p style={{ fontSize: '1rem', color: '#334155', fontWeight: 500 }}>Arrastrá o tocá para subir archivos Excel</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.4rem' }}>.xlsx, .xls, .csv</p>
          </label>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={runStaticPipeline}
            disabled={staticPipelineLoading}
            style={{ padding: '0.55rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
          >
            {staticPipelineLoading ? 'Procesando...' : '▶ Ejecutar CDO/PF'}
          </button>

          <button
            onClick={clearFiles}
            style={{ padding: '0.55rem 0.8rem', border: '1px solid #fecaca', borderRadius: '8px', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', fontWeight: 600 }}
          >
            🗑 Vaciar
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '0.78rem', color: '#0f766e', fontWeight: 600 }}>CDO: auto</span>
            <span style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '0.78rem', color: '#0f766e', fontWeight: 600 }}>PTE Fact: auto</span>
            <span style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '0.78rem', color: '#334155' }}>Manual: auto</span>
          </div>
        </div>

        {loading && <p style={{ color: '#2563eb' }}>⏳ Procesando...</p>}
        {error && <p style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>⚠️ {error}</p>}

        {/* Source files */}
        {sourceFiles.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>📄 Archivos origen ({sourceFiles.length})</h2>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.6rem' }}>
              El conteo operativo real se muestra al ejecutar pipeline.
            </div>
            <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {sourceFiles.map((f, idx) => {
              const role = f.file_id === cdoSourceFileId
                ? 'CDO Sistema'
                : f.file_id === pfSourceFileId
                  ? 'PTE de Fact Sistema'
                  : f.file_id === manualReferenceFileId
                    ? 'Manual de referencia'
                    : `Origen ${idx + 1}`
              const operationalRows = staticPipelineResult?.row_stats
                ? (f.file_id === cdoSourceFileId
                  ? staticPipelineResult.row_stats.cdo_sistema_rows
                  : f.file_id === pfSourceFileId
                    ? staticPipelineResult.row_stats.pf_sistema_rows
                    : f.rows)
                : f.rows
              return (
                <div key={f.file_id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', background: '#fff' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f766e', marginBottom: '0.25rem' }}>{role}</div>
                  <div style={{ color: '#64748b', fontSize: '0.74rem', marginBottom: '0.25rem', wordBreak: 'break-word' }}>{f.filename}</div>
                  <div style={{ color: '#334155', fontSize: '0.8rem', marginBottom: '0.45rem' }}>
                    {operationalRows} filas × {f.columns} cols {staticPipelineResult?.row_stats ? '(operativo)' : '(preview)'}
                  </div>
                  <button onClick={() => deleteFile(f.file_id)} style={{ padding: '0.35rem 0.6rem', border: '1px solid #fecaca', borderRadius: '6px', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.8rem' }}>Borrar</button>
                </div>
              )
            })}
            </div>
          </div>
        )}

        {/* Generated files */}
        {generatedFiles.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.6rem' }}>🧾 Resultados ({generatedFiles.length})</h2>
            <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {generatedFiles.map(f => (
                <div key={f.file_id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', background: '#f8fafc' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-word' }}>{f.filename}</div>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.45rem' }}>{f.rows} filas × {f.columns} cols</div>
                  <button onClick={() => deleteFile(f.file_id)} style={{ padding: '0.35rem 0.6rem', border: '1px solid #fecaca', borderRadius: '6px', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.8rem' }}>Borrar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline result + preview */}
        {staticPipelineResult && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', background: '#fff', marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>🧩 Resultado: CDO Trabajada + PF Trabajada</h3>

            {staticPipelineResult.source_row_stats && (
              <div style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '0.6rem', background: '#f8fbff', marginBottom: '0.8rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Orígenes de datos</div>
                <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                  <div>CDO Sistema: {staticPipelineResult.source_row_stats.cdo_sistema_data_rows} filas útiles</div>
                  <div>PTE de Fact Sistema: {staticPipelineResult.source_row_stats.pf_sistema_data_rows} filas útiles</div>
                </div>
              </div>
            )}

            {staticPipelineResult.row_stats && (
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: '0.8rem' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem', background: '#f8fafc' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>CDO Sistema</div>
                  <div style={{ fontWeight: 700 }}>{staticPipelineResult.row_stats.cdo_sistema_rows}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem', background: '#f8fafc' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>PTE Fact Sistema</div>
                  <div style={{ fontWeight: 700 }}>{staticPipelineResult.row_stats.pf_sistema_rows}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem', background: '#eff6ff' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>CDO Trabajada</div>
                  <div style={{ fontWeight: 700 }}>{staticPipelineResult.row_stats.cdo_trabajada_rows}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem', background: '#eff6ff' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>PF Trabajada</div>
                  <div style={{ fontWeight: 700 }}>{staticPipelineResult.row_stats.pf_trabajada_rows}</div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '0.8rem', fontSize: '0.85rem', color: '#334155' }}>
              {staticPipelineResult.stages.map((s, idx) => (
                <div key={`${s.name}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>{idx + 1}. {s.name}</span>
                  <strong>{s.rows} filas</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ───────────── TAB: AUDITORÍA ───────────── */

  const renderAuditoriaTab = () => {
    if (activeProcess !== 'cdo_pf') {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>🔍 En definición</div>
          <div>Este proceso aún no tiene auditoría configurada.</div>
        </div>
      )
    }

    return (
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={runManualComparison}
            disabled={comparisonLoading || !staticPipelineResult?.result_files}
            style={{ padding: '0.55rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#0f766e', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
          >
            {comparisonLoading ? 'Comparando...' : '🔎 Comparar vs manual'}
          </button>

          <button
            onClick={loadSheetPreviews}
            disabled={previewLoading || !staticPipelineResult?.result_files}
            style={{ padding: '0.55rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#334155', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
          >
            {previewLoading ? 'Cargando...' : '📄 Visualizar documentos'}
          </button>
        </div>

        {error && <p style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>⚠️ {error}</p>}

        {/* Comparativa */}
        {manualComparisonResult && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', background: '#fff', marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>✅ Comparativa pipeline vs manual</h3>
            <div style={{ color: '#334155', fontSize: '0.88rem', marginBottom: '0.6rem' }}>
              Referencia manual: <strong>{manualComparisonResult.manual_file}</strong>
            </div>

            <div style={{ padding: '0.6rem', borderRadius: '8px', marginBottom: '0.8rem', background: manualComparisonResult.comparison_ok ? '#ecfdf5' : '#fef2f2', color: manualComparisonResult.comparison_ok ? '#065f46' : '#b91c1c', border: `1px solid ${manualComparisonResult.comparison_ok ? '#bbf7d0' : '#fecaca'}` }}>
              {manualComparisonResult.comparison_ok
                ? 'Match 1:1 contra las dos salidas manuales (sin diferencias de filas comparables).'
                : 'Se detectaron diferencias entre pipeline y manual; revisar métricas por hoja.'}
            </div>

            <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {([
                ['CDO Trabajada', manualComparisonResult.results.cdo_trabajada],
                ['PF Trabajada', manualComparisonResult.results.pf_trabajada],
              ] as const).map(([title, r]) => (
                <div key={title} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.7rem', background: '#f8fafc' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{title}</div>
                  <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                    <div>Filas manual: <strong>{r.manual_rows}</strong></div>
                    <div>Filas pipeline: <strong>{r.output_rows}</strong></div>
                    <div>Intersección: <strong>{r.rows_intersection}</strong></div>
                    <div>Solo manual: <strong>{r.rows_only_manual}</strong></div>
                    <div>Solo pipeline: <strong>{r.rows_only_output}</strong></div>
                    <div>Columnas comunes: <strong>{r.common_columns}</strong></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visual docs */}
        {sheetPreviews && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', background: '#fff', marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>📚 Visualización y edición lado a lado</h3>
            <div style={{ color: '#475569', fontSize: '0.84rem', marginBottom: '0.8rem' }}>
              El pipeline es editable. Las celdas con <strong style={{ color: '#b91c1c' }}>VER Dif.</strong> se marcan en rojo.
            </div>

            {/* Botones de descarga */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
              <a
                href={staticPipelineResult?.result_files?.cdo_trabajada?.download_url || `/api/v1/excel/download/${staticPipelineResult?.result.file_id || ''}`}
                download
                style={{ display: 'inline-block', padding: '0.55rem 0.85rem', background: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem' }}
              >
                📥 Descargar CDO Trabajada
              </a>
              <a
                href={staticPipelineResult?.result_files?.pf_trabajada?.download_url || `/api/v1/excel/download/${staticPipelineResult?.result.file_id || ''}`}
                download
                style={{ display: 'inline-block', padding: '0.55rem 0.85rem', background: '#0f766e', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem' }}
              >
                📥 Descargar PF Trabajada
              </a>
            </div>

            <div style={{ marginBottom: '0.9rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>CDO Trabajada</div>
              <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '0.6rem', background: '#f8fbff' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Manual (solo lectura)</div>
                  {renderPreviewTable(sheetPreviews.manualCdo, 0)}
                </div>
                <div style={{ border: '1px solid #dbeafe', borderRadius: '10px', padding: '0.6rem', background: '#f8fbff' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Pipeline (editable)</div>
                  {renderEditablePipelineTable('cdo')}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>PF Trabajada</div>
              <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div style={{ border: '1px solid #dcfce7', borderRadius: '10px', padding: '0.6rem', background: '#f7fff9' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Manual (solo lectura)</div>
                  {renderPreviewTable(sheetPreviews.manualPf, 0)}
                </div>
                <div style={{ border: '1px solid #dcfce7', borderRadius: '10px', padding: '0.6rem', background: '#f7fff9' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Pipeline (editable)</div>
                  {renderEditablePipelineTable('pf')}
                </div>
              </div>
            </div>
          </div>
        )}

        {!manualComparisonResult && !sheetPreviews && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
            <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>🔍</div>
            <div>Ejecutá el pipeline en la pestaña <strong>📊 Datos</strong> y luego compará contra el manual.</div>
          </div>
        )}
      </div>
    )
  }

  /* ───────────── MAIN RENDER ───────────── */

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '1rem', maxWidth: '1400px', margin: '0 auto', color: '#1e293b' }}>
      {renderHeader()}
      {renderProcessSelector()}
      {renderTabs()}

      {activeTab === 'datos' && renderDatosTab()}
      {activeTab === 'auditoria' && renderAuditoriaTab()}
    </div>
  )
}
