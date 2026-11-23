// ============================================================
// ROPA DIARIA v2.0 - Scriptable para iPhone
// - GPS automatico y previsión horaria Open-Meteo
// - Recomendacion por capas, viento, lluvia, humedad y UV
// - Pantalla visual del outfit
// - Historial local y ajustes aprendidos de las valoraciones
// ============================================================

const APP_NAME = "Ropa diaria";
const FILES = {
  profile: "ropa_diaria_profile.json",
  history: "ropa_diaria_history.json"
};

const TARGETS = [
  { id: "morning", name: "Salida de casa", time: "07:50", minutes: 7 * 60 + 50, icon: "🌅" },
  { id: "break", name: "Descanso", time: "11:10–11:40", minutes: 11 * 60 + 25, icon: "☕" },
  { id: "afternoon", name: "Salida del centro", time: "14:20", minutes: 14 * 60 + 20, icon: "🌤️" }
];

const fm = FileManager.local();
const root = fm.documentsDirectory();
const profilePath = fm.joinPath(root, FILES.profile);
const historyPath = fm.joinPath(root, FILES.history);

// ---------- Persistencia local ----------
function readJSON(path, fallback) {
  try {
    if (!fm.fileExists(path)) return fallback;
    return JSON.parse(fm.readString(path));
  } catch (error) {
    console.warn(`No se pudo leer ${path}: ${error}`);
    return fallback;
  }
}

function writeJSON(path, value) {
  fm.writeString(path, JSON.stringify(value, null, 2));
}

function defaultProfile() {
  return {
    thermalBias: 0,
    windBias: 0,
    rainSensitivity: 0,
    ratingsCount: 0,
    lastUpdated: null
  };
}

function loadProfile() {
  const saved = readJSON(profilePath, {});
  const base = defaultProfile();
  return { ...base, ...saved };
}

function loadHistory() {
  const value = readJSON(historyPath, []);
  return Array.isArray(value) ? value : [];
}

function saveHistory(history) {
  writeJSON(historyPath, history.slice(-90));
}

// ---------- Utilidades ----------
function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function minOf(values) {
  const valid = values.filter(value => value !== null && Number.isFinite(value));
  return valid.length ? Math.min(...valid) : null;
}

function maxOf(values) {
  const valid = values.filter(value => value !== null && Number.isFinite(value));
  return valid.length ? Math.max(...valid) : null;
}

function round(value) {
  return value === null ? "—" : `${Math.round(value)}°C`;
}

