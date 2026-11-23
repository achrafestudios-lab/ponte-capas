// ROPA DIARIA v4.0 - ejecucion automatica y registro mejorado
// Recibe coordenadas como texto "latitud|longitud" desde Atajos.
// Conserva la compatibilidad con los datos locales de V2 y V3.

const APP_NAME = "Ropa diaria";
const PROFILE_FILE = "ropa_diaria_profile.json";
const HISTORY_FILE = "ropa_diaria_history.json";
const CONFIG_FILE = "ropa_diaria_config.json";
const VIEW_SCRIPT = "Ver outfit hoy";
const RATING_SCRIPT = "Valorar outfit";
const HISTORY_LIMIT = 365;

const TARGETS = [
  { id: "morning", name: "Salida de casa", time: "07:50", minutes: 470, icon: "🌅" },
  { id: "break", name: "Descanso", time: "11:10–11:40", minutes: 685, icon: "☕" },
  { id: "afternoon", name: "Salida del centro", time: "14:20", minutes: 860, icon: "🌤️" }
];

const fm = FileManager.local();
const root = fm.documentsDirectory();
const profilePath = fm.joinPath(root, PROFILE_FILE);
const historyPath = fm.joinPath(root, HISTORY_FILE);
const configPath = fm.joinPath(root, CONFIG_FILE);

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
  return { thermalBias: 0, windBias: 0, rainSensitivity: 0, ratingsCount: 0, lastUpdated: null };
}

function loadProfile() {
  return { ...defaultProfile(), ...(readJSON(profilePath, {}) || {}) };
}

function loadConfig() {
  const saved = readJSON(configPath, {}) || {};
  const transport = saved.transport === "autobus" ? "autobus" : "coche";
  const allowedPreferences = ["friolero", "normal", "caluroso"];
  const thermalPreference = allowedPreferences.includes(saved.thermalPreference)
    ? saved.thermalPreference
    : "normal";
  return { transport, thermalPreference };
}

function loadHistory() {
  const value = readJSON(historyPath, []);
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function minOf(values) {
  const valid = values.filter(value => value !== null && Number.isFinite(value));
  return valid.length ? Math.min(...valid) : null;
}

function maxOf(values) {
  const valid = values.filter(value => value !== null && Number.isFinite(value));
  return valid.length ? Math.max(...valid) : null;
}

function r(value) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}°C`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseCoordinates(input) {
  // Atajos enviara el texto "latitud|longitud". Se aceptan tambien diccionarios.
  if (typeof input === "string") {
    const parts = input.trim().split("|");
    if (parts.length >= 2) {
      const lat = Number(parts[0].trim().replace(",", "."));
      const lon = Number(parts[1].trim().replace(",", "."));
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { latitude: lat, longitude: lon };
      }
    }
  }
  if (input && typeof input === "object") {
    const lat = numberOrNull(input.latitude ?? input.Latitude ?? input.lat);
    const lon = numberOrNull(input.longitude ?? input.Longitude ?? input.lon ?? input.lng);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

function hourIndex(times, targetMinutes) {
  let best = -1;
  let difference = Infinity;
  for (let i = 0; i < times.length; i++) {
    const clock = String(times[i]).slice(11, 16);
    const [h, m] = clock.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    const diff = Math.abs(h * 60 + m - targetMinutes);
    if (diff < difference) { difference = diff; best = i; }
  }
  return best;
}

function at(array, index) {
  if (!array || index < 0 || index >= array.length) return null;
  return numberOrNull(array[index]);
}

function weatherInfo(code) {
  const descriptions = {
    0: ["Despejado", "☀️"], 1: ["Mayormente despejado", "🌤️"],
    2: ["Parcialmente nuboso", "⛅"], 3: ["Cubierto", "☁️"],
    45: ["Niebla", "🌫️"], 48: ["Niebla engelante", "🌫️"],
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
  return descriptions[code] || ["Tiempo variable", "🌥️"];
}

function isWetCode(code) {
  return code !== null && ((code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 86) || (code >= 95 && code <= 99));
}

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
    `?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
    `&hourly=${hourly}&daily=${daily}&timezone=auto&forecast_days=1` +
    "&wind_speed_unit=kmh&precipitation_unit=mm";
  const request = new Request(url);
  request.timeoutInterval = 25;
  const data = await request.loadJSON();
  if (data.error) throw new Error(data.reason || "Open-Meteo ha devuelto un error.");
  if (!data.hourly || !data.daily || !data.hourly.time || !data.daily.time) {
    throw new Error("La respuesta meteorologica esta incompleta.");
  }
  return data;
}

