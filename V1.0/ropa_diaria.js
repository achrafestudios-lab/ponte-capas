// ============================================================
// ROPA DIARIA - Scriptable para iPhone
// Version 1.0
// Consulta Open-Meteo usando la ubicacion actual y recomienda
// ropa para las 07:50, el descanso y la salida de las 14:20.
// ============================================================

const APP_NAME = "Ropa diaria";
const TARGETS = [
  { name: "Salida de casa · 07:50", hour: 8 },
  { name: "Descanso · 11:10–11:40", hour: 11 },
  { name: "Salida del centro · 14:20", hour: 14 }
];

// ---------- Utilidades ----------
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function maxOf(values) {
  const valid = values.filter(v => v !== null && Number.isFinite(v));
  return valid.length ? Math.max(...valid) : null;
}

function minOf(values) {
  const valid = values.filter(v => v !== null && Number.isFinite(v));
  return valid.length ? Math.min(...valid) : null;
}

function formatDegrees(value) {
  return value === null ? "—" : `${Math.round(value)} °C`;
}

function formatWind(value) {
  return value === null ? "—" : `${Math.round(value)} km/h`;
}

function hourIndex(times, targetHour) {
  let chosenIndex = -1;
  let smallestDifference = Infinity;

  for (let i = 0; i < times.length; i++) {
    const hourText = String(times[i]).slice(11, 13);
    const hour = Number(hourText);
    if (!Number.isFinite(hour)) continue;

    // Los datos de Open-Meteo llegan por horas; escogemos la hora
    // más cercana a cada momento en el que estarás fuera.
    let difference = Math.abs(hour - targetHour);
    if (difference > 12) difference = 24 - difference;

    if (difference < smallestDifference) {
      smallestDifference = difference;
      chosenIndex = i;
    }
  }

  return chosenIndex;
}

function valueAt(array, index) {
  if (!array || index < 0 || index >= array.length) return null;
  return numberOrNull(array[index]);
}

function isRainCode(code) {
  if (code === null) return false;
  return (code >= 51 && code <= 67) ||
         (code >= 80 && code <= 82) ||
         (code >= 95 && code <= 99) ||
         (code >= 71 && code <= 77) ||
         (code >= 85 && code <= 86);
}

function weatherDescription(code) {
  const descriptions = {
    0: "despejado",
    1: "principalmente despejado",
    2: "parcialmente nublado",
    3: "cubierto",
    45: "niebla",
    48: "niebla con escarcha",
    51: "llovizna ligera",
    53: "llovizna moderada",
    55: "llovizna intensa",
    56: "llovizna helada ligera",
    57: "llovizna helada intensa",
    61: "lluvia ligera",
    63: "lluvia moderada",
    65: "lluvia intensa",
    66: "lluvia helada ligera",
    67: "lluvia helada intensa",
    71: "nieve ligera",
    73: "nieve moderada",
    75: "nieve intensa",
    77: "granulos de nieve",
    80: "chubascos ligeros",
    81: "chubascos moderados",
    82: "chubascos fuertes",
    85: "chubascos de nieve ligeros",
    86: "chubascos de nieve fuertes",
    95: "tormenta",
    96: "tormenta con granizo ligero",
    99: "tormenta con granizo fuerte"
  };
  return descriptions[code] || "condiciones variables";
}