function kmh(value) {
  return value === null ? "—" : `${Math.round(value)} km/h`;
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateLabel(isoDate) {
  const parts = isoDate.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
  return date.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long"
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>\"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[char]);
}

function hourIndex(times, targetMinutes) {
  let bestIndex = -1;
  let bestDifference = Infinity;
  for (let i = 0; i < times.length; i++) {
    const time = String(times[i]).slice(11, 16);
    const [hours, minutes] = time.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) continue;
    const difference = Math.abs((hours * 60 + minutes) - targetMinutes);
    if (difference < bestDifference) {
      bestDifference = difference;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function at(array, index) {
  if (!array || index < 0 || index >= array.length) return null;
  return n(array[index]);
}

function isRainCode(code) {
  return code !== null && (
    (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99) || (code >= 71 && code <= 77) ||
    (code >= 85 && code <= 86)
  );
}

function weatherInfo(code) {
  const map = {
    0: ["Despejado", "☀️"], 1: ["Poco nuboso", "🌤️"],
    2: ["Parcialmente nuboso", "⛅"], 3: ["Cubierto", "☁️"],
    45: ["Niebla", "🌫️"], 48: ["Niebla con escarcha", "🌫️"],
    51: ["Llovizna ligera", "🌦️"], 53: ["Llovizna", "🌦️"], 55: ["Llovizna intensa", "🌧️"],
    56: ["Llovizna helada", "🌧️"], 57: ["Llovizna helada intensa", "🌧️"],
    61: ["Lluvia ligera", "🌦️"], 63: ["Lluvia moderada", "🌧️"], 65: ["Lluvia intensa", "🌧️"],
    66: ["Lluvia helada", "🌧️"], 67: ["Lluvia helada intensa", "🌧️"],
    71: ["Nieve ligera", "🌨️"], 73: ["Nieve", "🌨️"], 75: ["Nieve intensa", "❄️"],
    77: ["Granulos de nieve", "🌨️"], 80: ["Chubascos", "🌦️"],
    81: ["Chubascos moderados", "🌧️"], 82: ["Chubascos fuertes", "⛈️"],
    85: ["Chubascos de nieve", "🌨️"], 86: ["Chubascos de nieve fuertes", "🌨️"],
    95: ["Tormenta", "⛈️"], 96: ["Tormenta con granizo", "⛈️"], 99: ["Tormenta fuerte con granizo", "⛈️"]
  };
  return map[code] || ["Tiempo variable", "🌥️"];
}

// ---------- Transporte y ubicacion ----------
async function chooseTransport() {
  const alert = new Alert();
  alert.title = "¿Cómo te desplazas hoy?";
  alert.message = "Ajustaré la recomendación según el tiempo que puedas pasar esperando o caminando al aire libre.";
  alert.addAction("🚗 Voy en coche");
  alert.addAction("🚌 Voy en autobús");
  alert.addCancelAction("Cancelar");
  const choice = await alert.presentAlert();
  if (choice === 0) return "coche";
  if (choice === 1) return "autobús";
  return null;
}

async function getPlaceName(latitude, longitude) {
  try {
    const places = await Location.reverseGeocode(latitude, longitude, "es_ES");
    if (places && places.length) {
      const place = places[0];
      return place.locality || place.subAdministrativeArea || place.administrativeArea || "Ubicación actual";
    }
  } catch (error) {
    console.warn(`No se pudo resolver el nombre del lugar: ${error}`);
  }
  return "Ubicación GPS";
}

// ---------- Consulta meteorologica ----------
async function getWeather(latitude, longitude) {
  const hourly = [
    "temperature_2m", "apparent_temperature", "relative_humidity_2m",
    "precipitation_probability", "precipitation", "weather_code",
    "wind_speed_10m", "wind_gusts_10m", "uv_index"
  ].join(",");
  const daily = [
    "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max",
    "apparent_temperature_min", "precipitation_probability_max", "precipitation_sum",
    "wind_speed_10m_max", "wind_gusts_10m_max", "uv_index_max", "weather_code"
  ].join(",");

  const url = "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitude.toFixed(3)}` +
    `&longitude=${longitude.toFixed(3)}` +
    `&hourly=${hourly}&daily=${daily}` +
    "&timezone=auto&forecast_days=1&wind_speed_unit=kmh&precipitation_unit=mm";

  const request = new Request(url);
  request.timeoutInterval = 30;
  const data = await request.loadJSON();
  if (data.error) throw new Error(data.reason || "Open-Meteo ha devuelto un error.");
  if (!data.hourly || !data.daily || !data.hourly.time || !data.daily.time) {
    throw new Error("La respuesta meteorológica está incompleta.");
  }
  return data;
}

// ---------- Motor de recomendaciones ----------
function upperByFeel(feels) {
  if (feels <= -2) return {
    base: "Camiseta térmica o manga larga",
    mid: "Jersey grueso o sudadera gruesa",
    outer: "Abrigo de invierno"
  };
  if (feels <= 3) return {
    base: "Camiseta de manga larga o básica",
    mid: "Jersey grueso o sudadera cálida",
    outer: "Abrigo de invierno"
  };
  if (feels <= 7) return {
    base: "Camiseta",
    mid: "Jersey o sudadera de grosor medio",
    outer: "Abrigo o chaqueta de invierno"
  };
  if (feels <= 11) return {
    base: "Camiseta",
    mid: "Sudadera o jersey",
    outer: "Chaqueta de abrigo"
  };
  if (feels <= 15) return {
    base: "Camiseta",
    mid: "Sudadera fina o jersey ligero",
    outer: "Chaqueta ligera"
  };
  if (feels <= 19) return {
    base: "Camiseta",
    mid: "Sudadera fina opcional",
    outer: "Cortavientos o chaqueta fina"
  };
  if (feels <= 23) return {
    base: "Camiseta",
    mid: "Sin capa intermedia; llévala solo si eres friolero",
    outer: "Chaqueta fina opcional a primera hora"
  };
  return {
    base: "Camiseta ligera y transpirable",
    mid: "No necesitas sudadera",
    outer: "Sin chaqueta; lleva una capa fina solo si refresca"
  };
}

function layerForPeriod(feels) {
  if (feels <= 4) return "Abrigo + jersey";
  if (feels <= 9) return "Chaqueta de abrigo + sudadera";
  if (feels <= 14) return "Chaqueta ligera + sudadera fina";
  if (feels <= 19) return "Capa fina o cortavientos";
  if (feels <= 24) return "Camiseta; chaqueta opcional";
  return "Camiseta transpirable";
}

function buildReport(weather, transport, placeName, profile) {
  const h = weather.hourly;
  const d = weather.daily;
  const periods = TARGETS.map(target => {
    const index = hourIndex(h.time, target.minutes);
    const code = at(h.weather_code, index);
    const info = weatherInfo(code);
    return {
      ...target,
      temperature: at(h.temperature_2m, index),
      feels: at(h.apparent_temperature, index),
      humidity: at(h.relative_humidity_2m, index),
      rainProbability: at(h.precipitation_probability, index),
      precipitation: at(h.precipitation, index),
      code,
      weather: info[0],
      icon: info[1],
      wind: at(h.wind_speed_10m, index),
      gusts: at(h.wind_gusts_10m, index),
      uv: at(h.uv_index, index)
    };
  });

  const minTemp = at(d.temperature_2m_min, 0);
  const maxTemp = at(d.temperature_2m_max, 0);
  const dailyFeelsMin = at(d.apparent_temperature_min, 0);
  const dailyFeelsMax = at(d.apparent_temperature_max, 0);
  const minExposureFeels = minOf(periods.map(p => p.feels)) ?? dailyFeelsMin ?? minTemp ?? 10;
  const maxExposureFeels = maxOf(periods.map(p => p.feels)) ?? dailyFeelsMax ?? maxTemp ?? 18;
  const adjustedCold = minExposureFeels - profile.thermalBias;
  const adjustedWarm = maxExposureFeels - profile.thermalBias;
  const gusts = maxOf(periods.map(p => p.gusts)) ?? at(d.wind_gusts_10m_max, 0) ?? 0;
  const wind = maxOf(periods.map(p => p.wind)) ?? at(d.wind_speed_10m_max, 0) ?? 0;
  const rainChance = maxOf(periods.map(p => p.rainProbability)) ?? at(d.precipitation_probability_max, 0) ?? 0;
  const rainAmount = maxOf(periods.map(p => p.precipitation)) ?? 0;
  const humidity = maxOf(periods.map(p => p.humidity)) ?? 0;
  const uv = maxOf(periods.map(p => p.uv)) ?? at(d.uv_index_max, 0) ?? 0;
  const rainCutoff = 45 - (profile.rainSensitivity * 5);
  const rainExpected = rainChance >= rainCutoff || rainAmount >= 0.2 || periods.some(p => isRainCode(p.code));

  let outfit = upperByFeel(adjustedCold);
  const windCutoff = 32 - (profile.windBias * 4) - (transport === "autobús" ? 4 : 0);
  let windAdvice = "";
  if (gusts >= 55) {
    outfit.outer = "Chaqueta cortavientos resistente o abrigo con exterior cortavientos";
    windAdvice = `Rachas fuertes de hasta ${Math.round(gusts)} km/h. Evita depender del paraguas.`;
  } else if (gusts >= windCutoff) {
    if (adjustedCold <= 8) {
      outfit.outer = "Abrigo cálido con tejido exterior que frene el viento";
    } else {
      outfit.outer = "Chaqueta cortavientos; mejor con capucha";
    }
    windAdvice = `El viento puede molestar: se esperan rachas de hasta ${Math.round(gusts)} km/h.`;
  } else if (gusts >= 22) {
    windAdvice = `Habrá algo de viento, con rachas de hasta ${Math.round(gusts)} km/h.`;
  }

  if (rainExpected) {
    outfit.outer = gusts >= 35 ? "Chubasquero impermeable con capucha y protección frente al viento" : "Chubasquero o chaqueta impermeable";
  }

  let lower;
  if (adjustedCold <= 3) lower = "Vaqueros o pantalón largo de tejido grueso";
  else if (adjustedWarm >= 28) lower = "Pantalón muy ligero; bermudas solo si te resultan cómodas";
  else if (adjustedWarm >= 23) lower = "Pantalón ligero o vaqueros finos";
  else lower = "Vaqueros o pantalón largo habitual";

  let shoes;
  if (rainExpected || periods.some(p => p.precipitation >= 0.5)) {
    shoes = "Zapatillas impermeables o calzado cerrado que no cale";
  } else if (adjustedWarm >= 25) {
    shoes = "Zapatillas ligeras y transpirables";
  } else {
    shoes = "Zapatillas cerradas habituales";
  }

  const accessories = [];
  if (rainExpected) accessories.push(gusts >= 40 ? "chubasquero con capucha (mejor que paraguas)" : "paraguas o chubasquero");
  if (adjustedCold <= 2) accessories.push("bufanda y guantes si vas a esperar fuera");
  else if (adjustedCold <= 6) accessories.push("bufanda fina opcional a primera hora");
  if (uv >= 6) accessories.push("gafas de sol y protección solar");
  if (adjustedWarm >= 25 && humidity >= 75) accessories.push("ropa transpirable y agua; la humedad puede aumentar la sensación de bochorno");
  if (!accessories.length) accessories.push("no necesitas accesorios especiales");

  const temperatureGap = adjustedWarm - adjustedCold;
  const notes = [];
  if (temperatureGap >= 8) notes.push("Hay bastante diferencia entre la mañana y las horas centrales: utiliza capas que puedas quitarte.");
  if (windAdvice) notes.push(windAdvice);
  if (rainExpected) notes.push(`Lluvia posible en alguna de tus franjas: probabilidad máxima ${Math.round(rainChance)}%.`);
  else if (rainChance >= 25) notes.push(`La lluvia no es segura, pero existe una posibilidad puntual del ${Math.round(rainChance)}%.`);
  if (adjustedWarm >= 25) notes.push("A mediodía puede sobrarte ropa: evita capas gruesas y prioriza tejidos transpirables.");
  if (transport === "autobús") notes.push("En autobús pasarás más tiempo esperando o caminando: lleva la protección exterior puesta y accesible.");
  else notes.push("En coche puedes llevar la capa exterior a mano y ponértela para los trayectos a pie.");
  if (profile.ratingsCount > 0) {
    notes.push(`Ajuste personal activo: ${profile.ratingsCount} valoraciones; ${profile.thermalBias > 0 ? "tiendes a necesitar algo más de abrigo" : profile.thermalBias < 0 ? "tiendes a necesitar algo menos de abrigo" : "sin ajuste térmico adicional"}.`);
  }

  const date = d.time[0];
  const dayCode = at(d.weather_code, 0) ?? periods[1].code;
  const dayWeather = weatherInfo(dayCode)[0];
  const report = {
    date, dateLabel: dateLabel(date), place: placeName || "Ubicación GPS", transport,
    minTemp, maxTemp, dailyFeelsMin, dailyFeelsMax,
    minExposureFeels, maxExposureFeels, adjustedCold, adjustedWarm,
    gusts, wind, rainChance, rainAmount, humidity, uv, rainExpected,
    outfit: { ...outfit, lower, shoes, accessories },
    periods: periods.map(p => ({
      ...p,
      recommendation: layerForPeriod((p.feels ?? minExposureFeels) - profile.thermalBias)
    })),
    notes, dayWeather, profile: { ...profile },
    historyCount: loadHistory().length
  };
  return report;
}

// ---------- Historial ----------
function saveRecommendation(report) {
  const history = loadHistory();
  const entry = {
    date: report.date,
    createdAt: new Date().toISOString(),
    place: report.place,
    transport: report.transport,
    minTemp: report.minTemp,
    maxTemp: report.maxTemp,
    feelsMin: report.minExposureFeels,
    feelsMax: report.maxExposureFeels,
    gusts: report.gusts,
    rainChance: report.rainChance,
    outfit: report.outfit,
    feedback: null
  };
  const existingIndex = history.findIndex(item => item.date === report.date);
  if (existingIndex >= 0) history[existingIndex] = entry;
  else history.push(entry);
  saveHistory(history);
}

// ---------- Notificacion ----------
async function sendNotification(report) {
  const notification = new Notification();
  notification.title = `Ropa de hoy · ${Math.round(report.minTemp)}° / ${Math.round(report.maxTemp)}°`;
  notification.subtitle = `${report.place} · Sensación ${Math.round(report.adjustedCold)}–${Math.round(report.adjustedWarm)}°`;
  const shortOuter = report.outfit.outer;
  notification.body = `${report.outfit.base} + ${report.outfit.mid}. Exterior: ${shortOuter}. ${report.rainExpected ? "Previsión de lluvia: lleva protección." : `Rachas: ${Math.round(report.gusts)} km/h.`}`;
  notification.sound = "default";
  notification.threadIdentifier = "ropa-diaria";
  notification.setTriggerDate(new Date(Date.now() + 1200));
  await notification.schedule();
}

// ---------- Pantalla visual del outfit ----------
function makeHTML(report) {
  const item = (emoji, title, value, detail) => `
    <article class="item">
      <div class="emoji">${emoji}</div>
      <div class="itemtext"><div class="itemtitle">${escapeHTML(title)}</div><div class="value">${escapeHTML(value)}</div>${detail ? `<div class="detail">${escapeHTML(detail)}</div>` : ""}</div>
    </article>`;

  const periodsHTML = report.periods.map(period => `
    <div class="period">
      <div class="periodhead"><span>${period.icon} ${escapeHTML(period.name)}</span><b>${escapeHTML(period.time)}</b></div>
      <div class="periodmain"><span class="weathericon">${period.icon === "🌅" ? "🌤️" : period.icon === "☕" ? period.icon : "🌤️"}</span><div><strong>${round(period.temperature)}</strong><small>sensación ${round(period.feels)}</small></div></div>
      <div class="metrics"><span>💨 Rachas ${kmh(period.gusts)}</span><span>🌧️ Lluvia ${period.rainProbability === null ? "—" : `${Math.round(period.rainProbability)}%`}</span><span>☁️ ${escapeHTML(period.weather)}</span></div>
      <div class="periodadvice">${escapeHTML(period.recommendation)}</div>
    </div>`).join("");

  const notesHTML = report.notes.map(note => `<li>${escapeHTML(note)}</li>`).join("");
  const accessories = report.outfit.accessories.map(value => `<span class="chip">${escapeHTML(value)}</span>`).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta charset="utf-8"><style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:22px 16px 36px;background:#101318;color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
    .wrap{max-width:560px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;color:#9da7b4;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.tag{padding:7px 10px;border-radius:99px;background:#243b32;color:#8be0ac;letter-spacing:0}
    h1{font-size:29px;margin:14px 0 4px}.date{color:#aab2bf;font-size:14px}.hero{margin:20px 0;padding:20px;border-radius:22px;background:linear-gradient(135deg,#27384b,#1c2733)}.heroRow{display:flex;justify-content:space-between;align-items:center}.big{font-size:43px;font-weight:750;letter-spacing:-2px}.sub{font-size:13px;color:#c1cbd6;margin-top:4px}.sun{font-size:43px}.minmax{display:flex;gap:12px;flex-wrap:wrap;margin-top:15px;color:#d9e1e9;font-size:13px}.section{font-size:17px;margin:26px 0 12px}.item{display:flex;gap:13px;align-items:center;padding:14px 12px;margin:9px 0;border:1px solid #303741;background:#1b2028;border-radius:16px}.emoji{font-size:30px;width:43px;text-align:center}.itemtitle{font-size:11px;color:#aab2bf;text-transform:uppercase;letter-spacing:.06em}.value{font-size:15px;font-weight:650;margin-top:3px;line-height:1.35}.detail{font-size:12px;color:#aab2bf;margin-top:3px}.period{border:1px solid #303741;background:#1b2028;border-radius:17px;padding:14px;margin:10px 0}.periodhead{display:flex;justify-content:space-between;color:#c8d0da;font-size:13px}.periodhead b{color:#9da7b4;font-weight:500}.periodmain{display:flex;gap:12px;align-items:center;margin:15px 0}.weathericon{font-size:32px}.periodmain strong{font-size:22px;display:block}.periodmain small{display:block;color:#aab2bf;margin-top:2px}.metrics{display:flex;gap:8px;flex-wrap:wrap;color:#aab2bf;font-size:11px}.periodadvice{margin-top:12px;border-radius:10px;padding:10px;background:#252e39;color:#dce6ef;font-size:13px}.chips{display:flex;gap:8px;flex-wrap:wrap}.chip{font-size:12px;padding:8px 10px;border-radius:99px;background:#252e39;color:#dce6ef}.notes{padding:14px 16px;background:#1b2028;border-radius:16px;border:1px solid #303741;color:#cbd3dc;font-size:13px;line-height:1.5}.notes li{margin:5px 0}.foot{margin-top:22px;color:#7e8997;font-size:11px;line-height:1.5;text-align:center}</style></head><body><main class="wrap">
    <div class="top"><span>ROPA DIARIA · RECOMENDACIÓN</span><span class="tag">${report.transport === "autobús" ? "🚌 Autobús" : "🚗 Coche"}</span></div>
    <h1>Tu outfit de hoy</h1><div class="date">${escapeHTML(report.dateLabel)} · ${escapeHTML(report.place)}</div>
    <section class="hero"><div class="heroRow"><div><div class="big">${Math.round(report.adjustedCold)}°–${Math.round(report.adjustedWarm)}°</div><div class="sub">Sensación térmica en tus momentos fuera</div></div><div class="sun">${report.rainExpected ? "🌧️" : "🌤️"}</div></div><div class="minmax"><span>🌡️ ${round(report.minTemp)} mín.</span><span>☀️ ${round(report.maxTemp)} máx.</span><span>💨 Rachas ${kmh(report.gusts)}</span></div></section>
    <h2 class="section">Prendas recomendadas</h2>
    ${item("👕", "Capa base", report.outfit.base, "La prenda que llevarás directamente sobre la piel")}
    ${item("🧶", "Capa intermedia", report.outfit.mid, "Aporta abrigo y puedes quitártela si sube la temperatura")}
    ${item(report.rainExpected ? "🌧️" : "🧥", "Capa exterior", report.outfit.outer, "La protección frente al viento y la lluvia")}
    ${item("👖", "Pantalón", report.outfit.lower, "Pensado para la sensación térmica más fría y la más cálida")}
    ${item("👟", "Calzado", report.outfit.shoes, "Prioriza comodidad y protección si el suelo se moja")}
    <h2 class="section">Cómo cambiará el día</h2>${periodsHTML}
    <h2 class="section">Accesorios</h2><div class="chips">${accessories}</div>
    <h2 class="section">Consejos</h2><div class="notes"><ul>${notesHTML}</ul></div>
    <div class="foot">Datos meteorológicos: Open-Meteo · GPS aproximado a 3 decimales.<br>Historial guardado localmente en Scriptable · ${report.historyCount + 1} recomendaciones registradas.<br>La recomendación es orientativa y se ajustará con tus valoraciones.</div>
  </main></body></html>`;
}

async function showVisualReport(report) {
  const web = new WebView();
  await web.loadHTML(makeHTML(report));
  await web.present(true);
}

async function showError(message) {
  const alert = new Alert();
  alert.title = `${APP_NAME}: error`;
  alert.message = message;
  alert.addAction("Aceptar");
  await alert.presentAlert();
}

// ---------- Ejecucion principal ----------
try {
  const transport = await chooseTransport();
  if (!transport) {
    const cancelled = new Alert();
    cancelled.title = "Recomendación cancelada";
    cancelled.message = "No se ha guardado ningún outfit.";
    cancelled.addAction("Aceptar");
    await cancelled.presentAlert();
  } else {
    Location.setAccuracyToHundredMeters();
    const currentLocation = await Location.current();
    const placeName = await getPlaceName(currentLocation.latitude, currentLocation.longitude);
    const weather = await getWeather(currentLocation.latitude, currentLocation.longitude);
    const profile = loadProfile();
    const report = buildReport(weather, transport, placeName, profile);
    saveRecommendation(report);
    await sendNotification(report);
    await showVisualReport(report);
  }
} catch (error) {
  await showError(error && error.message ? error.message : String(error));
}

Script.complete();
