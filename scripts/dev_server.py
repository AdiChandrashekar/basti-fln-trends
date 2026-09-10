"""
Local preview server for docs/.

    python scripts/dev_server.py [port]

Identical to `python -m http.server --directory docs` except that it sends
`Cache-Control: no-store`. Without that, the browser holds on to ES modules and
CSVs between edits and you end up debugging a stale copy of the site. Only the
local preview behaves this way; GitHub Pages serves its own headers, and the
dashboard already versions its data URLs with the manifest build timestamp.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DOCS = Path(__file__).resolve().parents[1] / "docs"


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console readable: only surface failures.
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    handler = partial(NoCacheHandler, directory=str(DOCS))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Serving {DOCS} at http://localhost:{port}  (no-store)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