function localDateLabel(isoDate) {
  const parts = isoDate.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

async function chooseTransport() {
  const alert = new Alert();
  alert.title = "¿Cómo te desplazas hoy?";
  alert.message = "Lo tendré en cuenta para ajustar la protección frente al viento y la lluvia.";
  alert.addAction("Voy en coche");
  alert.addAction("Voy en autobús");
  alert.addCancelAction("Cancelar");

  const choice = await alert.presentAlert();
  if (choice === 0) return "coche";
  if (choice === 1) return "autobús";
  return null;
}

async function getWeather(latitude, longitude) {
  const hourlyFields = [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_gusts_10m",
    "uv_index"
  ].join(",");

  const dailyFields = [
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "precipitation_probability_max",
    "precipitation_sum",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "uv_index_max"
  ].join(",");

  const url = "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitude.toFixed(3)}` +
    `&longitude=${longitude.toFixed(3)}` +
    `&hourly=${hourlyFields}` +
    `&daily=${dailyFields}` +
    "&timezone=auto" +
    "&forecast_days=1" +
    "&wind_speed_unit=kmh";

  const request = new Request(url);
  request.timeoutInterval = 30;
  const data = await request.loadJSON();

  if (data.error) {
    throw new Error(data.reason || "La API meteorológica ha devuelto un error.");
  }
  if (!data.hourly || !data.daily || !data.hourly.time || !data.daily.time) {
    throw new Error("La respuesta meteorológica está incompleta.");
  }
  return data;
}

function buildReport(weather, transport, placeName) {
  const h = weather.hourly;
  const d = weather.daily;
  const periods = TARGETS.map(target => {
    const index = hourIndex(h.time, target.hour);
    return {
      name: target.name,
      temperature: valueAt(h.temperature_2m, index),
      feels: valueAt(h.apparent_temperature, index),
      humidity: valueAt(h.relative_humidity_2m, index),
      rainProbability: valueAt(h.precipitation_probability, index),
      precipitation: valueAt(h.precipitation, index),
      code: valueAt(h.weather_code, index),
      wind: valueAt(h.wind_speed_10m, index),
      gusts: valueAt(h.wind_gusts_10m, index),
      uv: valueAt(h.uv_index, index)
    };
  });

  const minTemp = valueAt(d.temperature_2m_min, 0);
  const maxTemp = valueAt(d.temperature_2m_max, 0);
  const minFeelsDay = valueAt(d.apparent_temperature_min, 0);
  const maxFeelsDay = valueAt(d.apparent_temperature_max, 0);
  const dailyRainChance = valueAt(d.precipitation_probability_max, 0);
  const dailyRain = valueAt(d.precipitation_sum, 0);
  const dailyWindGusts = valueAt(d.wind_gusts_10m_max, 0);
  const dailyUV = valueAt(d.uv_index_max, 0);

  // Priorizamos las sensaciones termicas de las horas en las que estaras fuera.
  const feelsAtOutings = periods.map(p => p.feels);
  const coldestExposure = minOf(feelsAtOutings) ?? minFeelsDay ?? minTemp;
  const warmestExposure = maxOf(feelsAtOutings) ?? maxFeelsDay ?? maxTemp;
  const exposedGusts = maxOf(periods.map(p => p.gusts)) ?? dailyWindGusts ?? 0;
  const exposedWind = maxOf(periods.map(p => p.wind)) ?? 0;
  const rainChance = maxOf(periods.map(p => p.rainProbability)) ?? dailyRainChance ?? 0;
  const rainAmount = maxOf(periods.map(p => p.precipitation)) ?? 0;
  const humidAtWarmest = maxOf(periods.map(p => p.humidity)) ?? 0;
  const uv = dailyUV ?? maxOf(periods.map(p => p.uv)) ?? 0;
  const rainyWeather = periods.some(p => isRainCode(p.code));
  const rainExpected = rainChance >= 45 || rainAmount >= 0.2 || rainyWeather;

  // Parte superior: capas faciles de quitar si sube la sensacion termica.
  let upper;
  if (coldestExposure <= 2) {
    upper = "Camiseta de manga larga (o termica) + jersey/sudadera gruesa + abrigo de invierno";
  } else if (coldestExposure <= 6) {
    upper = "Camiseta + jersey/sudadera gruesa + abrigo";
  } else if (coldestExposure <= 10) {
    upper = "Camiseta + sudadera o jersey + chaqueta de abrigo";
  } else if (coldestExposure <= 14) {
    upper = "Camiseta + sudadera fina o jersey + chaqueta ligera";
  } else if (coldestExposure <= 18) {
    upper = "Camiseta + chaqueta fina o cortavientos";
  } else if (coldestExposure <= 23) {
    upper = "Camiseta; chaqueta fina opcional para primera hora";
  } else {
    upper = "Camiseta ligera y transpirable; evita sudadera y abrigo";
  }

  // El viento es una variable clave para la recomendacion.
  if (exposedGusts >= 55) {
    upper += ". La capa exterior debe cortar bien el viento";
  } else if (exposedGusts >= 35 && !upper.toLowerCase().includes("cortavientos")) {
    upper += "; mejor una chaqueta cortavientos";
  }

  if (warmestExposure - coldestExposure >= 10) {
    upper += ". Usa capas que puedas quitarte al mediodia";
  }

  if (humidAtWarmest >= 80 && warmestExposure >= 22) {
    upper += ". Prioriza tejidos transpirables por la humedad";
  }

  let lower;
  if (warmestExposure >= 27) {
    lower = "Pantalon muy ligero o bermuda, segun tu comodidad";
  } else if (warmestExposure >= 22) {
    lower = "Pantalon ligero o vaqueros finos";
  } else if (coldestExposure <= 6) {
    lower = "Vaqueros o pantalon largo de tejido mas grueso";
  } else {
    lower = "Vaqueros o pantalon largo";
  }

  let shoes;
  if (rainExpected) {
    shoes = "Zapatillas impermeables o calzado cerrado que no cale";
  } else if (warmestExposure >= 27) {
    shoes = "Zapatillas ligeras y transpirables";
  } else {
    shoes = "Zapatillas cerradas habituales";
  }

  const accessories = [];
  if (rainExpected) {
    accessories.push(exposedGusts >= 45 ? "chubasquero con capucha" : "paraguas y/o chubasquero");
  }
  if (exposedGusts >= 45) accessories.push("capucha o cuello que proteja del viento");
  if (coldestExposure <= 3) accessories.push("guantes opcionales para primera hora");
  if (uv >= 6) accessories.push("gafas de sol");
  if (accessories.length === 0) accessories.push("no necesitas accesorios especiales");

  const notes = [];
  if (exposedGusts >= 60) {
    notes.push(`Rachas muy fuertes (hasta ${Math.round(exposedGusts)} km/h): evita depender del paraguas.`);
  } else if (exposedGusts >= 40) {
    notes.push(`Viento notable: las rachas pueden llegar a ${Math.round(exposedGusts)} km/h; usa una capa que corte el viento.`);
  } else if (exposedGusts >= 25) {
    notes.push(`Algo de viento: una chaqueta que lo frene te resultara mas comoda.`);
  }

  if (rainExpected) {
    notes.push(`Riesgo de lluvia en tus franjas exteriores: hasta ${Math.round(rainChance)}% de probabilidad.`);
  } else if (rainChance >= 25) {
    notes.push(`La lluvia no parece segura, pero hay posibilidad puntual (${Math.round(rainChance)}%).`);
  }

  if (warmestExposure >= 25) {
    notes.push("Por la tarde puede sobrarte ropa: evita capas gruesas y elige tejidos transpirables.");
  } else if (warmestExposure - coldestExposure >= 10) {
    notes.push("Hay bastante diferencia entre la manana y las horas centrales: vistete por capas.");
  }

  if (transport === "autobus") {
    notes.push("Como vas en autobus, estaras mas tiempo esperando o caminando: prioriza la proteccion frente al viento y la lluvia.");
  } else {
    notes.push("Como vas en coche, puedes llevar una capa exterior facil de poner y quitar para los trayectos a pie.");
  }

  if (notes.length === 0) {
    notes.push("Tiempo relativamente estable para tus desplazamientos y el descanso.");
  }

  const dateLabel = localDateLabel(d.time[0]);
  const dayWeatherCode = valueAt(h.weather_code, hourIndex(h.time, 11));
  const dayWeather = weatherDescription(dayWeatherCode);
  const place = placeName || "ubicacion actual";

  const notificationBody = `${upper}.\n${lower}.\n${shoes}.\nAccesorios: ${accessories.join(", ")}.\n${notes.slice(0, 2).join(" ")}\nSensacion en tus salidas: ${formatDegrees(coldestExposure)}–${formatDegrees(warmestExposure)}; rachas de hasta ${formatWind(exposedGusts)}.`;

  return {
    dateLabel,
    place,
    minTemp,
    maxTemp,
    coldestExposure,
    warmestExposure,
    exposedGusts,
    upper,
    lower,
    shoes,
    accessories,
    notes,
    dayWeather,
    notificationBody
  };
}

async function sendNotification(report) {
  const notification = new Notification();
  notification.title = `Ropa de hoy · ${report.minTemp === null ? "—" : Math.round(report.minTemp)}° / ${report.maxTemp === null ? "—" : Math.round(report.maxTemp)}°`;
  notification.subtitle = `${report.dateLabel} · ${report.place} · ${report.dayWeather} · Open-Meteo`;
  notification.body = report.notificationBody;
  notification.sound = "default";
  notification.threadIdentifier = "ropa-diaria";
  notification.setTriggerDate(new Date(Date.now() + 1500));
  await notification.schedule();
}

async function showError(message) {
  const alert = new Alert();
  alert.title = `${APP_NAME}: no se pudo generar la recomendacion`;
  alert.message = message;
  alert.addAction("Aceptar");
  await alert.presentAlert();
}

// ---------- Ejecucion principal ----------
try {
  const transport = await chooseTransport();
  if (!transport) {
    const cancelAlert = new Alert();
    cancelAlert.title = "Recomendacion cancelada";
    cancelAlert.message = "No he generado el outfit porque no has seleccionado el transporte.";
    cancelAlert.addAction("Aceptar");
    await cancelAlert.presentAlert();
  } else {
    // La API meteorologica trabaja con coordenadas; no fijamos una ciudad.
    Location.setAccuracyToHundredMeters();
    const currentLocation = await Location.current();

    // Redondeamos las coordenadas a 3 decimales antes de enviarlas a la API.
    // Para una recomendacion de ropa es suficiente y evita enviar mas precision
    // de la necesaria.
    const weather = await getWeather(currentLocation.latitude, currentLocation.longitude);
    const report = buildReport(weather, transport, "ubicacion GPS");

    await sendNotification(report);

  }
} catch (error) {
  await showError(error && error.message ? error.message : String(error));
}

Script.complete();
