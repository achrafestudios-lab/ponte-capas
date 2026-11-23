// VER OUTFIT HOY - Scriptable V4; detalle del outfit del dia.
const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), "ropa_diaria_history.json");
function esc(value) {
  return String(value ?? "—").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function readHistory() {
  try { return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : []; }
  catch (_) { return []; }
}
function dateText(value) {
  try {
    const [y,m,d] = value.split("-").map(Number);
    return new Date(y,m-1,d,12).toLocaleDateString("es-ES", { weekday:"long", day:"numeric", month:"long" });
  } catch (_) { return value; }
}

const history = readHistory();
const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
const report = history.find(item => item.date === todayKey) || history[history.length - 1];

if (!report) {
  const alert = new Alert();
  alert.title = "Todavia no hay outfit";
  alert.message = "Ejecuta primero la automatizacion de Ropa diaria.";
  alert.addAction("Aceptar");
  await alert.presentAlert();
} else {
  const outfit = report.outfit || {};
  const feedbackLabels = { frio: "🥶 Pasaste frio", calor: "🥵 Pasaste calor", viento: "💨 Viento molesto", lluvia: "🌧️ Te mojaste", perfecto: "✅ Todo perfecto" };
  const feedbackText = report.feedback ? feedbackLabels[report.feedback] || "Valorado" : "Pendiente de valorar";
  const preferenceLabels = { friolero: "Friolero", normal: "Normal", caluroso: "Caluroso" };
  const preferenceText = preferenceLabels[report.thermalPreference] || "Normal";
  const pieces = [
    ["👕", "Capa base", outfit.base],
    ["🧶", "Capa intermedia", outfit.mid],
    ["🧥", "Capa exterior", outfit.outer],
    ["👖", "Pantalon", outfit.lower],
    ["👟", "Calzado", outfit.shoes],
    ["🎒", "Accesorios", (outfit.accessories || []).join(" · ")]
  ];
  const cards = pieces.map(([icon,title,value]) => `<article class="piece"><div class="icon">${icon}</div><div><small>${esc(title)}</small><strong>${esc(value)}</strong></div></article>`).join("");
  const periods = (report.periods || []).map(p => `<article class="period"><header><strong>${esc(p.name)}</strong><span>${esc(p.time)}</span></header><div class="temp">${p.temperature == null ? "—" : Math.round(p.temperature)}°C <small>sensacion ${p.feels == null ? "—" : Math.round(p.feels)}°C</small></div><div class="meta">${esc(p.weather)} · Viento ${p.wind == null ? "—" : Math.round(p.wind)} km/h · Rachas ${p.gusts == null ? "—" : Math.round(p.gusts)} km/h · Lluvia ${p.rainProbability == null ? "—" : Math.round(p.rainProbability)}%</div></article>`).join("");
  const notes = (report.notes || []).map(item => `<li>${esc(item)}</li>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:22px 16px 36px;background:#101318;color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif}.wrap{max-width:560px;margin:auto}.eyebrow{color:#92a0b1;text-transform:uppercase;letter-spacing:.12em;font-size:11px}h1{font-size:29px;margin:9px 0 4px}.date{color:#aab2bf;font-size:14px}.status{display:inline-block;margin-top:10px;padding:7px 11px;border-radius:30px;background:#29323d;color:#dce6ef;font-size:12px}.hero{margin:18px 0;padding:18px;border-radius:20px;background:#202b38}.hero strong{font-size:35px}.hero p{margin:5px 0 0;color:#c3ccd7;font-size:13px}.section{margin:24px 0 10px;font-size:17px}.piece,.period{display:flex;gap:13px;align-items:center;background:#1b2028;border:1px solid #303741;border-radius:16px;padding:14px;margin:9px 0}.icon{font-size:25px;width:34px;text-align:center}.piece small{display:block;color:#98a5b4;font-size:11px;margin-bottom:4px}.piece strong{font-size:14px;line-height:1.45}.period{display:block}.period header{display:flex;justify-content:space-between;color:#aab2bf;font-size:12px}.period header strong{color:#f4f5f7}.temp{font-size:23px;font-weight:750;margin:12px 0 5px}.temp small,.meta{color:#aab2bf;font-size:12px;font-weight:400}.notes{padding:15px 15px 15px 32px;background:#202b38;border-radius:16px;color:#d6dee8;font-size:13px;line-height:1.6}.foot{color:#718093;font-size:11px;text-align:center;margin-top:22px}
  </style></head><body><main class="wrap"><div class="eyebrow">Ropa diaria · ${esc(report.place || "GPS")}</div><h1>Tu outfit de hoy</h1><div class="date">${esc(dateText(report.date))} · ${esc(report.transport === "autobus" ? "Autobus" : "Coche")} · Perfil: ${esc(preferenceText)}</div><div class="status">${esc(feedbackText)}</div><section class="hero"><strong>${report.minTemp == null ? "—" : Math.round(report.minTemp)}° / ${report.maxTemp == null ? "—" : Math.round(report.maxTemp)}°</strong><p>Sensacion durante tus franjas: ${report.feelsMin == null ? "—" : Math.round(report.feelsMin)}°–${report.feelsMax == null ? "—" : Math.round(report.feelsMax)}° · Rachas maximas ${report.gusts == null ? "—" : Math.round(report.gusts)} km/h</p></section><h2 class="section">Prendas recomendadas</h2>${cards}<h2 class="section">A lo largo del dia</h2>${periods}<h2 class="section">Consejos</h2><ul class="notes">${notes || "<li>Sin consejos adicionales.</li>"}</ul><div class="foot">Prevision Open-Meteo · Datos guardados localmente en Scriptable.</div></main></body></html>`;
  const web = new WebView();
  await web.loadHTML(html);
  await web.present(true);
}
Script.complete();
