/**
 * ContadoTable — Tabla editable con colaboración en tiempo real (WebSocket).
 * - Indicador de presencia: avatares de quién está conectado
 * - Lock visual: celda con borde de color del usuario que la está editando
 * - Updates remotos: cambios de otros se reflejan en tiempo real
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useContadoWS, getTabId } from '../hooks/useContadoWS'

export interface ContadoRow {
  _row_idx: number
  _color: 'red' | 'yellow' | 'none'
  [key: string]: unknown
}

interface ContadoTableProps {
  rows: ContadoRow[]
  columns: string[]
  onSave: (rows: ContadoRow[]) => void
  saveLoading: boolean
  currentUser?: string   // quién es el usuario actual (default: 'edith')
}

const REFERENTES = ['BA', 'CC', 'JU', 'RO', 'SA', 'HM', 'HMS', 'MRA', 'FN', 'NDS', 'NDE']
const ESTADOS    = ['ED', 'DT', 'TT', 'RL', 'RT', 'DO', 'DI', 'OB', 'NR']

const COLOR_STYLE: Record<string, React.CSSProperties> = {
  red:    { background: '#fee2e2' },
  yellow: { background: '#fef9c3' },
  none:   { background: '' },
}

// Avatar de usuario (círculo con iniciales + color)
function Avatar({ user, color, title }: { user: string; color: string; title?: string }) {
  const initials = user.slice(0, 2).toUpperCase()
  return (
    <div title={title ?? user} style={{
      width: '28px', height: '28px', borderRadius: '50%',
      background: color, color: '#fff', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: '0.65rem', fontWeight: 700,
      border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

export default function ContadoTable({
  rows, columns, onSave, saveLoading, currentUser
}: ContadoTableProps) {
  // Si no viene currentUser del padre, generar uno por pestaña con sessionStorage
  const resolvedUser = currentUser || getTabId()
  const [data, setData] = useState<ContadoRow[]>(() => rows.map(r => ({ ...r })))

  // Filtros
  const [filterText,       setFilterText]       = useState('')
  const [filterColor,      setFilterColor]       = useState<'all' | 'red' | 'yellow' | 'none'>('all')
  const [filterEstado,     setFilterEstado]      = useState<string>('all')
  const [filterRef,        setFilterRef]         = useState<string>('all')
  const [filterSucDest,    setFilterSucDest]     = useState<string>('all')
  const [filterSucCobro,   setFilterSucCobro]    = useState<string>('all')
  const [filterSucOri,     setFilterSucOri]      = useState<string>('all')
  const [filterClase,      setFilterClase]       = useState<string>('all')
  const [filterJustif,     setFilterJustif]      = useState<string>('all')
  const [filterObserv,     setFilterObserv]      = useState<string>('all')
  const [filterSinAsignar, setFilterSinAsignar]  = useState(false)
  const [filterDiasMin,    setFilterDiasMin]     = useState('')
  const [filterOrigen,     setFilterOrigen]      = useState<string>('all')

  // WebSocket colaboración
  const { connected, presence, cellLocksVer, getCellLocks, sendEditing, sendUpdate, sendLeave, wsRef } =
    useContadoWS(resolvedUser)

  // Columna "nro" para identificar filas en WS
  const COL_NRO = columns.find(c => c.toLowerCase() === 'nro') ?? 'nro'

  // Escuchar updates remotos (otros usuarios editaron una celda)
  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return
    const handler = (ev: Event) => {
      const msg = (ev as CustomEvent).detail
      if (msg.type === 'cell_update') {
        setData(prev => prev.map(r =>
          String(r[COL_NRO]) === msg.nro ? { ...r, [msg.col]: msg.value } : r
        ))
      }
    }
    ws.addEventListener('remote_update', handler)
    return () => ws.removeEventListener('remote_update', handler)
  }, [wsRef.current, COL_NRO])

  // Detectar columnas clave
  const colLower    = columns.map(c => c.toLowerCase())
  const COL_ESTADO  = columns.find((_, i) => colLower[i].includes('estado')) ?? ''
  const COL_REF     = columns.find((_, i) => colLower[i].includes('referente') || colLower[i].includes('refer')) ?? ''
  const COL_SUCDEST  = columns.find((_, i) => colLower[i].includes('sucdest')) ?? ''
  const COL_SUCCOBRO = columns.find((_, i) => colLower[i].includes('succobro')) ?? ''
  const COL_SUCORI   = columns.find((_, i) => colLower[i] === 'sucori') ?? ''
  const COL_CLASE    = columns.find((_, i) => colLower[i] === 'clase') ?? ''
  const COL_DIAS    = columns.find((_, i) => colLower[i].includes('dias') || colLower[i].includes('atraso')) ?? ''
  const COL_JUSTIF  = columns.find((_, i) => colLower[i].includes('justif')) ?? ''
  const COL_ORIGEN  = columns.find(c => c === '__ORIGEN__') ?? ''

  // Columnas que NO se muestran en la tabla (metadatos internos)
  const HIDDEN_COLS = new Set(['__ORIGEN__'])
  const COL_OBSERV  = columns.find((_, i) => {
    const c = colLower[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return c.includes('observ')
  }) ?? ''
  const COL_FECHAEDIT = columns.find((_, i) => colLower[i].includes('fechaedit')) ?? ''

  // Filtrado
  const filtered = useMemo(() => {
    return data.filter(row => {
      if (filterColor !== 'all' && row._color !== filterColor) return false
      if (filterEstado !== 'all' && String(row[COL_ESTADO] ?? '') !== filterEstado) return false
      if (filterRef !== 'all') {
        const val = String(row[COL_REF] ?? '').trim()
        if (filterRef === '__empty__') { if (val !== '') return false }
        else { if (val !== filterRef) return false }
      }
      if (filterSucDest !== 'all' && String(row[COL_SUCDEST] ?? '') !== filterSucDest) return false
      if (filterSucCobro !== 'all' && String(row[COL_SUCCOBRO] ?? '') !== filterSucCobro) return false
      if (filterSucOri !== 'all' && String(row[COL_SUCORI] ?? '') !== filterSucOri) return false
      if (filterClase !== 'all' && String(row[COL_CLASE] ?? '') !== filterClase) return false
      if (filterOrigen !== 'all' && COL_ORIGEN && String(row[COL_ORIGEN] ?? '') !== filterOrigen) return false
      if (filterJustif !== 'all') {
        const val = String(row[COL_JUSTIF] ?? '').trim()
        if (filterJustif === '__empty__') { if (val !== '') return false }
        else { if (val !== filterJustif) return false }
      }
      if (filterObserv !== 'all') {
        const val = String(row[COL_OBSERV] ?? '').trim()
        if (filterObserv === '__empty__') { if (val !== '') return false }
        else { if (val !== filterObserv) return false }
      }
      if (filterSinAsignar) {
        const ref = String(row[COL_REF] ?? '').trim().toUpperCase()
        if (ref !== 'NDS' && ref !== 'NDE' && ref !== '') return false
      }
      if (filterDiasMin !== '') {
        const minVal = parseFloat(filterDiasMin)
        const raw = row[COL_DIAS]
        const dias = (raw !== '' && raw !== null && raw !== undefined) ? parseFloat(String(raw)) : NaN
        if (isNaN(dias) || dias < minVal) return false
      }
      if (filterText.trim()) {
        const q = filterText.toLowerCase()
        return columns.some(col => String(row[col] ?? '').toLowerCase().includes(q))
      }
      return true
    })
  }, [data, filterColor, filterEstado, filterRef, filterSucDest, filterSucCobro, filterSucOri, filterClase,
      filterJustif, filterObserv, filterSinAsignar, filterDiasMin, filterOrigen, filterText, columns,
      COL_ESTADO, COL_REF, COL_SUCDEST, COL_SUCCOBRO, COL_SUCORI, COL_CLASE, COL_ORIGEN, COL_JUSTIF, COL_OBSERV, COL_DIAS])

  // Valores únicos dinámicos
  const sucDestValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_SUCDEST] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_SUCDEST])

  const sucCobroValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_SUCCOBRO] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_SUCCOBRO])

  const sucOriValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_SUCORI] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_SUCORI])

  const claseValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_CLASE] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_CLASE])

  const justifValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_JUSTIF] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_JUSTIF])

  const observValues = useMemo(() =>
    [...new Set(data.map(r => String(r[COL_OBSERV] ?? '').trim()).filter(Boolean))].sort()
  , [data, COL_OBSERV])

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

  // Edición local
  const handleCellChange = useCallback((rowIdx: number, col: string, value: string) => {
    setData(prev => prev.map(r =>
      r._row_idx === rowIdx ? { ...r, [col]: value } : r
    ))
  }, [])

  // WS: al hacer focus → lock; al blur → update + unlock
  const handleCellFocus = useCallback((row: ContadoRow, col: string, isLockedByOther: boolean) => {
    // No emitir editing si la celda ya la tiene otro — evita sobre-escribir el lock
    if (isLockedByOther) return
    const nro = String(row[COL_NRO] ?? '')
    if (nro) sendEditing(nro, col)
  }, [COL_NRO, sendEditing])

  const handleCellBlur = useCallback((row: ContadoRow, col: string, value: string) => {
    handleCellChange(row._row_idx, col, value)
    const nro = String(row[COL_NRO] ?? '')
    if (nro) sendUpdate(nro, col, value)
  }, [COL_NRO, sendUpdate, handleCellChange])

  const resetFilters = () => {
    setFilterText(''); setFilterColor('all'); setFilterEstado('all')
    setFilterRef('all'); setFilterSucDest('all'); setFilterSucCobro('all')
    setFilterSucOri('all'); setFilterClase('all')
    setFilterJustif('all'); setFilterObserv('all'); setFilterSinAsignar(false)
    setFilterDiasMin(''); setFilterOrigen('all')
  }

  // Estilo de celda con lock visual de otros usuarios
  const cellStyle = (row: ContadoRow, col: string): React.CSSProperties => {
    const nro = String(row[COL_NRO] ?? '')
    const lockKey = `${nro}::${col}`
    const lock = getCellLocks().get(lockKey)
    const lockedByOther = !!lock && lock.user !== resolvedUser
    const isManual = [COL_ESTADO, COL_REF,
      columns.find(c => c.toLowerCase().includes('justif')) ?? '',
      columns.find(c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('observ')) ?? '',
    ].includes(col)

    // Colorear celda DIAS_ATRASO según tolerancia por succobro
    let diasBg = ''
    if (col === COL_DIAS) {
      const dias = parseInt(String(row[col] ?? ''), 10)
      const succobro = String(row[COL_SUCCOBRO] ?? '').trim().toUpperCase()
      const tolerancia = succobro === 'CC' ? 4 : 7
      if (!isNaN(dias)) {
        if (dias > tolerancia) diasBg = '#fee2e2'
        else if (dias > Math.floor(tolerancia * 0.7)) diasBg = '#fef9c3'
        else if (dias >= 0) diasBg = '#dcfce7'
      }
    }

    // VER DIF → celda OBSERVACIÓN en rojo
    const isVerDif = col === COL_OBSERV &&
      String(row[col] ?? '').trim().toUpperCase() === 'VER DIF'

    // fechaedit → rojo si DIAS_ATRASO supera tolerancia
    let fechaRojo = false
    if (col === COL_FECHAEDIT && COL_FECHAEDIT) {
      const dias = parseInt(String(row[COL_DIAS] ?? ''), 10)
      const succobro = String(row[COL_SUCCOBRO] ?? '').trim().toUpperCase()
      const tolerancia = succobro === 'CC' ? 4 : 7
      if (!isNaN(dias) && dias > tolerancia) fechaRojo = true
    }

    const cellBg = isVerDif || fechaRojo ? '#fee2e2' : diasBg || undefined

    return {
      ...(cellBg ? { background: cellBg } : {}),
      padding: '0.2rem 0.35rem',
      border: lockedByOther ? `2px solid ${lock!.color}` : '1px solid #e2e8f0',
      minWidth: isManual ? '130px' : '100px',
      maxWidth: '220px',
      fontSize: '0.73rem',
      position: 'relative',
    }
  }

  // cellLocksVer se consume aquí para que React re-renderice la tabla
  // cuando cambia un lock remoto — pero SIN tocar el estado de los inputs
  void cellLocksVer

  // Usuarios conectados distintos al actual
  const otherUsers = presence.filter(u => u.user !== resolvedUser)

  return (
    <div>
      {/* ── Barra de presencia ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem', minHeight: '36px' }}>
        {/* Badge "esta pestaña" */}
        <span style={{ fontSize: '0.72rem', background: '#1e293b', color: '#fff', padding: '0.2rem 0.55rem', borderRadius: '6px', fontWeight: 700 }}>
          Vos: {resolvedUser}
        </span>
        <span style={{ fontSize: '0.75rem', color: connected ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
          {connected ? '🟢 En línea' : '🔴 Reconectando...'}
        </span>
        {presence.length > 0 && (
          <>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {presence.length} {presence.length === 1 ? 'usuario' : 'usuarios'} activos:
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {presence.map(u => (
                <Avatar
                  key={u.user}
                  user={u.user}
                  color={u.color}
                  title={u.editing_nro
                    ? `${u.user} editando ${u.editing_col} en ${u.editing_nro}`
                    : u.user}
                />
              ))}
            </div>
          </>
        )}
        {otherUsers.some(u => u.editing_nro) && (
          <span style={{ fontSize: '0.73rem', color: '#7c3aed', background: '#f5f3ff', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
            ✏️ {otherUsers.filter(u => u.editing_nro).map(u =>
              `${u.user} → col ${u.editing_col}`
            ).join(' · ')}
          </span>
        )}
      </div>

      {/* ── Contadores ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.8rem' }}>
        {[
          { label: 'Total',    value: counts.total,   color: '#1e293b' },
          { label: 'Visibles', value: counts.visible,  color: '#2563eb' },
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
            <option value="__empty__">⬜ Sin referente</option>
            {refValues.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {COL_SUCCOBRO && sucCobroValues.length > 0 && (
          <select value={filterSucCobro} onChange={e => setFilterSucCobro(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
            <option value="all">🏦 Suc. cobro (todas)</option>
            {sucCobroValues.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {COL_SUCDEST && sucDestValues.length > 0 && (
          <select value={filterSucDest} onChange={e => setFilterSucDest(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
            <option value="all">🏢 Todas las sucdest</option>
            {sucDestValues.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {COL_SUCORI && sucOriValues.length > 0 && (
          <select value={filterSucOri} onChange={e => setFilterSucOri(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
            <option value="all">📍 Suc. origen (todas)</option>
            {sucOriValues.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {COL_CLASE && claseValues.length > 0 && (
          <select value={filterClase} onChange={e => setFilterClase(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}>
            <option value="all">📦 Clase (todas)</option>
            {claseValues.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {COL_JUSTIF && (
          <select value={filterJustif} onChange={e => setFilterJustif(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', maxWidth: '180px' }}>
            <option value="all">📝 Todas las justificaciones</option>
            <option value="__empty__">⬜ Sin justificación</option>
            {justifValues.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        )}
        {COL_OBSERV && (
          <select value={filterObserv} onChange={e => setFilterObserv(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', maxWidth: '180px' }}>
            <option value="all">💬 Todas las observaciones</option>
            <option value="__empty__">⬜ Sin observación</option>
            {observValues.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {COL_DIAS && (
          <input type="number" placeholder="Atraso mín. días" value={filterDiasMin}
            onChange={e => setFilterDiasMin(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', width: '130px' }}
          />
        )}
        {COL_REF && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={filterSinAsignar} onChange={e => setFilterSinAsignar(e.target.checked)} />
            Sin asignar (NDS / NDE)
          </label>
        )}
        <button onClick={resetFilters}
          style={{ padding: '0.35rem 0.7rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}>
          ✕ Limpiar
        </button>
        <button onClick={() => onSave(data)} disabled={saveLoading}
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
              {columns.filter(col => !HIDDEN_COLS.has(col)).map(col => (
                <th key={col} style={{ background: '#1e293b', color: '#fff', padding: '0.4rem 0.5rem', border: '1px solid #334155', whiteSpace: 'nowrap', minWidth: '100px' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Sin resultados.</td></tr>
            )}
            {filtered.map((row, visIdx) => {
              const nro    = String(row[COL_NRO] ?? '')
              const origen = COL_ORIGEN ? String(row[COL_ORIGEN] ?? '') : ''
              return (
                <tr key={row._row_idx}>
                  <td style={{ padding: '0.2rem 0.4rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.68rem', textAlign: 'center' }}>
                    {visIdx + 1}
                  </td>
                  {columns.filter(col => !HIDDEN_COLS.has(col)).map(col => {
                    const lockKey  = `${nro}::${col}`
                    const lock     = getCellLocks().get(lockKey)
                    const lockedByOther = !!lock && lock.user !== resolvedUser
                    const isNroCol = col === COL_NRO
                    return (
                      <td key={col} style={{ ...cellStyle(row, col), position: 'relative' }} title={lockedByOther ? `✏️ ${lock!.user} está editando` : undefined}>
                        {lockedByOther && (
                          <div style={{
                            position: 'absolute', top: 0, right: 0,
                            background: lock!.color, color: '#fff',
                            fontSize: '0.55rem', padding: '1px 4px',
                            borderRadius: '0 0 0 4px', fontWeight: 700,
                            zIndex: 2, lineHeight: 1.4,
                          }}>
                            {lock!.user.slice(0, 3).toUpperCase()}
                          </div>
                        )}
                        {/* Badge NUEVO / CAMBIO sobre la celda NRO */}
                        {isNroCol && origen === 'NUEVO' && (
                          <span style={{
                            display: 'inline-block', marginRight: '4px',
                            background: '#f59e0b', color: '#fff',
                            fontSize: '0.58rem', fontWeight: 800,
                            padding: '1px 5px', borderRadius: '4px',
                            verticalAlign: 'middle', letterSpacing: '0.03em',
                          }}>NUEVO</span>
                        )}
                        {isNroCol && origen === 'EXISTENTE_CAMBIO' && (
                          <span style={{
                            display: 'inline-block', marginRight: '4px',
                            background: '#ef4444', color: '#fff',
                            fontSize: '0.58rem', fontWeight: 800,
                            padding: '1px 5px', borderRadius: '4px',
                            verticalAlign: 'middle', letterSpacing: '0.03em',
                          }}>CAMBIO</span>
                        )}
                        <input
                          key={`${row._row_idx}-${col}`}
                          defaultValue={String(row[col] ?? '')}
                          onFocus={() => handleCellFocus(row, col, lockedByOther || col === COL_DIAS)}
                          onBlur={e => handleCellBlur(row, col, e.target.value)}
                          readOnly={lockedByOther || col === COL_DIAS}
                          style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            fontSize: '0.73rem',
                            outline: 'none',
                            cursor: (lockedByOther || col === COL_DIAS) ? 'default' : 'text',
                            color: lockedByOther ? '#94a3b8' : '#1e293b',
                          }}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
        Mostrando {counts.visible} de {counts.total} registros · Celdas con borde de color = editadas por otro usuario en este momento
      </div>
    </div>
  )
}
