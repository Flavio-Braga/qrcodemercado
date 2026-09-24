// Servidor estático mínimo para testar o app localmente: node server.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, resolve, sep } from "node:path";

const port = Number(process.env.PORT || 8000);
const root = resolve(".");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const decodeHtml = (text) => text.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)));
const clean = (text) => decodeHtml(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const money = (text) => Number(text.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));

function extractItems(html) {
  const blocks = html.match(/<(?:tr|li|div)\b[^>]*(?:prod|item|produto)[^>]*>[\s\S]*?<\/(?:tr|li|div)>/gi) || [];
  const candidates = blocks.length ? blocks : html.split(/<\/tr>|<\/li>/i);
  const items = [];
  for (const block of candidates) {
    const text = clean(block);
    const totalMatch = text.match(/(?:valor\s*(?:total)?|total)\s*(?:r\$\s*)?([\d.]+,\d{2})/i) || text.match(/r\$\s*([\d.]+,\d{2})/i);
    if (!totalMatch) continue;
    const quantityMatch = text.match(/(?:qtd\.?|quantidade)\s*[:]?\s*([\d.,]+)/i);
    const unitMatch = text.match(/(?:vl\.?\s*unit\.?|valor\s*unit[áa]rio)\s*[:]?\s*(?:r\$\s*)?([\d.]+,\d{2})/i);
    const description = text.replace(/(?:qtd\.?|quantidade|vl\.?\s*unit\.?|valor\s*unit[áa]rio|valor\s*total|total)\s*[:]?\s*(?:r\$\s*)?[\d.,]+/gi, "").replace(/r\$\s*[\d.]+,\d{2}/gi, "").trim();
    if (description.length < 2) continue;
    items.push({ description, quantity: quantityMatch ? money(quantityMatch[1]) : 1, unitPrice: unitMatch ? money(unitMatch[1]) : money(totalMatch[1]), total: money(totalMatch[1]) });
  }
  return items;
}

function sendJson(response, status, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

async function coupon(requestUrl, response) {
  const source = requestUrl.searchParams.get("url");
  let address;
  try { address = new URL(source); } catch { sendJson(response, 400, { error: "URL do cupom inválida." }); return; }
  if (!/^https?:$/.test(address.protocol)) { sendJson(response, 400, { error: "A URL do cupom deve usar HTTP ou HTTPS." }); return; }
  try {
    const upstream = await fetch(address, { headers: { "User-Agent": "Mozilla/5.0 NFCe-item-reader" }, signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) throw new Error(`O portal retornou ${upstream.status}.`);
    const items = extractItems(await upstream.text());
    if (!items.length) throw new Error("Não consegui identificar os itens neste portal. O formato da página pode não ser compatível.");
    sendJson(response, 200, { items });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Erro desconhecido ao consultar o portal.";
    sendJson(response, 422, { error: `Não foi possível consultar o portal da NFC-e: ${detail}` });
  }
}

async function handleRequest(request, response) {
  try {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (requestUrl.pathname === "/api/cupom") {
    await coupon(requestUrl, response);
    return;
  }
  const pathname = decodeURIComponent(requestUrl.pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const file = resolve(root, normalize(requested));
  if (!file.startsWith(root + sep) && file !== root) { response.writeHead(403).end("Forbidden"); return; }
  try {
    // Leia o arquivo antes de enviar os cabeçalhos. Assim, uma requisição
    // automática do navegador (como /favicon.ico) não encerra o servidor.
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(content);
  } catch { response.writeHead(404).end("Not found"); }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error("Falha ao atender requisição:", detail);
    sendJson(response, 500, { error: "O servidor local encontrou um erro, mas continua em execução." });
  }
}

const server = createServer((request, response) => { void handleRequest(request, response); });
server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
server.listen(port, "0.0.0.0", () => console.log(`Leitor NFC-e disponível em http://localhost:${port}`));
