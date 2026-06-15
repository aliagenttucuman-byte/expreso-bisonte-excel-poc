/**
 * ContadoTable — Tabla editable completa para el FINAL de Cobranzas Contado.
 * - Todas las columnas/filas editables
 * - Filtros operativos basados en lo relevado con Edith
 * - Colores rojo/amarillo preservados
 * - Contadores en tiempo real
 * - Exportar FINAL editado
 */

import { useState, useMemo, useRef, useCallback } from 'react'

export interface ContadoRow {
  _row_idx: number          // índice original para preservar orden
  _color: 'red' | 'yellow' | 'none'  // rojo=estado cambió, amarillo=nuevo
  [key: string]: unknown
}

interface ContadoTableProps {
  rows: ContadoRow[]
  columns: string[]
  onSave: (rows: ContadoRow[]) => void
  saveLoading: boolean
}

const REFERENTES = ['BA', 'CC', 'JU', 'RO', 'SA', 'HM', 'HMS', 'MRA', 'FN', 'NDS', 'NDE']
const ESTADOS    = ['ED', 'DT', 'TT', 'RL', 'RT', 'DO', 'DI', 'OB', 'NR']

const COLOR_STYLE: Record<string, React.CSSProperties> = {
  red:    { background: '#fee2e2' },
  yellow: { background: '#fef9c3' },
  none:   { background: '' },
}

const COLOR_HEADER_STYLE: Record<string, React.CSSProperties> = {
  red:    { background: '#fca5a5' },
  yellow: { background: '#fde68a' },
  none:   { background: '' },
}

