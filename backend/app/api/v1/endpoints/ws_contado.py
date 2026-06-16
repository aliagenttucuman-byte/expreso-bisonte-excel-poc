"""
WebSocket: /api/v1/ws/contado
Colaboración en tiempo real para la tabla de Cobranzas Contado.

Eventos cliente → server:
  { type: "join",    user: "edith",  color: "#e53e3e" }
  { type: "editing", user: "edith",  nro: "A.0053.00111316", col: "REFERENTE" }
  { type: "update",  user: "edith",  nro: "A.0053.00111316", col: "REFERENTE", value: "CC" }
  { type: "leave",   user: "edith" }
  { type: "ping" }

Eventos server → cliente(s):
  { type: "presence",  users: [{ user, color, editing_nro, editing_col }] }
  { type: "cell_lock", user: "edith",  color: "#e53e3e", nro: "...", col: "..." }
  { type: "cell_update", user: "edith", nro: "...", col: "...", value: "..." }
  { type: "cell_unlock", user: "edith", nro: "...", col: "..." }
"""

import json
import asyncio
from typing import Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# ── Colores por usuario (cycling) ─────────────────────────────────────────────
_COLORS = [
    "#e53e3e",  # rojo
    "#3182ce",  # azul
    "#38a169",  # verde
    "#d69e2e",  # amarillo
    "#805ad5",  # violeta
    "#dd6b20",  # naranja
]

# ── Estado compartido del room ─────────────────────────────────────────────────
class ContadoRoom:
    def __init__(self):
        # ws_id → WebSocket
        self.connections: Dict[str, WebSocket] = {}
        # ws_id → { user, color, editing_nro, editing_col }
        self.users: Dict[str, dict] = {}
        # (nro, col) → ws_id — quién tiene el lock en este momento
        self.locks: Dict[tuple, str] = {}
        self._color_idx = 0

    def _next_color(self) -> str:
        color = _COLORS[self._color_idx % len(_COLORS)]
        self._color_idx += 1
        return color

    async def connect(self, ws_id: str, ws: WebSocket, user: str):
        await ws.accept()
        self.connections[ws_id] = ws
        self.users[ws_id] = {
            "user":         user,
            "color":        self._next_color(),
            "editing_nro":  None,
            "editing_col":  None,
        }
        # Notificar a todos la presencia actualizada
        await self.broadcast_presence()

    async def disconnect(self, ws_id: str):
        if ws_id not in self.connections:
            return
        # Liberar locks de este usuario
        to_remove = [k for k, v in self.locks.items() if v == ws_id]
        for key in to_remove:
            del self.locks[key]
            nro, col = key
            await self.broadcast({
                "type": "cell_unlock",
                "user": self.users[ws_id]["user"],
                "nro":  nro,
                "col":  col,
            }, exclude=ws_id)
        del self.connections[ws_id]
        del self.users[ws_id]
        await self.broadcast_presence()

    async def handle_editing(self, ws_id: str, nro: str, col: str):
        """Alguien empieza a editar una celda — bloquearla."""
        key = (nro, col)
        # Si otro ya la tiene, rechazar
        if key in self.locks and self.locks[key] != ws_id:
            owner_id = self.locks[key]
            owner = self.users.get(owner_id, {})
            await self.send_to(ws_id, {
                "type":    "cell_locked_by_other",
                "nro":     nro,
                "col":     col,
                "user":    owner.get("user", "?"),
                "color":   owner.get("color", "#999"),
            })
            return
        # Adquirir lock
        # Liberar lock anterior de este usuario si tenía otro
        old_key = (self.users[ws_id]["editing_nro"], self.users[ws_id]["editing_col"])
        if old_key in self.locks and self.locks[old_key] == ws_id:
            del self.locks[old_key]
            await self.broadcast({
                "type": "cell_unlock",
                "user": self.users[ws_id]["user"],
                "nro":  old_key[0],
                "col":  old_key[1],
            }, exclude=ws_id)

        self.locks[key] = ws_id
        self.users[ws_id]["editing_nro"] = nro
        self.users[ws_id]["editing_col"] = col

        print(f"[WS] LOCK: ws_id={ws_id[:8]} user={self.users[ws_id]['user']} nro={nro} col={col} → broadcast a {[v['user'] for k,v in self.users.items() if k != ws_id]}", flush=True)

        await self.broadcast({
            "type":  "cell_lock",
            "user":  self.users[ws_id]["user"],
            "color": self.users[ws_id]["color"],
            "nro":   nro,
            "col":   col,
        }, exclude=ws_id)

    async def handle_update(self, ws_id: str, nro: str, col: str, value: str):
        """Alguien confirmó un cambio (onBlur) — broadcastear el valor nuevo."""
        key = (nro, col)
        # Liberar lock
        if key in self.locks and self.locks[key] == ws_id:
            del self.locks[key]
        self.users[ws_id]["editing_nro"] = None
        self.users[ws_id]["editing_col"] = None

        await self.broadcast({
            "type":  "cell_update",
            "user":  self.users[ws_id]["user"],
            "color": self.users[ws_id]["color"],
            "nro":   nro,
            "col":   col,
            "value": value,
        }, exclude=ws_id)

    async def handle_leave(self, ws_id: str):
        """El usuario soltó la celda sin confirmar."""
        user_info = self.users.get(ws_id, {})
        nro = user_info.get("editing_nro")
        col = user_info.get("editing_col")
        if nro and col:
            key = (nro, col)
            if key in self.locks and self.locks[key] == ws_id:
                del self.locks[key]
            self.users[ws_id]["editing_nro"] = None
            self.users[ws_id]["editing_col"] = None
            await self.broadcast({
                "type": "cell_unlock",
                "user": user_info.get("user", "?"),
                "nro":  nro,
                "col":  col,
            }, exclude=ws_id)

    async def broadcast_presence(self):
        presence = [
            {
                "user":        u["user"],
                "color":       u["color"],
                "editing_nro": u["editing_nro"],
                "editing_col": u["editing_col"],
            }
            for u in self.users.values()
        ]
        await self.broadcast({"type": "presence", "users": presence})

    async def broadcast(self, msg: dict, exclude: Optional[str] = None):
        dead = []
        for ws_id, ws in self.connections.items():
            if ws_id == exclude:
                continue
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                dead.append(ws_id)
        for ws_id in dead:
            await self.disconnect(ws_id)

    async def send_to(self, ws_id: str, msg: dict):
        ws = self.connections.get(ws_id)
        if ws:
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                pass


