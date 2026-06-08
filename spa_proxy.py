"""
Mini-proxy para Expreso Bisonte.
Sirve el frontend dist (SPA) + proxyea /api/* al backend en :9000.
Un solo puerto (9090) → un solo tunnel.
"""
import http.server
import socketserver
import urllib.request
import urllib.parse
import os
import sys

FRONTEND_DIST = "/home/server/proyectos/excel-merger-poc/frontend/dist"
BACKEND_URL = "http://localhost:9000"
PORT = 9090

INDEX_HTML = os.path.join(FRONTEND_DIST, "index.html")


class SPAProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIST, **kwargs)

    def do_GET(self):
        # Proxy al backend para /api/*
        if self.path.startswith("/api/"):
            self._proxy_request("GET")
            return
        # Para el SPA: servir index.html en cualquier ruta que no sea archivo estático
        # (vite genera /assets/* con hash, esos sí existen en dist)
        rel = self.path.lstrip("/").split("?")[0]
        if rel and not os.path.exists(os.path.join(FRONTEND_DIST, rel)):
            # SPA fallback
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy_request("POST")
            return
        self.send_error(404)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._proxy_request("PUT")
            return
        self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._proxy_request("DELETE")
            return
        self.send_error(404)

    def do_PATCH(self):
        if self.path.startswith("/api/"):
            self._proxy_request("PATCH")
            return
        self.send_error(404)

    def do_OPTIONS(self):
        # CORS preflight
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def _proxy_request(self, method):
        # Leer body si existe
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        # Construir URL upstream
        target = BACKEND_URL + self.path
        req = urllib.request.Request(target, data=body, method=method)
        # Reenviar headers (excluir Host que urllib reescribe)
        for header, value in self.headers.items():
            if header.lower() not in ("host", "content-length"):
                req.add_header(header, value)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = resp.read()
                self.send_response(resp.status)
                # Reenviar headers del backend
                for header, value in resp.headers.items():
                    if header.lower() not in ("transfer-encoding", "content-encoding", "connection"):
                        self.send_header(header, value)
                # CORS
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as e:
            payload = e.read() if e.fp else b""
            self.send_response(e.code)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            err = f'{{"detail":"proxy error: {e}"}}'.encode()
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)

    def log_message(self, format, *args):
        # Log más legible
        sys.stderr.write(f"[expreso-proxy] {self.address_string()} {format % args}\n")


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), SPAProxyHandler) as httpd:
        print(f"Expreso Bisonte proxy listening on 0.0.0.0:{PORT}")
        print(f"  Frontend: {FRONTEND_DIST}")
        print(f"  Backend:  {BACKEND_URL}")
        print(f"  Tunnels:  /api/* -> backend, /* -> SPA fallback to index.html")
        httpd.serve_forever()
