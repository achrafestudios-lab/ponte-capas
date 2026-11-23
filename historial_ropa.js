// HISTORIAL ROPA - Scriptable V4
// Permite consultar 7, 30 o 90 dias y ver estadisticas de las valoraciones.

const fm = FileManager.local();
const root = fm.documentsDirectory();
const historyPath = fm.joinPath(root, "ropa_diaria_history.json");
const profilePath = fm.joinPath(root, "ropa_diaria_profile.json");
const configPath = fm.joinPath(root, "ropa_diaria_config.json");

function readJSON(path, fallback) {
  try { return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : fallback; }
  catch (error) { console.warn(`No se pudo leer ${path}: ${error}`); return fallback; }
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function dateFromKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
function dateText(value) {
  const date = dateFromKey(value);
  return date ? date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : esc(value);
}
function labelFeedback(value) {
  const labels = { frio: "🥶 Pasé frío", calor: "🥵 Pasé calor", viento: "💨 Viento molesto", lluvia: "🌧️ Me mojé", perfecto: "✅ Todo perfecto" };
  return labels[value] || "Pendiente de valorar";
}
function feedbackLabel(value) {
  const labels = { frio: "Frio", calor: "Calor", viento: "Viento", lluvia: "Lluvia", perfecto: "Perfecto" };
  return labels[value] || value;
}

const periodAlert = new Alert();
periodAlert.title = "Periodo del historial";
periodAlert.message = "¿Que periodo quieres consultar?";
periodAlert.addAction("Ultimos 7 dias");
periodAlert.addAction("Ultimos 30 dias");
periodAlert.addAction("Ultimos 90 dias");
periodAlert.addCancelAction("Cancelar");
const periodChoice = await periodAlert.presentAlert();
if (periodChoice < 0) {
  Script.complete();
} else {
  const days = [7, 30, 90][periodChoice];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  const allHistory = readJSON(historyPath, []);
  const history = (Array.isArray(allHistory) ? allHistory : [])
    .filter(item => {
      const date = dateFromKey(item.date);
      return date && date >= cutoff && date <= new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const profile = readJSON(profilePath, { thermalBias: 0, windBias: 0, rainSensitivity: 0, ratingsCount: 0 }) || {};
  const config = readJSON(configPath, { transport: "coche", thermalPreference: "normal" }) || {};
  const rated = history.filter(item => !!item.feedback);
  const counts = { frio: 0, calor: 0, viento: 0, lluvia: 0, perfecto: 0 };
  rated.forEach(item => { if (Object.prototype.hasOwnProperty.call(counts, item.feedback)) counts[item.feedback] += 1; });
  const comfortRate = rated.length ? Math.round((counts.perfecto / rated.length) * 100) : null;
  const mostCommon = Object.entries(counts).filter(([key, value]) => key !== "perfecto" && value > 0).sort((a, b) => b[1] - a[1])[0];
  const preferenceLabels = { friolero: "Friolero", normal: "Normal", caluroso: "Caluroso" };

  const stat = (label, value, hint) => `<div class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(hint || "")}</small></div>`;
  const cards = history.map(item => {
    const outfit = item.outfit || {};
    const temperature = `${item.minTemp == null ? "—" : Math.round(item.minTemp)}° / ${item.maxTemp == null ? "—" : Math.round(item.maxTemp)}°`;
    return `<article class="card">
      <div class="head"><strong>${esc(dateText(item.date))}</strong><span>${esc(item.transport === "autobus" ? "🚌 Autobus" : "🚗 Coche")}</span></div>
      <div class="temps">${esc(temperature)} <small>mín. / máx.</small></div>
      <div class="stats">Sensacion ${item.feelsMin == null ? "—" : Math.round(item.feelsMin)}–${item.feelsMax == null ? "—" : Math.round(item.feelsMax)}° · Rachas ${item.gusts == null ? "—" : Math.round(item.gusts)} km/h${item.rainExpected ? " · Lluvia prevista" : ""}</div>
      <div class="outfit">👕 ${esc(outfit.base || "—")}<br>🧶 ${esc(outfit.mid || "—")}<br>🧥 ${esc(outfit.outer || "—")}<br>👖 ${esc(outfit.lower || "—")}<br>👟 ${esc(outfit.shoes || "—")}</div>
      <div class="feedback">${esc(labelFeedback(item.feedback))}</div>
    </article>`;
  }).join("");

  const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:22px 16px 36px;background:#101318;color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif}.wrap{max-width:600px;margin:auto}h1{font-size:28px;margin:6px 0}.sub{color:#9da7b4;font-size:13px}.statsGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:18px 0}.stat{background:#202b38;border:1px solid #303d4b;border-radius:15px;padding:13px}.stat strong{display:block;font-size:25px}.stat span{display:block;color:#e2e8ef;font-size:12px;margin-top:4px}.stat small{display:block;color:#91a0b0;font-size:10px;margin-top:3px}.profile{background:#243447;border-radius:17px;padding:15px;margin:14px 0 20px;font-size:13px;line-height:1.8}.section{font-size:17px;margin:24px 0 10px}.card{background:#1b2028;border:1px solid #303741;border-radius:17px;padding:15px;margin:12px 0}.head{display:flex;justify-content:space-between;gap:10px;color:#aab2bf;font-size:12px}.head strong{color:#f4f5f7;font-size:13px;text-transform:capitalize}.temps{font-size:24px;font-weight:750;margin:13px 0 5px}.temps small{font-size:11px;color:#9da7b4;font-weight:400}.stats{color:#aab2bf;font-size:12px}.outfit{border-top:1px solid #303741;margin-top:12px;padding-top:12px;font-size:13px;line-height:1.8}.feedback{display:inline-block;margin-top:12px;padding:7px 10px;background:#29323d;border-radius:50px;font-size:12px;color:#dce6ef}.empty{padding:20px;background:#1b2028;border-radius:14px;color:#aab2bf;line-height:1.6}.foot{font-size:11px;color:#7e8997;text-align:center;margin-top:22px}</style></head><body><main class="wrap">
  <h1>Historial de outfits</h1><div class="sub">Ultimos ${days} dias · ${history.length} recomendaciones</div>
  <section class="statsGrid">${stat("Outfits guardados", history.length, `Periodo de ${days} dias`)}${stat("Valoraciones", rated.length, "Respuestas registradas")}${stat("Dias comodos", comfortRate === null ? "—" : `${comfortRate}%`, rated.length ? `${counts.perfecto} de ${rated.length} valoraciones` : "Aun no hay valoraciones")}${stat("Incidencia mas frecuente", mostCommon ? feedbackLabel(mostCommon[0]) : "—", mostCommon ? `${mostCommon[1]} veces` : "Sin incidencias")}</section>
  <div class="profile"><strong>Tu perfil personal</strong><br>Preferencia termica: ${esc(preferenceLabels[config.thermalPreference] || "Normal")}<br>Ajuste de abrigo aprendido: ${Number(profile.thermalBias || 0).toFixed(1)}°C<br>Sensibilidad al viento: nivel ${Number(profile.windBias || 0)}/3<br>Precaucion por lluvia: nivel ${Number(profile.rainSensitivity || 0)}/3<br>Total historico de valoraciones: ${Number(profile.ratingsCount || 0)}</div>
  <h2 class="section">Recomendaciones</h2>${cards || '<div class="empty">No hay recomendaciones en este periodo. Ejecuta "Ropa diaria" cada mañana para empezar a crear el historial.</div>'}
  <div class="foot">Datos locales de Scriptable · Se conservan hasta 365 registros diarios.</div></main></body></html>`;
  const web = new WebView();
  await web.loadHTML(html);
  await web.present(true);
}
Script.complete();
