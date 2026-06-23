#!/usr/bin/env python3
"""Minimal static file server for local preview / GitHub Pages parity.

Avoids the stdlib `python -m http.server` CLI, which evaluates os.getcwd() at
import time (blocked under the preview sandbox). Serves this file's directory.
"""
import functools
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "4321"))

Handler = functools.partial(SimpleHTTPRequestHandler, directory=ROOT)
httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
print(f"Serving {ROOT} at http://127.0.0.1:{PORT}")
httpd.serve_forever()