function chooseUpper(feels) {
  if (feels <= -2) return { base: "Camiseta termica o manga larga", mid: "Jersey grueso o sudadera gruesa", outer: "Abrigo de invierno" };
  if (feels <= 3) return { base: "Camiseta de manga larga", mid: "Jersey grueso o sudadera calida", outer: "Abrigo de invierno" };
  if (feels <= 7) return { base: "Camiseta", mid: "Jersey o sudadera de grosor medio", outer: "Abrigo o chaqueta de invierno" };
  if (feels <= 11) return { base: "Camiseta", mid: "Sudadera o jersey", outer: "Chaqueta de abrigo" };
  if (feels <= 15) return { base: "Camiseta", mid: "Sudadera fina o jersey ligero", outer: "Chaqueta ligera" };
  if (feels <= 19) return { base: "Camiseta", mid: "Sudadera fina opcional", outer: "Cortavientos o chaqueta fina" };
  if (feels <= 23) return { base: "Camiseta", mid: "Sin capa intermedia; opcional si eres friolero", outer: "Chaqueta fina opcional a primera hora" };
  return { base: "Camiseta ligera y transpirable", mid: "Sin capa intermedia", outer: "Sin chaqueta; lleva una capa fina solo si refresca" };
}

function buildReport(weather, place, config, profile) {
  const transport = config.transport;
  const thermalPreference = config.thermalPreference || "normal";
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
      weatherIcon: info[1],
      wind: at(h.wind_speed_10m, index),
      gusts: at(h.wind_gusts_10m, index),
      uv: at(h.uv_index, index)
    };
  });

  const minTemp = at(d.temperature_2m_min, 0);
  const maxTemp = at(d.temperature_2m_max, 0);
  const feelMorning = periods[0].feels ?? at(d.apparent_temperature_min, 0) ?? minTemp ?? 10;
  const feelBreak = periods[1].feels ?? feelMorning;
  const feelAfternoon = periods[2].feels ?? at(d.apparent_temperature_max, 0) ?? maxTemp ?? feelBreak;
  const preferenceOffsets = { friolero: 2, normal: 0, caluroso: -2 };
  const preferenceOffset = preferenceOffsets[thermalPreference] ?? 0;
  const profileOffset = Number(profile.thermalBias || 0) + preferenceOffset;
  const coldFeel = Math.min(feelMorning, feelBreak, feelAfternoon) - profileOffset;
  const warmFeel = Math.max(feelMorning, feelBreak, feelAfternoon) - profileOffset;
  const maxGust = maxOf(periods.map(p => p.gusts)) ?? at(d.wind_gusts_10m_max, 0) ?? 0;
  const maxWind = maxOf(periods.map(p => p.wind)) ?? at(d.wind_speed_10m_max, 0) ?? 0;
  const maxRainProbability = maxOf(periods.map(p => p.rainProbability)) ?? at(d.precipitation_probability_max, 0) ?? 0;
  const maxRainAmount = maxOf(periods.map(p => p.precipitation)) ?? 0;
  const maxHumidity = maxOf(periods.map(p => p.humidity)) ?? 0;
  const maxUV = maxOf(periods.map(p => p.uv)) ?? at(d.uv_index_max, 0) ?? 0;
  const rainThreshold = 45 - Number(profile.rainSensitivity || 0) * 5;
  const wetCode = periods.some(p => isWetCode(p.code));
  const rainExpected = maxRainProbability >= rainThreshold || maxRainAmount >= 0.2 || wetCode;

  const outfit = chooseUpper(coldFeel);
  const busExtra = transport === "autobus" ? 4 : 0;
  const windThreshold = 32 - Number(profile.windBias || 0) * 4 - busExtra;
  const advice = [];

  if (maxGust >= 55) {
    outfit.outer = "Chaqueta cortavientos resistente o abrigo con exterior cortavientos";
    advice.push(`Rachas fuertes: hasta ${Math.round(maxGust)} km/h. Mejor capucha que paraguas.`);
  } else if (maxGust >= windThreshold) {
    outfit.outer = coldFeel <= 8 ? "Abrigo calido con tejido exterior cortavientos" : "Chaqueta cortavientos, preferiblemente con capucha";
    advice.push(`El viento puede molestar: rachas de hasta ${Math.round(maxGust)} km/h.`);
  } else if (maxGust >= 22) {
    advice.push(`Algo de viento durante el dia: rachas de hasta ${Math.round(maxGust)} km/h.`);
  }

  if (rainExpected) {
    outfit.outer = maxGust >= 35 ? "Chubasquero impermeable con capucha y proteccion frente al viento" : "Chubasquero o chaqueta impermeable";
  }

  let lower;
  if (coldFeel <= 3) lower = "Vaqueros o pantalon largo de tejido grueso";
  else if (warmFeel >= 28) lower = "Pantalon muy ligero; bermudas si te resultan comodas";
  else if (warmFeel >= 23) lower = "Pantalon ligero o vaqueros finos";
  else lower = "Vaqueros o pantalon largo habitual";

  let shoes;
  if (rainExpected || maxRainAmount >= 0.5) shoes = "Calzado cerrado que no cale o zapatillas impermeables";
  else if (warmFeel >= 25) shoes = "Zapatillas ligeras y transpirables";
  else shoes = "Zapatillas cerradas habituales";

  const accessories = [];
  if (rainExpected) accessories.push(maxGust >= 40 ? "Chubasquero con capucha (mejor que paraguas)" : "Paraguas o chubasquero");
  if (coldFeel <= 2) accessories.push("Bufanda y guantes si vas a esperar fuera");
  else if (coldFeel <= 6) accessories.push("Bufanda fina opcional a primera hora");
  if (maxUV >= 6) accessories.push("Gafas de sol y proteccion solar");
  if (warmFeel >= 25 && maxHumidity >= 75) accessories.push("Tejidos transpirables y agua; puede haber bochorno");
  if (!accessories.length) accessories.push("No hacen falta accesorios especiales");

  const range = warmFeel - coldFeel;
  if (range >= 8) advice.push("Hay bastante diferencia entre la manana y la tarde: utiliza capas faciles de quitar.");
  if (rainExpected) advice.push(`Riesgo de lluvia en alguna franja: probabilidad maxima ${Math.round(maxRainProbability)}%.`);
  else if (maxRainProbability >= 25) advice.push(`La lluvia no es segura, pero hay una posibilidad puntual del ${Math.round(maxRainProbability)}%.`);
  if (warmFeel >= 25) advice.push("A mediodia puede sobrarte ropa: evita capas gruesas y prioriza tejidos transpirables.");
  if (transport === "autobus") advice.push("Has indicado autobus: prioriza una capa exterior comoda para esperar y caminar.");
  else advice.push("Has indicado coche: deja la capa exterior a mano para los trayectos a pie.");
  if (thermalPreference === "friolero") advice.push("Preferencia personal: se prioriza un poco mas de abrigo.");
  if (thermalPreference === "caluroso") advice.push("Preferencia personal: se evita abrigo innecesario.");
  if (profile.ratingsCount > 0) advice.push(`Ajuste personal aplicado a partir de ${profile.ratingsCount} valoraciones.`);

  return {
    schemaVersion: 4,
    date: d.time[0],
    createdAt: new Date().toISOString(),
    place,
    transport,
    thermalPreference,
    minTemp,
    maxTemp,
    feelsMin: coldFeel,
    feelsMax: warmFeel,
    feelsMorning: feelMorning - profileOffset,
    feelsBreak: feelBreak - profileOffset,
    feelsAfternoon: feelAfternoon - profileOffset,
    gusts: maxGust,
    wind: maxWind,
    rainChance: maxRainProbability,
    rainAmount: maxRainAmount,
    humidity: maxHumidity,
    uv: maxUV,
    rainExpected,
    outfit: { ...outfit, lower, shoes, accessories },
    periods: periods.map(p => ({
      name: p.name,
      time: p.time,
      temperature: p.temperature,
      feels: p.feels,
      weather: p.weather,
      weatherIcon: p.weatherIcon,
      wind: p.wind,
      gusts: p.gusts,
      rainProbability: p.rainProbability
    })),
    notes: advice,
    feedback: null,
    profileSnapshot: { ...profile }
  };
}