export default function ContadoTable({ rows, columns, onSave, saveLoading }: ContadoTableProps) {
  const [data, setData]           = useState<ContadoRow[]>(() => rows.map(r => ({ ...r })))
  const [filterText, setFilterText] = useState('')
  const [filterColor, setFilterColor] = useState<'all' | 'red' | 'yellow' | 'none'>('all')
  const [filterEstado, setFilterEstado] = useState<string>('all')
  const [filterRef, setFilterRef]         = useState<string>('all')
  const [filterSucDest, setFilterSucDest] = useState<string>('all')
  const [filterJustif, setFilterJustif]   = useState<string>('all')
  const [filterSinAsignar, setFilterSinAsignar] = useState(false)
  const [filterDiasMin, setFilterDiasMin] = useState('')
  const editingRef = useRef<{ rowIdx: number; col: string } | null>(null)

  // Detectar columnas clave (case-insensitive)
  const colLower    = columns.map(c => c.toLowerCase())
  const COL_ESTADO  = columns.find((_, i) => colLower[i].includes('estado')) ?? ''
  const COL_REF     = columns.find((_, i) => colLower[i].includes('referente') || colLower[i].includes('refer')) ?? ''
  const COL_SUCDEST = columns.find((_, i) => colLower[i].includes('sucdest')) ?? ''
  const COL_DIAS    = columns.find((_, i) => colLower[i].includes('dias') || colLower[i].includes('atraso')) ?? ''
  const COL_JUSTIF  = columns.find((_, i) => colLower[i].includes('justif')) ?? ''

  // Filtrado
  const filtered = useMemo(() => {
    return data.filter(row => {
      if (filterColor !== 'all' && row._color !== filterColor) return false
      if (filterEstado !== 'all' && String(row[COL_ESTADO] ?? '') !== filterEstado) return false
      if (filterRef !== 'all' && String(row[COL_REF] ?? '') !== filterRef) return false
      if (filterSucDest !== 'all' && String(row[COL_SUCDEST] ?? '') !== filterSucDest) return false
      if (filterJustif !== 'all' && String(row[COL_JUSTIF] ?? '') !== filterJustif) return false
      if (filterSinAsignar) {
        const ref = String(row[COL_REF] ?? '').trim().toUpperCase()
        if (ref !== 'NDS' && ref !== 'NDE' && ref !== '') return false
      }
      if (filterDiasMin !== '') {
        const minVal = parseFloat(filterDiasMin)
        const raw = row[COL_DIAS]
        const dias = (raw !== '' && raw !== null && raw !== undefined) ? parseFloat(String(raw)) : NaN
        // Si no tiene dato de días, o es menor al mínimo → filtrar
        if (isNaN(dias) || dias < minVal) return false
      }
      if (filterText.trim()) {
        const q = filterText.toLowerCase()
        return columns.some(col => String(row[col] ?? '').toLowerCase().includes(q))
      }
      return true
    })
  }, [data, filterColor, filterEstado, filterRef, filterSucDest, filterJustif, filterSinAsignar, filterDiasMin, filterText, columns, COL_ESTADO, COL_REF, COL_SUCDEST, COL_JUSTIF, COL_DIAS])

  // Valores únicos dinámicos
  const sucDestValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_SUCDEST] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_SUCDEST])

  const justifValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_JUSTIF] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_JUSTIF])

  const refValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_REF] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_REF])

  // Contadores
  const counts = useMemo(() => ({
    total:      data.length,
    visible:    filtered.length,
    rojos:      data.filter(r => r._color === 'red').length,
    amarillos:  data.filter(r => r._color === 'yellow').length,
    sinAsignar: data.filter(r => {
      const ref = String(r[COL_REF] ?? '').trim().toUpperCase()
      return ref === 'NDS' || ref === 'NDE' || ref === ''
    }).length,
  }), [data, filtered, COL_REF])

  const handleCellChange = useCallback((rowIdx: number, col: string, value: string) => {
    setData(prev => prev.map(r =>
      r._row_idx === rowIdx ? { ...r, [col]: value } : r
    ))
  }, [])

  const resetFilters = () => {
    setFilterText('')
    setFilterColor('all')
    setFilterEstado('all')
    setFilterRef('all')
    setFilterSucDest('all')
    setFilterJustif('all')
    setFilterSinAsignar(false)
    setFilterDiasMin('')
  }

  const cellStyle = (row: ContadoRow, col: string): React.CSSProperties => {
    const base = COLOR_STYLE[row._color] ?? {}
    const isManual = [COL_ESTADO, COL_REF,
      columns.find(c => c.toLowerCase().includes('justif')) ?? '',
      columns.find(c => c.toLowerCase().includes('observ')) ?? '',
    ].includes(col)
    return {
      ...base,
      padding: '0.2rem 0.35rem',
      border: '1px solid #e2e8f0',
      minWidth: isManual ? '130px' : '100px',
      maxWidth: '220px',
      fontSize: '0.73rem',
    }
  }

  return (
    <div>
      {/* ── Contadores ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.8rem' }}>
        {[
          { label: 'Total', value: counts.total, color: '#1e293b' },
          { label: 'Visibles', value: counts.visible, color: '#2563eb' },
          { label: '🔴 Rojos', value: counts.rojos, color: '#dc2626' },
          { label: '🟡 Amarillos', value: counts.amarillos, color: '#d97706' },
          { label: '⚠️ Sin asignar', value: counts.sinAsignar, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.4rem 0.8rem', background: '#f8fafc', textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.7rem', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.8rem' }}>
        <input
          placeholder="🔍 Buscar en toda la tabla..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', minWidth: '200px' }}
        />

        <select value={filterColor} onChange={e => setFilterColor(e.target.value as any)}
          style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
          <option value="all">🎨 Todos los colores</option>
          <option value="red">🔴 Solo rojos</option>
          <option value="yellow">🟡 Solo amarillos</option>
          <option value="none">⚪ Sin color</option>
        </select>

        {COL_ESTADO && (
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
            <option value="all">📋 Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}

        {COL_REF && refValues.length > 0 && (
          <select value={filterRef} onChange={e => setFilterRef(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
            <option value="all">👤 Todos los referentes</option>
            {refValues.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        {COL_SUCDEST && sucDestValues.length > 0 && (
          <select value={filterSucDest} onChange={e => setFilterSucDest(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
            <option value="all">🏢 Todas las sucdest</option>
            {sucDestValues.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {COL_JUSTIF && justifValues.length > 0 && (
          <select value={filterJustif} onChange={e => setFilterJustif(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', maxWidth: '180px' }}>
            <option value="all">📝 Todas las justificaciones</option>
            {justifValues.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        )}

        {COL_DIAS && (
          <input
            type="number"
            placeholder="Atraso mín. días"
            value={filterDiasMin}
            onChange={e => setFilterDiasMin(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', width: '130px' }}
          />
        )}

        {COL_REF && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={filterSinAsignar} onChange={e => setFilterSinAsignar(e.target.checked)} />
            Sin asignar (NDS/NDE)
          </label>
        )}

        <button onClick={resetFilters}
          style={{ padding: '0.35rem 0.7rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}>
          ✕ Limpiar
        </button>

        <button
          onClick={() => onSave(data)}
          disabled={saveLoading}
          style={{ marginLeft: 'auto', padding: '0.4rem 1rem', borderRadius: '6px', background: saveLoading ? '#94a3b8' : '#16a34a', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: saveLoading ? 'not-allowed' : 'pointer' }}>
          {saveLoading ? '⏳ Guardando...' : '💾 Guardar y descargar FINAL'}
        </button>
      </div>

      {/* ── Tabla ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '65vh', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.73rem', minWidth: `${columns.length * 120}px` }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr>
              <th style={{ background: '#1e293b', color: '#fff', padding: '0.4rem 0.5rem', border: '1px solid #334155', whiteSpace: 'nowrap', minWidth: '40px' }}>#</th>
              {columns.map(col => (
                <th key={col} style={{ background: '#1e293b', color: '#fff', padding: '0.4rem 0.5rem', border: '1px solid #334155', whiteSpace: 'nowrap', minWidth: '100px' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Sin resultados para los filtros aplicados.</td></tr>
            )}
            {filtered.map((row, visIdx) => (
              <tr key={row._row_idx}>
                <td style={{ ...COLOR_STYLE[row._color], padding: '0.2rem 0.4rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.68rem', textAlign: 'center' }}>
                  {visIdx + 1}
                </td>
                {columns.map(col => (
                  <td key={col} style={cellStyle(row, col)}>
                    <input
                      defaultValue={String(row[col] ?? '')}
                      onBlur={e => handleCellChange(row._row_idx, col, e.target.value)}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.73rem',
                        outline: 'none',
                        cursor: 'text',
                        color: '#1e293b',
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
        Mostrando {counts.visible} de {counts.total} registros · Todas las celdas son editables · Los cambios se guardan al hacer clic en "Guardar y descargar FINAL"
      </div>
    </div>
  )
}
