/**
 * Hook: useContadoWS
 * Colaboración en tiempo real para Cobranzas Contado.
 *
 * DISEÑO ANTI-BLUR:
 * - cellLocksRef: Map en un ref (NO estado) → cambios remotos NO causan re-render
 * - cellLocksVer: contador de versión → sube solo cuando cambia el Map, triggerea re-render MÍNIMO
 * - myLockRef: qué celda tiene bloqueada esta pestaña → el onBlur puede verificar antes de soltar
 */

import { useEffect, useRef, useState, useCallback } from 'react'

export interface PresenceUser {
  user:         string
  color:        string
  editing_nro:  string | null
  editing_col:  string | null
}

export interface CellLock {
  user:  string
  color: string
}

const WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host  = window.location.host  // hostname + puerto del browser (ej: screens-cafe.trycloudflare.com)
  return `${proto}://${host}/api/v1/ws/contado`
})()

function getTabId(): string {
  const key = '__bisonte_tab_id__'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = 'tab_' + Math.random().toString(36).slice(2, 7).toUpperCase()
    sessionStorage.setItem(key, id)
  }
  return id
}

export { getTabId }

export function useContadoWS(user: string) {
  const wsRef           = useRef<WebSocket | null>(null)
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lock map en ref — NO causa re-render al cambiar
  const cellLocksRef    = useRef<Map<string, CellLock>>(new Map())
  // Versión — sube cuando el map cambia, triggerea re-render mínimo
  const [cellLocksVer, setCellLocksVer] = useState(0)
  // Qué celda tiene bloqueada ESTA pestaña ahora mismo
  const myLockRef       = useRef<{ nro: string; col: string } | null>(null)

  const [connected, setConnected] = useState(false)
  const [presence,  setPresence]  = useState<PresenceUser[]>([])

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'join', user }))
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        switch (msg.type) {
          case 'presence':
            setPresence(msg.users ?? [])
            break

          case 'cell_lock':
            // Solo guardar si es de OTRO — mi propio lock no me bloquea
            if (msg.user !== user) {
              cellLocksRef.current.set(`${msg.nro}::${msg.col}`, { user: msg.user, color: msg.color })
              setCellLocksVer(v => v + 1)
            }
            break

          case 'cell_unlock':
            if (cellLocksRef.current.has(`${msg.nro}::${msg.col}`)) {
              cellLocksRef.current.delete(`${msg.nro}::${msg.col}`)
              setCellLocksVer(v => v + 1)
            }
            break

          case 'cell_update':
            ws.dispatchEvent(new CustomEvent('remote_update', { detail: msg }))
            break

          case 'cell_locked_by_other':
            ws.dispatchEvent(new CustomEvent('cell_conflict', { detail: msg }))
            break
        }
      } catch (_) {}
    }

    ws.onclose = () => {
      setConnected(false)
      setPresence([])
      cellLocksRef.current.clear()
      setCellLocksVer(v => v + 1)
      myLockRef.current = null
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => { ws.close() }
  }, [user])

  useEffect(() => {
    connect()
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Tomar lock de una celda
  const sendEditing = useCallback((nro: string, col: string) => {
    if (wsRef.current?.readyState !== 1) return
    myLockRef.current = { nro, col }
    wsRef.current.send(JSON.stringify({ type: 'editing', user, nro, col }))
  }, [user])

  // Confirmar valor y soltar lock — SOLO si sigo siendo el dueño
  const sendUpdate = useCallback((nro: string, col: string, value: string) => {
    if (wsRef.current?.readyState !== 1) return
    const mine = myLockRef.current
    if (!mine || mine.nro !== nro || mine.col !== col) return  // ya no es mi celda
    myLockRef.current = null
    wsRef.current.send(JSON.stringify({ type: 'update', user, nro, col, value }))
  }, [user])

  // Soltar sin confirmar — SOLO si sigo siendo el dueño
  const sendLeave = useCallback((nro: string, col: string) => {
    if (wsRef.current?.readyState !== 1) return
    const mine = myLockRef.current
    if (!mine || mine.nro !== nro || mine.col !== col) return
    myLockRef.current = null
    wsRef.current.send(JSON.stringify({ type: 'leave', user, nro, col }))
  }, [user])

  // Snapshot actual del Map (el componente lo usa directo — no es estado)
  const getCellLocks = useCallback(() => cellLocksRef.current, [])

  return { connected, presence, cellLocksVer, getCellLocks, sendEditing, sendUpdate, sendLeave, wsRef }
}