function saveReport(report) {
  const history = loadHistory();
  const existing = history.findIndex(item => item.date === report.date);
  const now = new Date().toISOString();

  if (existing >= 0) {
    const previous = history[existing];
    // Una nueva ejecucion el mismo dia actualiza el tiempo, pero no borra la valoracion.
    history[existing] = {
      ...report,
      createdAt: previous.createdAt || report.createdAt,
      updatedAt: now,
      feedback: previous.feedback || report.feedback || null,
      feedbackAt: previous.feedbackAt || report.feedbackAt || null
    };
  } else {
    history.push({ ...report, updatedAt: now });
  }

  history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  writeJSON(historyPath, history.slice(-HISTORY_LIMIT));
}

async function scheduleNotification(title, subtitle, body, openURL, date, threadIdentifier = "ropa-diaria") {
  const notification = new Notification();
  notification.title = title;
  notification.subtitle = subtitle;
  notification.body = body;
  notification.sound = "default";
  notification.threadIdentifier = threadIdentifier;
  if (openURL) notification.openURL = openURL;
  notification.setTriggerDate(date);
  await notification.schedule();
}

async function sendReportNotification(report) {
  const title = `Ropa de hoy · ${Math.round(report.minTemp)}° / ${Math.round(report.maxTemp)}°`;
  const subtitle = `${report.place} · Sensacion ${Math.round(report.feelsMin)}–${Math.round(report.feelsMax)}°`;
  const body = `${report.outfit.base} + ${report.outfit.mid}. Exterior: ${report.outfit.outer}. ${report.outfit.lower}. ${report.outfit.shoes}. ${report.rainExpected ? "Lleva proteccion para la lluvia." : `Rachas: ${Math.round(report.gusts)} km/h.`} Toca para ver el outfit completo.`;
  await scheduleNotification(title, subtitle, body, `scriptable:///run/${encodeURIComponent(VIEW_SCRIPT)}`, new Date(Date.now() + 2500));
}

