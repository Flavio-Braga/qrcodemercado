/* Leitor de NFC-e: cupons e itens ficam somente neste navegador. */
const STORAGE_KEY = "nfce-item-history-v2";
const $ = (selector) => document.querySelector(selector);
const elements = {
  result: $("#result-card"), key: $("#access-key"), url: $("#full-url"),
  items: $("#coupon-items"), copy: $("#copy-button"), newEntry: $("#new-entry-button"), manualUrl: $("#manual-url"),
  manual: $("#manual-button"), list: $("#history-list"), count: $("#history-count"),
  download: $("#download-button"), serverStatus: $("#server-status")
};

let lastResult = null;
let history = loadHistory();

function setServerStatus(available, message) {
  elements.manual.disabled = !available;
  elements.serverStatus.textContent = message;
  elements.serverStatus.classList.toggle("available", available);
  elements.serverStatus.classList.toggle("unavailable", !available);
}

async function checkServer() {
  if (location.protocol === "file:") {
    setServerStatus(false, "Abra este aplicativo em http://localhost:8000. O arquivo index.html não consulta cupons quando aberto diretamente.");
    return;
  }
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error();
    setServerStatus(true, "Servidor local conectado. Pronto para consultar o cupom.");
  } catch {
    setServerStatus(false, "Servidor local indisponível. Abra iniciar-servidor.bat e, depois, acesse http://localhost:8000.");
  }
}

/** Extrai a chave de 44 dígitos do parâmetro p da URL de uma NFC-e. */
function extractAccessKey(rawValue) {
  const rawUrl = rawValue.trim();
  // Aceita p=CHAVE|... e também parâmetros posteriores separados por &.
  const match = rawUrl.match(/[?&]p=(\d{44})(?=\||&|$)/);
  if (!match) throw new Error("Não encontrei uma chave de acesso de 44 dígitos no parâmetro p da URL.");
  return { rawUrl, accessKey: match[1] };
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveHistory() { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); renderHistory(); }
function currency(value) { return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function renderHistory() {
  elements.list.replaceChildren();
  const itemCount = history.reduce((total, coupon) => total + coupon.items.length, 0);
  elements.count.textContent = history.length ? `${history.length} cupom(ns) e ${itemCount} item(ns) salvos neste navegador.` : "Nenhum cupom salvo.";
  elements.download.disabled = itemCount === 0;
  [...history].reverse().forEach((entry) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="history-key">${entry.accessKey}</span><span class="history-date">${entry.items.length} item(ns) · ${new Date(entry.scannedAt).toLocaleString("pt-BR")}</span>`;
    elements.list.append(item);
  });
}

function renderItems(items) {
  elements.items.replaceChildren();
  items.forEach((item) => {
    const row = document.createElement("li");
    const description = document.createElement("span");
    const total = document.createElement("strong");
    description.textContent = item.description;
    total.textContent = currency(item.total);
    row.append(description, total);
    elements.items.append(row);
  });
}

function presentResult(result) {
  lastResult = result;
  elements.key.textContent = result.accessKey;
  elements.url.textContent = result.rawUrl;
  renderItems(result.items);
  elements.result.classList.remove("hidden");
  const previous = history.findIndex((entry) => entry.accessKey === result.accessKey);
  const entry = { ...result, scannedAt: new Date().toISOString() };
  if (previous >= 0) history[previous] = entry; else history.push(entry);
  saveHistory();
}

async function readManualUrl() {
  const originalText = elements.manual.textContent;
  try {
    const basic = extractAccessKey(elements.manualUrl.value);
    elements.manual.disabled = true;
    elements.manual.textContent = "Consultando cupom…";
    const response = await fetch(`/api/cupom?url=${encodeURIComponent(basic.rawUrl)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível consultar o cupom.");
    presentResult({ ...basic, items: data.items });
    elements.manualUrl.value = "";
  } catch (error) {
    checkServer();
    const message = error instanceof TypeError && error.message === "Failed to fetch"
      ? "A conexão com o servidor local foi interrompida. A página verificará o estado do servidor; se ele estiver indisponível, reabra iniciar-servidor.bat."
      : error.message;
    alert(message);
  }
  finally { elements.manual.disabled = false; elements.manual.textContent = originalText; }
}

function downloadCsv() {
  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = history.flatMap((coupon) => coupon.items.map((item) => [coupon.accessKey, coupon.rawUrl, coupon.scannedAt, item.description, item.quantity, item.unitPrice, item.total].map(escape).join(",")));
  const csv = ["chave_acesso,url_cupom,data_leitura,descricao_item,quantidade,valor_unitario,valor_total", ...rows].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "itens-cupons-nfce.csv" });
  link.click(); URL.revokeObjectURL(link.href);
}

elements.manual.addEventListener("click", readManualUrl);
elements.manualUrl.addEventListener("keydown", (event) => { if (event.ctrlKey && event.key === "Enter") readManualUrl(); });
elements.newEntry.addEventListener("click", () => { elements.result.classList.add("hidden"); elements.manualUrl.focus(); });
elements.copy.addEventListener("click", async () => {
  if (!lastResult) return;
  await navigator.clipboard.writeText(lastResult.accessKey);
  elements.copy.textContent = "Copiada!"; setTimeout(() => { elements.copy.textContent = "Copiar chave"; }, 1400);
});
elements.download.addEventListener("click", downloadCsv);
renderHistory();
checkServer();