# Room singleton — un solo room para Cobranzas Contado
_room = ContadoRoom()


@router.websocket("/ws/contado")
async def ws_contado(websocket: WebSocket):
    import uuid
    ws_id = str(uuid.uuid4())
    user  = "anon"

    try:
        # Esperar mensaje join antes de aceptar formalmente
        await websocket.accept()
        # Primer mensaje debe ser join
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        msg = json.loads(raw)
        if msg.get("type") == "join":
            user = msg.get("user", "anon")

        # Registrar en room
        _room.connections[ws_id] = websocket
        _room.users[ws_id] = {
            "user":         user,
            "color":        _room._next_color(),
            "editing_nro":  None,
            "editing_col":  None,
        }
        print(f"[WS] JOIN: ws_id={ws_id[:8]} user={user} — total conexiones={len(_room.connections)}", flush=True)
        await _room.broadcast_presence()

        # Loop principal
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                # Enviar ping para mantener conexión viva
                await websocket.send_text(json.dumps({"type": "ping"}))
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            t = msg.get("type")

            if t == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            elif t == "editing":
                nro = msg.get("nro", "")
                col = msg.get("col", "")
                if nro and col:
                    await _room.handle_editing(ws_id, nro, col)

            elif t == "update":
                nro   = msg.get("nro", "")
                col   = msg.get("col", "")
                value = msg.get("value", "")
                if nro and col:
                    await _room.handle_update(ws_id, nro, col, value)

            elif t == "leave":
                await _room.handle_leave(ws_id)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await _room.disconnect(ws_id)