async function scheduleRatingReminder() {
  const reminderDate = new Date();
  reminderDate.setHours(20, 30, 0, 0);
  if (reminderDate.getTime() <= Date.now()) reminderDate.setDate(reminderDate.getDate() + 1);
  const pending = await Notification.allPending();
  const oldReminders = pending.filter(item => item.threadIdentifier === "ropa-diaria-recordatorio").map(item => item.identifier);
  if (oldReminders.length) await Notification.removePending(oldReminders);
  await scheduleNotification(
    "Valora tu outfit de hoy",
    "Ayuda a ajustar las recomendaciones",
    "¿Has pasado frio, calor, te ha molestado el viento o ha ido todo bien? Toca para registrar tu valoracion.",
    `scriptable:///run/${encodeURIComponent(RATING_SCRIPT)}`,
    reminderDate,
    "ropa-diaria-recordatorio"
  );
}

async function sendErrorNotification(message) {
  const notification = new Notification();
  notification.title = "Ropa diaria: no se pudo actualizar";
  notification.body = String(message).slice(0, 220);
  notification.sound = "failure";
  notification.threadIdentifier = "ropa-diaria";
  notification.setTriggerDate(new Date(Date.now() + 1500));
  await notification.schedule();
}

try {
  const coords = parseCoordinates(args.shortcutParameter);
  let latitude;
  let longitude;

  if (coords) {
    latitude = coords.latitude;
    longitude = coords.longitude;
  } else {
    // Permite probar el script manualmente desde Scriptable tras conceder permiso GPS.
    Location.setAccuracyToHundredMeters();
    const location = await Location.current();
    latitude = location.latitude;
    longitude = location.longitude;
  }

  const config = loadConfig();
  const profile = loadProfile();
  const weather = await getWeather(latitude, longitude);
  const report = buildReport(weather, "Ubicacion GPS", config, profile);
  saveReport(report);
  await sendReportNotification(report);
  await scheduleRatingReminder();
  console.log(`Recomendacion guardada para ${report.date}. Transporte: ${config.transport}.`);
} catch (error) {
  console.error(error);
  try {
    await sendErrorNotification(error && error.message ? error.message : String(error));
  } catch (notificationError) {
    console.error(`Tampoco se pudo programar la notificacion de error: ${notificationError}`);
  }
}

Script.complete();
