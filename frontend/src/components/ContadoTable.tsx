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

// Paleta "Tech Innovation" oscura
const C = {
  bg:       '#0f172a',
  panel:    '#1e293b',
  card:     '#334155',
  blue:     '#3b82f6',
  orange:   '#f97316',
  text:     '#f1f5f9',
  muted:    '#94a3b8',
  border:   '#475569',
  red:      '#ef4444',
  yellow:   '#eab308',
  green:    '#22c55e',
  redBg:    'rgba(239,68,68,0.15)',
  yellowBg: 'rgba(234,179,8,0.15)',
  greenBg:  'rgba(34,197,94,0.15)',
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
      border: `2px solid ${C.border}`, boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

// Spinner inline
function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: '14px', height: '14px',
      border: `2px solid rgba(255,255,255,0.3)`,
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      verticalAlign: 'middle',
      marginRight: '6px',
    }} />
  )
}

export default function ContadoTable({
  rows, columns, onSave, saveLoading, currentUser
}: ContadoTableProps) {
  // Si no viene currentUser del padre, generar uno por pestaña con sessionStorage
  const resolvedUser = currentUser || getTabId()
  const [data, setData] = useState<ContadoRow[]>(() => rows.map(r => ({ ...r })))
  const [pendingChanges, setPendingChanges] = useState(0)

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
    setPendingChanges(p => p + 1)
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
    let diasColor = ''
    if (col === COL_DIAS) {
      const dias = parseInt(String(row[col] ?? ''), 10)
      const succobro = String(row[COL_SUCCOBRO] ?? '').trim().toUpperCase()
      const tolerancia = succobro === 'CC' ? 4 : 7
      if (!isNaN(dias)) {
        if (dias > tolerancia) { diasBg = C.redBg; diasColor = C.red }
        else if (dias > Math.floor(tolerancia * 0.7)) { diasBg = C.yellowBg; diasColor = C.yellow }
        else if (dias >= 0) { diasBg = C.greenBg; diasColor = C.green }
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

    const cellBg = isVerDif || fechaRojo ? C.redBg : diasBg || undefined
    const cellColor = isVerDif || fechaRojo ? C.red : diasColor || undefined

    return {
      ...(cellBg ? { background: cellBg } : {}),
      ...(cellColor ? { color: cellColor } : {}),
      padding: '0.25rem 0.4rem',
      border: lockedByOther
        ? `2px solid ${lock!.color}`
        : `1px solid ${C.border}`,
      minWidth: isManual ? '130px' : '100px',
      maxWidth: '220px',
      fontSize: '0.72rem',
      position: 'relative',
      verticalAlign: 'middle',
    }
  }

  // cellLocksVer se consume aquí para que React re-renderice la tabla
  // cuando cambia un lock remoto — pero SIN tocar el estado de los inputs
  void cellLocksVer

  // Usuarios conectados distintos al actual
  const otherUsers = presence.filter(u => u.user !== resolvedUser)

  const selectStyle: React.CSSProperties = {
    padding: '0.3rem 0.5rem',
    borderRadius: '6px',
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    fontSize: '0.78rem',
    cursor: 'pointer',
    outline: 'none',
  }

  const inputFilterStyle: React.CSSProperties = {
    padding: '0.3rem 0.55rem',
    borderRadius: '6px',
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    fontSize: '0.78rem',
    outline: 'none',
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ct-filter-select:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.25); }
        .ct-filter-input:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.25); }
        .ct-table-row:hover td { background: ${C.card} !important; }
        .ct-cell-input:focus { outline: 2px solid ${C.blue} !important; outline-offset: -2px; border-radius: 3px; }
      `}</style>

      {/* ── Barra de presencia ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        marginBottom: '0.9rem', minHeight: '36px',
        padding: '0.45rem 0.7rem',
        background: C.panel,
        borderRadius: '8px',
        border: `1px solid ${C.border}`,
        flexWrap: 'wrap',
      }}>
        {/* Badge "esta pestaña" */}
        <span style={{
          fontSize: '0.7rem', background: C.card,
          color: C.text, padding: '0.2rem 0.6rem',
          borderRadius: '6px', fontWeight: 700,
          border: `1px solid ${C.border}`,
        }}>
          👤 {resolvedUser}
        </span>

        <span style={{
          fontSize: '0.72rem',
          color: connected ? C.green : C.red,
          fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <span style={{
            display: 'inline-block', width: '7px', height: '7px',
            borderRadius: '50%',
            background: connected ? C.green : C.red,
            boxShadow: connected ? `0 0 6px ${C.green}` : `0 0 6px ${C.red}`,
          }} />
          {connected ? 'En línea' : 'Reconectando...'}
        </span>

        {presence.length > 0 && (
          <>
            <span style={{ fontSize: '0.72rem', color: C.muted }}>
              {presence.length} {presence.length === 1 ? 'usuario' : 'usuarios'} activos
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
          <span style={{
            fontSize: '0.7rem', color: '#a78bfa',
            background: 'rgba(167,139,250,0.12)',
            padding: '0.2rem 0.6rem', borderRadius: '6px',
            border: '1px solid rgba(167,139,250,0.3)',
          }}>
            ✏️ {otherUsers.filter(u => u.editing_nro).map(u =>
              `${u.user} → col ${u.editing_col}`
            ).join(' · ')}
          </span>
        )}
      </div>

      {/* ── Cards de estadísticas ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.9rem' }}>
        {[
          { label: 'TOTAL',      value: counts.total,      icon: '📋', color: C.blue,   bgGlow: 'rgba(59,130,246,0.12)'   },
          { label: 'VISIBLES',   value: counts.visible,    icon: '👁',  color: C.text,   bgGlow: 'rgba(241,245,249,0.06)'  },
          { label: 'ROJOS',      value: counts.rojos,      icon: '🔴', color: C.red,    bgGlow: 'rgba(239,68,68,0.12)'    },
          { label: 'AMARILLOS',  value: counts.amarillos,  icon: '🟡', color: C.yellow, bgGlow: 'rgba(234,179,8,0.12)'    },
          { label: 'SIN ASIG.',  value: counts.sinAsignar, icon: '⚠️', color: C.orange, bgGlow: 'rgba(249,115,22,0.12)'   },
        ].map(s => (
          <div key={s.label} style={{
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            padding: '0.55rem 0.9rem',
            background: s.bgGlow,
            textAlign: 'center',
            minWidth: '90px',
            flex: '1 0 auto',
            maxWidth: '130px',
          }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, marginBottom: '0.15rem', letterSpacing: '0.06em' }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Barra de filtros ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
        marginBottom: '0.8rem', alignItems: 'center',
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: '10px',
        padding: '0.6rem 0.75rem',
      }}>
        <input
          className="ct-filter-input"
          placeholder="🔍 Buscar..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          style={{ ...inputFilterStyle, minWidth: '160px' }}
        />
        <select className="ct-filter-select" value={filterColor} onChange={e => setFilterColor(e.target.value as any)} style={selectStyle}>
          <option value="all">🎨 Todos</option>
          <option value="red">🔴 Rojos</option>
          <option value="yellow">🟡 Amarillos</option>
          <option value="none">⚪ Sin color</option>
        </select>
        {COL_ESTADO && (
          <select className="ct-filter-select" value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={selectStyle}>
            <option value="all">📋 Estado</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}
        {COL_REF && refValues.length > 0 && (
          <select className="ct-filter-select" value={filterRef} onChange={e => setFilterRef(e.target.value)} style={selectStyle}>
            <option value="all">👤 Referente</option>
            <option value="__empty__">⬜ Sin asignar</option>
            {refValues.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {COL_SUCCOBRO && sucCobroValues.length > 0 && (
          <select className="ct-filter-select" value={filterSucCobro} onChange={e => setFilterSucCobro(e.target.value)} style={selectStyle}>
            <option value="all">🏦 Suc. cobro</option>
            {sucCobroValues.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {COL_SUCDEST && sucDestValues.length > 0 && (
          <select className="ct-filter-select" value={filterSucDest} onChange={e => setFilterSucDest(e.target.value)} style={selectStyle}>
            <option value="all">🏢 Suc. dest.</option>
            {sucDestValues.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {COL_SUCORI && sucOriValues.length > 0 && (
          <select className="ct-filter-select" value={filterSucOri} onChange={e => setFilterSucOri(e.target.value)} style={selectStyle}>
            <option value="all">📍 Suc. origen</option>
            {sucOriValues.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {COL_CLASE && claseValues.length > 0 && (
          <select className="ct-filter-select" value={filterClase} onChange={e => setFilterClase(e.target.value)} style={selectStyle}>
            <option value="all">📦 Clase</option>
            {claseValues.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {COL_JUSTIF && (
          <select className="ct-filter-select" value={filterJustif} onChange={e => setFilterJustif(e.target.value)} style={{ ...selectStyle, maxWidth: '160px' }}>
            <option value="all">📝 Justificación</option>
            <option value="__empty__">⬜ Sin justif.</option>
            {justifValues.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        )}
        {COL_OBSERV && (
          <select className="ct-filter-select" value={filterObserv} onChange={e => setFilterObserv(e.target.value)} style={{ ...selectStyle, maxWidth: '160px' }}>
            <option value="all">💬 Observación</option>
            <option value="__empty__">⬜ Sin observ.</option>
            {observValues.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {COL_DIAS && (
          <input
            className="ct-filter-input"
            type="number"
            placeholder="Días mín."
            value={filterDiasMin}
            onChange={e => setFilterDiasMin(e.target.value)}
            style={{ ...inputFilterStyle, width: '100px' }}
          />
        )}
        {COL_REF && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.75rem', cursor: 'pointer', color: C.muted,
            padding: '0.25rem 0.5rem',
            background: filterSinAsignar ? 'rgba(249,115,22,0.15)' : 'transparent',
            border: `1px solid ${filterSinAsignar ? C.orange : C.border}`,
            borderRadius: '6px',
          }}>
            <input
              type="checkbox"
              checked={filterSinAsignar}
              onChange={e => setFilterSinAsignar(e.target.checked)}
              style={{ accentColor: C.orange }}
            />
            Sin asignar
          </label>
        )}
        <button
          onClick={resetFilters}
          style={{
            padding: '0.3rem 0.65rem',
            borderRadius: '6px',
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.muted,
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          ✕ Limpiar
        </button>
      </div>

      {/* ── Tabla ── */}
      <div style={{
        overflowX: 'auto', overflowY: 'auto', maxHeight: '62vh',
        border: `1px solid ${C.border}`, borderRadius: '10px',
        background: C.bg,
      }}>
        <table style={{
          borderCollapse: 'collapse',
          fontSize: '0.72rem',
          minWidth: `${columns.length * 120}px`,
          width: '100%',
        }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr>
              <th style={{
                background: C.panel,
                color: C.muted,
                padding: '0.45rem 0.5rem',
                border: `1px solid ${C.border}`,
                whiteSpace: 'nowrap',
                minWidth: '40px',
                fontWeight: 600,
                fontSize: '0.65rem',
                letterSpacing: '0.05em',
                textAlign: 'center',
              }}>#</th>
              {columns.filter(col => !HIDDEN_COLS.has(col)).map(col => (
                <th key={col} style={{
                  background: C.panel,
                  color: C.muted,
                  padding: '0.45rem 0.55rem',
                  border: `1px solid ${C.border}`,
                  whiteSpace: 'nowrap',
                  minWidth: '100px',
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  letterSpacing: '0.05em',
                  textAlign: 'left',
                  textTransform: 'uppercase',
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} style={{
                  textAlign: 'center', padding: '3rem',
                  color: C.muted, background: C.bg,
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                  Sin resultados con los filtros actuales.
                </td>
              </tr>
            )}
            {filtered.map((row, visIdx) => {
              const nro    = String(row[COL_NRO] ?? '')
              const origen = COL_ORIGEN ? String(row[COL_ORIGEN] ?? '') : ''
              const rowBg  = visIdx % 2 === 0 ? C.bg : C.panel
              return (
                <tr key={row._row_idx} className="ct-table-row">
                  <td style={{
                    padding: '0.25rem 0.4rem',
                    border: `1px solid ${C.border}`,
                    color: C.muted, fontSize: '0.65rem',
                    textAlign: 'center',
                    background: rowBg,
                    userSelect: 'none',
                  }}>
                    {visIdx + 1}
                  </td>
                  {columns.filter(col => !HIDDEN_COLS.has(col)).map(col => {
                    const lockKey  = `${nro}::${col}`
                    const lock     = getCellLocks().get(lockKey)
                    const lockedByOther = !!lock && lock.user !== resolvedUser
                    const isNroCol = col === COL_NRO
                    const cs = cellStyle(row, col)
                    // Para filas sin color de celda especial, usar el rowBg alternado
                    const finalBg = cs.background ? cs.background : rowBg

                    const isEstado = col === COL_ESTADO
                    const isRef    = col === COL_REF

                    return (
                      <td
                        key={col}
                        style={{ ...cs, background: finalBg, position: 'relative' }}
                        title={lockedByOther ? `✏️ ${lock!.user} está editando` : undefined}
                      >
                        {lockedByOther && (
                          <div style={{
                            position: 'absolute', top: 0, right: 0,
                            background: lock!.color, color: '#fff',
                            fontSize: '0.5rem', padding: '1px 4px',
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
                            background: C.yellow, color: '#000',
                            fontSize: '0.55rem', fontWeight: 800,
                            padding: '1px 5px', borderRadius: '4px',
                            verticalAlign: 'middle', letterSpacing: '0.04em',
                          }}>NUEVO</span>
                        )}
                        {isNroCol && origen === 'EXISTENTE_CAMBIO' && (
                          <span style={{
                            display: 'inline-block', marginRight: '4px',
                            background: C.red, color: '#fff',
                            fontSize: '0.55rem', fontWeight: 800,
                            padding: '1px 5px', borderRadius: '4px',
                            verticalAlign: 'middle', letterSpacing: '0.04em',
                          }}>CAMBIO</span>
                        )}

                        {isEstado ? (
                          <select
                            defaultValue={String(row[col] ?? '')}
                            onFocus={() => handleCellFocus(row, col, lockedByOther)}
                            onBlur={e => handleCellBlur(row, col, e.target.value)}
                            disabled={lockedByOther}
                            style={{
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              fontSize: '0.72rem',
                              outline: 'none',
                              cursor: lockedByOther ? 'default' : 'pointer',
                              color: cs.color ?? C.text,
                              fontFamily: 'inherit',
                            }}
                          >
                            <option value="">--</option>
                            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        ) : isRef ? (
                          <select
                            defaultValue={String(row[col] ?? '')}
                            onFocus={() => handleCellFocus(row, col, lockedByOther)}
                            onBlur={e => handleCellBlur(row, col, e.target.value)}
                            disabled={lockedByOther}
                            style={{
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              fontSize: '0.72rem',
                              outline: 'none',
                              cursor: lockedByOther ? 'default' : 'pointer',
                              color: cs.color ?? C.text,
                              fontFamily: 'inherit',
                            }}
                          >
                            <option value="">--</option>
                            {REFERENTES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <input
                            className="ct-cell-input"
                            key={`${row._row_idx}-${col}`}
                            defaultValue={String(row[col] ?? '')}
                            onFocus={() => handleCellFocus(row, col, lockedByOther || col === COL_DIAS)}
                            onBlur={e => handleCellBlur(row, col, e.target.value)}
                            readOnly={lockedByOther || col === COL_DIAS}
                            style={{
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              fontSize: '0.72rem',
                              outline: 'none',
                              cursor: (lockedByOther || col === COL_DIAS) ? 'default' : 'text',
                              color: cs.color ?? (lockedByOther ? C.muted : C.text),
                              fontFamily: 'inherit',
                            }}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Barra inferior sticky ── */}
      <div style={{
        position: 'sticky', bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '0.75rem',
        marginTop: '0',
        padding: '0.6rem 0.9rem',
        background: C.panel,
        borderTop: `1px solid ${C.border}`,
        borderBottomLeftRadius: '10px',
        borderBottomRightRadius: '10px',
        zIndex: 10,
      }}>
        <span style={{ fontSize: '0.72rem', color: C.muted }}>
          Mostrando <strong style={{ color: C.text }}>{counts.visible}</strong> de <strong style={{ color: C.text }}>{counts.total}</strong> registros
          {pendingChanges > 0 && (
            <span style={{
              marginLeft: '0.6rem',
              background: 'rgba(249,115,22,0.15)',
              color: C.orange,
              border: `1px solid ${C.orange}`,
              borderRadius: '12px',
              padding: '0.1rem 0.55rem',
              fontSize: '0.68rem',
              fontWeight: 700,
            }}>
              {pendingChanges} cambio{pendingChanges !== 1 ? 's' : ''} pendiente{pendingChanges !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <button
          onClick={() => { onSave(data); setPendingChanges(0) }}
          disabled={saveLoading}
          style={{
            padding: '0.45rem 1.2rem',
            borderRadius: '8px',
            background: saveLoading ? C.card : C.orange,
            color: '#fff',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: saveLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: saveLoading ? 'none' : `0 0 12px rgba(249,115,22,0.4)`,
            transition: 'all 0.2s',
          }}
        >
          {saveLoading ? <><Spinner /> Guardando...</> : '💾 Guardar y descargar FINAL'}
        </button>
      </div>
    </div>
  )
}
