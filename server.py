import os
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, request, send_from_directory

from scraper import extract_items

PORT = int(os.environ.get("PORT", 8000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=None)


@app.after_request
def set_headers(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/cupom")
def coupon():
    source = request.args.get("url", "")
    parsed = urlparse(source)
    if not parsed.scheme or not parsed.netloc:
        return jsonify({"error": "URL do cupom inválida."}), 400
    if parsed.scheme not in ("http", "https"):
        return jsonify({"error": "A URL do cupom deve usar HTTP ou HTTPS."}), 400
    try:
        upstream = requests.get(
            source,
            headers={"User-Agent": "Mozilla/5.0 NFCe-item-reader"},
            timeout=15,
        )
        if not upstream.ok:
            raise RuntimeError(f"O portal retornou {upstream.status_code}.")
        items = extract_items(upstream.text)
        if not items:
            raise RuntimeError(
                "Não consegui identificar os itens neste portal. O formato da página pode não ser compatível."
            )
        return jsonify({"items": items})
    except Exception as error:
        detail = str(error) or "Erro desconhecido ao consultar o portal."
        return jsonify({"error": f"Não foi possível consultar o portal da NFC-e: {detail}"}), 422


if __name__ == "__main__":
    print(f"Leitor NFC-e disponível em http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT)
