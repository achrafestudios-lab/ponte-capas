// ============================================================
// HISTORIAL ROPA - Scriptable
// Abre una pantalla con las recomendaciones y valoraciones guardadas.
// ============================================================
const fm = FileManager.local();
const root = fm.documentsDirectory();
const historyPath = fm.joinPath(root, "ropa_diaria_history.json");
const profilePath = fm.joinPath(root, "ropa_diaria_profile.json");

function readJSON(path, fallback) {
  try { return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : fallback; }
  catch (_) { return fallback; }
}
function esc(value) {
  return String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
}
function labelFeedback(value) {
  const labels = { frio: "🥶 Pasé frío", calor: "🥵 Pasé calor", viento: "💨 Viento molesto", lluvia: "🌧️ Me mojé", perfecto: "✅ Perfecto" };
  return labels[value] || "Sin valorar";
}

try {
  const history = readJSON(historyPath, []).slice().reverse();
  const profile = readJSON(profilePath, { thermalBias: 0, windBias: 0, rainSensitivity: 0, ratingsCount: 0 });
  const cards = history.slice(0, 30).map(item => `
    <article class="card">
      <div class="head"><strong>${esc(item.date)}</strong><span>${esc(item.place || "Ubicación GPS")}</span></div>
      <div class="temps">${item.minTemp == null ? "—" : Math.round(item.minTemp)}° <small>mín.</small> / ${item.maxTemp == null ? "—" : Math.round(item.maxTemp)}° <small>máx.</small></div>
      <div class="stats">${esc(item.transport === "autobús" ? "🚌 Autobús" : "🚗 Coche")} · Sensación ${item.feelsMin == null ? "—" : Math.round(item.feelsMin)}–${item.feelsMax == null ? "—" : Math.round(item.feelsMax)}° · Rachas ${item.gusts == null ? "—" : Math.round(item.gusts)} km/h</div>
      <div class="outfit">👕 ${esc(item.outfit?.base || "")}<br>🧶 ${esc(item.outfit?.mid || "")}<br>🧥 ${esc(item.outfit?.outer || "")}<br>👖 ${esc(item.outfit?.lower || "")}<br>👟 ${esc(item.outfit?.shoes || "")}</div>
      <div class="feedback">${labelFeedback(item.feedback)}</div>
    </article>`).join("");

  const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:22px 16px;background:#101318;color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif}.wrap{max-width:560px;margin:auto}h1{font-size:28px;margin:6px 0}.sub{color:#9da7b4;font-size:13px}.profile{background:#243447;border-radius:17px;padding:15px;margin:20px 0;font-size:13px;line-height:1.7}.card{background:#1b2028;border:1px solid #303741;border-radius:17px;padding:15px;margin:12px 0}.head{display:flex;justify-content:space-between;gap:10px;color:#aab2bf;font-size:12px}.head strong{color:#f4f5f7;font-size:14px}.temps{font-size:25px;font-weight:750;margin:13px 0 5px}.temps small{font-size:11px;color:#9da7b4;font-weight:400}.stats{color:#aab2bf;font-size:12px}.outfit{border-top:1px solid #303741;margin-top:12px;padding-top:12px;font-size:13px;line-height:1.8}.feedback{display:inline-block;margin-top:12px;padding:7px 10px;background:#29323d;border-radius:50px;font-size:12px;color:#dce6ef}.empty{padding:20px;background:#1b2028;border-radius:14px;color:#aab2bf}.foot{font-size:11px;color:#7e8997;text-align:center;margin-top:22px}</style></head><body><main class="wrap"><h1>Historial de outfits</h1><div class="sub">Últimas 30 recomendaciones guardadas en este iPhone</div><div class="profile"><strong>Tu perfil aprendido</strong><br>Necesidad extra de abrigo: ${Number(profile.thermalBias || 0).toFixed(1)}°C<br>Sensibilidad al viento: nivel ${profile.windBias || 0}/3<br>Precaución por lluvia: nivel ${profile.rainSensitivity || 0}/3<br>Valoraciones registradas: ${profile.ratingsCount || 0}</div>${cards || '<div class="empty">Todavía no hay recomendaciones guardadas. Ejecuta primero “Ropa diaria”.</div>'}<div class="foot">Los datos se guardan localmente en Scriptable.</div></main></body></html>`;
  const web = new WebView();
  await web.loadHTML(html);
  await web.present(true);
} catch (error) {
  const alert = new Alert();
  alert.title = "No se pudo abrir el historial";
  alert.message = error && error.message ? error.message : String(error);
  alert.addAction("Aceptar");
  await alert.presentAlert();
}
Script.complete();
