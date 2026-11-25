// ROPA DIARIA V5.3.0 · base V5.2 - motor de outfits y compatibilidad reforzados
// Recibe coordenadas como texto "latitud|longitud" desde Atajos.
// Conserva la compatibilidad con los datos locales de V2 y V3.

const APP_NAME = "Ropa diaria";
const PROFILE_FILE = "ropa_diaria_profile.json";
const HISTORY_FILE = "ropa_diaria_history.json";
const CONFIG_FILE = "ropa_diaria_config.json";
const VIEW_SCRIPT = "Ver outfit hoy";
const RATING_SCRIPT = "Valorar outfit";
const HISTORY_LIMIT = 365;
const WARDROBE_FILE = "ropa_diaria_wardrobe.json";
const TRANSACTION_FILE = "ropa_diaria_transaction.json";
const WEATHER_CACHE_FILE = "ropa_diaria_weather_cache.json";
const WEATHER_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 60 minutos como maximo para respaldo meteorologico.
const WEATHER_RETRY_ATTEMPTS = 3;

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
const wardrobePath = fm.joinPath(root, WARDROBE_FILE);
const weatherCachePath = fm.joinPath(root, WEATHER_CACHE_FILE);

function jsonBackupPath(path) { return `${path}.bak`; }
function jsonTempPath(path) { return `${path}.tmp`; }

function replaceFileFromTemp(tempPath, destinationPath, validateContent = null) {
  if (!fm.fileExists(tempPath)) throw new Error("No existe el archivo temporal que se quiere guardar.");
  const rollbackPath = `${destinationPath}.rollback.${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  let movedOriginal = false;

  // Scriptable FileManager.move no sustituye un destino existente: primero
  // apartamos el archivo actual con un nombre unico y conservamos el .bak.
  if (fm.fileExists(destinationPath)) {
    try {
      fm.move(destinationPath, rollbackPath);
      movedOriginal = true;
    } catch (error) {
      if (fm.fileExists(tempPath)) {
        try { fm.remove(tempPath); } catch (_) {}
      }
      throw new Error(`No se pudo apartar el archivo anterior; no se ha sustituido. ${error.message || error}`);
    }
  }

  try {
    fm.move(tempPath, destinationPath);
    if (!fm.fileExists(destinationPath)) throw new Error("El archivo no aparece despues del movimiento.");
    const savedContent = fm.readString(destinationPath);
    if (validateContent) validateContent(savedContent);
  } catch (error) {
    try {
      if (fm.fileExists(destinationPath)) fm.remove(destinationPath);
    } catch (removeError) {
      console.error("No se pudo retirar el archivo temporal fallido:", removeError);
    }

    if (movedOriginal && fm.fileExists(rollbackPath)) {
      try {
        fm.move(rollbackPath, destinationPath);
      } catch (restoreError) {
        throw new Error(`Fallo el reemplazo y tambien la restauracion. El archivo anterior se conserva en ${rollbackPath}. Error original: ${error.message || error}. Restauracion: ${restoreError.message || restoreError}`);
      }
    }
    throw error;
  }

  // Si la limpieza falla, el archivo actualizado ya esta validado y el
  // rollback sobrante se deja intacto para inspeccion manual.
  if (movedOriginal && fm.fileExists(rollbackPath)) {
    try { fm.remove(rollbackPath); }
    catch (cleanupError) { console.warn(`Se conserva un archivo rollback en ${rollbackPath}: ${cleanupError.message || cleanupError}`); }
  }
}

function withDataLock(callback) {
  const lockPath = fm.joinPath(root, "ropa_diaria_storage.lock");
  const token = `lock_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  if (fm.fileExists(lockPath)) {
    let stale = false;
    try {
      const current = JSON.parse(fm.readString(lockPath));
      const createdAt = Number(current.createdAt || 0);
      stale = !createdAt || (Date.now() - createdAt) > 120000;
    } catch (_) {
      stale = true;
    }
    if (!stale) throw new Error("Ropa diaria esta guardando datos en otra operacion. Vuelve a intentarlo en unos segundos.");
    fm.remove(lockPath);
  }
  fm.writeString(lockPath, JSON.stringify({token, createdAt: Date.now()}));
  const confirmed = JSON.parse(fm.readString(lockPath));
  if (!confirmed || confirmed.token !== token) throw new Error("No se pudo adquirir el bloqueo de almacenamiento. No se han modificado los datos.");
  try {
    return callback();
  } finally {
    if (fm.fileExists(lockPath)) {
      try {
        const current = JSON.parse(fm.readString(lockPath));
        if (current && current.token === token) fm.remove(lockPath);
      } catch (_) {
        // El bloqueo se deja para que se considere obsoleto tras el periodo de seguridad.
      }
    }
  }
}

function restoreJSONFile(path, raw) {
  const tempPath = jsonTempPath(path) + ".restore";
  JSON.parse(raw);
  fm.writeString(tempPath, raw);
  JSON.parse(fm.readString(tempPath));
  replaceFileFromTemp(tempPath, path, content => JSON.parse(content));
  JSON.parse(fm.readString(path));
}

function readJSON(path, fallback, validator = null) {
  const backupPath = jsonBackupPath(path);
  const parseValidated = raw => {
    const value = JSON.parse(raw);
    if (validator && !validator(value)) throw new Error("El contenido no cumple la estructura esperada.");
    return value;
  };
  if (fm.fileExists(path)) {
    try {
      return parseValidated(fm.readString(path));
    } catch (primaryError) {
      if (!fm.fileExists(backupPath)) {
        throw new Error(`El archivo ${path.split("/").pop()} esta danado y no existe una copia de seguridad. No se ha sobrescrito ningun dato. Detalle: ${primaryError.message || primaryError}`);
      }
      try {
        const backupRaw = fm.readString(backupPath);
        const recovered = parseValidated(backupRaw);
        restoreJSONFile(path, backupRaw);
        console.warn(`Se ha recuperado ${path.split("/").pop()} desde su copia de seguridad.`);
        return recovered;
      } catch (backupError) {
        throw new Error(`El archivo ${path.split("/").pop()} y su copia de seguridad estan danados. No se ha sobrescrito ningun dato. Principal: ${primaryError.message || primaryError}. Copia: ${backupError.message || backupError}`);
      }
    }
  }

  if (fm.fileExists(backupPath)) {
    try {
      const backupRaw = fm.readString(backupPath);
      const recovered = parseValidated(backupRaw);
      restoreJSONFile(path, backupRaw);
      console.warn(`Se ha restaurado ${path.split("/").pop()} desde su copia de seguridad porque faltaba el archivo principal.`);
      return recovered;
    } catch (error) {
      throw new Error(`Falta ${path.split("/").pop()} y su copia de seguridad no se puede recuperar: ${error.message || error}`);
    }
  }

  return fallback;
}

function writeJSON(path, value) {
  const serialized = JSON.stringify(value, null, 2);
  if (typeof serialized !== "string") throw new Error(`No se pudo serializar ${path.split("/").pop()}.`);
  JSON.parse(serialized);

  const backupPath = jsonBackupPath(path);
  const tempPath = jsonTempPath(path);
  if (fm.fileExists(tempPath)) fm.remove(tempPath);
  fm.writeString(tempPath, serialized);
  JSON.parse(fm.readString(tempPath));

  if (fm.fileExists(path)) {
    const currentRaw = fm.readString(path);
    let currentIsValid = true;
    try { JSON.parse(currentRaw); } catch (_) { currentIsValid = false; }
    if (currentIsValid) {
      // Si no se puede actualizar la copia, se aborta antes de tocar el archivo actual.
      fm.writeString(backupPath, currentRaw);
      JSON.parse(fm.readString(backupPath));
    } else {
      if (!fm.fileExists(backupPath)) {
        if (fm.fileExists(tempPath)) fm.remove(tempPath);
        throw new Error(`No se actualizo ${path.split("/").pop()}: el archivo actual esta danado y no hay una copia valida.`);
      }
      JSON.parse(fm.readString(backupPath));
    }
  }

  try {
    replaceFileFromTemp(tempPath, path, content => JSON.parse(content));
    JSON.parse(fm.readString(path));
  } catch (error) {
    if (fm.fileExists(tempPath)) fm.remove(tempPath);
    if (!fm.fileExists(path) && fm.fileExists(backupPath)) {
      try { fm.writeString(path, fm.readString(backupPath)); } catch (restoreError) { console.error(restoreError); }
    }
    throw new Error(`No se pudo guardar ${path.split("/").pop()}. Se ha conservado la copia de seguridad. Detalle: ${error.message || error}`);
  }
}

function recoverDataTransaction() {
  const transactionPath = fm.joinPath(root, "ropa_diaria_transaction.json");
  if (!fm.fileExists(transactionPath)) return false;
  return withDataLock(() => {
  if (!fm.fileExists(transactionPath)) return false;
  const transaction = readJSON(transactionPath, null, value => value && value.version === 1 && value.profile && typeof value.profile === "object" && !Array.isArray(value.profile) && Array.isArray(value.history) && value.history.every(item => item && typeof item === "object" && !Array.isArray(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ""))));
  if (!transaction || transaction.version !== 1 || !transaction.profile || typeof transaction.profile !== "object" || !Array.isArray(transaction.history)) {
    throw new Error("Hay una operacion de valoracion pendiente, pero su archivo de recuperacion no es valido. No se han modificado los datos.");
  }
  if (transaction.state !== "committed") {
    writeJSON(profilePath, transaction.profile);
    writeJSON(historyPath, transaction.history);
    transaction.state = "committed";
    writeJSON(transactionPath, transaction);
    console.warn("Se ha completado una valoracion que habia quedado interrumpida.");
  }
  // Si falla la limpieza, el estado committed evita reproducir una transaccion antigua.
  [transactionPath, jsonBackupPath(transactionPath), jsonTempPath(transactionPath)].forEach(path => { if (fm.fileExists(path)) fm.remove(path); });
  return true;
  });
}

function defaultProfile() {
  return { thermalBias: 0, windBias: 0, rainSensitivity: 0, ratingsCount: 0, favoriteItemIds: [], dislikedItemIds: [], lastUpdated: null };
}

function clampFiniteNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cleanIdList(value, limit = 500) {
  if (!Array.isArray(value)) return [];
  const cleaned = value.map(item => String(item || "").trim()).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, limit);
}

function loadProfile() {
  const saved = readJSON(profilePath, {}, value => value && typeof value === "object" && !Array.isArray(value)) || {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("El perfil personal no tiene un formato valido. No se ha modificado.");
  const profile = { ...defaultProfile(), ...saved };
  // Acota valores importados o antiguos para que no desplacen excesivamente el algoritmo.
  profile.thermalBias = clampFiniteNumber(profile.thermalBias, 0, -5, 5);
  profile.windBias = clampFiniteNumber(profile.windBias, 0, 3, 3);
  profile.rainSensitivity = clampFiniteNumber(profile.rainSensitivity, 0, 3, 3);
  profile.ratingsCount = Math.round(clampFiniteNumber(profile.ratingsCount, 0, 0, 100000));
  profile.favoriteItemIds = cleanIdList(profile.favoriteItemIds);
  profile.dislikedItemIds = cleanIdList(profile.dislikedItemIds).filter(id => !profile.favoriteItemIds.includes(id));
  return profile;
}

function loadConfig() {
  const saved = readJSON(configPath, {}, value => value && typeof value === "object" && !Array.isArray(value)) || {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("La configuracion no tiene un formato valido. No se ha modificado.");
  const transport = ["coche", "autobus", "andando"].includes(saved.transport) ? saved.transport : "coche";
  const allowedPreferences = ["friolero", "normal", "caluroso"];
  const thermalPreference = allowedPreferences.includes(saved.thermalPreference)
    ? saved.thermalPreference
    : "normal";
  const styleOptions = ["casual", "urbano", "deportivo", "minimalista", "elegante", "mixto"];
  const stylePreference = styleOptions.includes(saved.stylePreference) ? saved.stylePreference : "mixto";
  const ratingTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(saved.ratingTime || "") ? saved.ratingTime : "20:30";
  const regionCode = String(saved.aemetRegionCode || "62");
  const regionName = String(saved.aemetRegionName || "Aragon");
  return { transport, thermalPreference, stylePreference, ratingTime, aemetRegionCode: regionCode, aemetRegionName: regionName };
}

function loadHistory() {
  const value = readJSON(historyPath, [], data => Array.isArray(data) && data.every(item => item && typeof item === "object" && !Array.isArray(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ""))));
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || Array.isArray(item) || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))) {
    throw new Error("El historial contiene registros con un formato no valido. No se ha sobrescrito.");
  }
  return value;
}

function isValidWardrobeList(list) {
  if (!Array.isArray(list)) return false;
  if (list.some(item => !item || typeof item !== "object" || Array.isArray(item) || !item.id || !item.category)) return false;
  const ids = list.map(item => String(item.id));
  return new Set(ids).size === ids.length;
}

function loadWardrobe() {
  const parseWardrobe = raw => {
    const value = JSON.parse(raw);
    const items = Array.isArray(value) ? value : (value && Array.isArray(value.items) ? value.items : null);
    if (!isValidWardrobeList(items)) {
      throw new Error("El catalogo contiene prendas invalidas o identificadores duplicados.");
    }
    return items;
  };
  const backupPaths = [
    fm.joinPath(root, "ropa_diaria_wardrobe.backup.json"),
    jsonBackupPath(wardrobePath)
  ];
  let primaryError = null;

  if (fm.fileExists(wardrobePath)) {
    try {
      return parseWardrobe(fm.readString(wardrobePath));
    } catch (error) {
      primaryError = error;
    }
  }

  for (const backupPath of backupPaths) {
    if (!fm.fileExists(backupPath)) continue;
    try {
      const backupRaw = fm.readString(backupPath);
      const items = parseWardrobe(backupRaw);
      restoreJSONFile(wardrobePath, backupRaw);
      console.warn(`Se ha recuperado el armario desde ${backupPath.split("/").pop()}.`);
      return items;
    } catch (backupError) {
      console.warn(`No se pudo recuperar ${backupPath.split("/").pop()}: ${backupError.message || backupError}`);
    }
  }

  if (primaryError) {
    throw new Error(`El armario principal esta danado y no se encontro una copia valida. No se ha creado un catalogo vacio ni se han sobrescrito datos. Detalle: ${primaryError.message || primaryError}`);
  }
  return [];
}

function normalizeWardrobeCategory(value) {
  const raw = String(value || "").toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ -]+/g, "_");
  const aliases = {
    camiseta_termica: "termica",
    sweater: "jersey", sueter: "jersey", forro_polar: "forro_polar",
    pantalon_largo: "pantalon", jeans: "vaqueros", jean: "vaqueros",
    shorts: "bermudas", short: "bermudas", zapatilla: "zapatillas",
    bota: "botas", impermeable: "chubasquero", raincoat: "chubasquero",
    windbreaker: "cortavientos"
  };
  if (aliases[raw]) return aliases[raw];
  const valid = ["camiseta", "camisa", "polo", "termica", "sudadera", "jersey", "forro_polar", "chaqueta", "abrigo", "cortavientos", "chubasquero", "pantalon", "vaqueros", "bermudas", "zapatillas", "zapatos", "botas", "falda", "vestido", "accesorio", "otro"];
  if (valid.includes(raw)) return raw;
  if (/camiseta|t_shirt|tee/.test(raw)) return "camiseta";
  if (/camisa|shirt/.test(raw)) return "camisa";
  if (/polo/.test(raw)) return "polo";
  if (/termica|thermal/.test(raw)) return "termica";
  if (/sudadera|hoodie|sweatshirt/.test(raw)) return "sudadera";
  if (/jersey|sueter|sweater/.test(raw)) return "jersey";
  if (/polar|fleece/.test(raw)) return "forro_polar";
  if (/chaqueta|jacket/.test(raw)) return "chaqueta";
  if (/abrigo|coat/.test(raw)) return "abrigo";
  if (/cortavientos|windbreaker/.test(raw)) return "cortavientos";
  if (/chubasquero|impermeable|raincoat/.test(raw)) return "chubasquero";
  if (/vaquero|jean/.test(raw)) return "vaqueros";
  if (/pantalon|trouser|pant/.test(raw)) return "pantalon";
  if (/bermuda|short/.test(raw)) return "bermudas";
  if (/zapatilla|sneaker/.test(raw)) return "zapatillas";
  if (/bota|boot/.test(raw)) return "botas";
  if (/zapato|shoe/.test(raw)) return "zapatos";
  return "otro";
}

function normalizeStyleTag(value) {
  const raw = String(value || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const aliases = { streetwear: "urbano", urban: "urbano", sport: "deportivo", sporty: "deportivo", smart: "elegante", formal: "elegante", minimalist: "minimalista" };
  const tag = aliases[raw] || raw;
  return ["casual", "urbano", "deportivo", "minimalista", "elegante"].includes(tag) ? tag : "";
}

function recentUsageCount(itemId, history, currentDate) {
  const current = new Date(`${currentDate}T12:00:00`);
  if (!Number.isFinite(current.getTime())) return 0;
  const cutoff = new Date(current);
  cutoff.setDate(cutoff.getDate() - 7);
  return (Array.isArray(history) ? history : []).filter(day => {
    if (!day || day.date >= currentDate || !Array.isArray(day.wardrobeSelection)) return false;
    const usedAt = new Date(`${day.date}T12:00:00`);
    return Number.isFinite(usedAt.getTime()) && usedAt >= cutoff &&
      day.wardrobeSelection.some(piece => piece && String(piece.id) === String(itemId));
  }).length;
}

function isWardrobeItemSuitable(item, slot, categories, report) {
  if (!item || item.available === false) return false;
  const category = normalizeWardrobeCategory(item.category);
  if (!categories.includes(category)) return false;
  const rainExpected = report.rainExpected === true;
  if ((slot === "outer" || slot === "shoes") && rainExpected && item.waterproof !== true) return false;

  const cold = clampFiniteNumber(report.feelsMin, 10, -40, 60);
  const warm = clampFiniteNumber(report.feelsMax, 18, -40, 60);
  // Evita recomendar bermudas si la mañana es fresca o existe riesgo de lluvia.
  if (slot === "lower" && category === "bermudas" && (rainExpected || cold < 15 || warm < 23)) return false;
  // Una prenda termica como capa base deja de ser adecuada con calor elevado.
  if (slot === "base" && category === "termica" && warm >= 24) return false;
  return true;
}

function wardrobeSelectionSignature(selection) {
  return (Array.isArray(selection) ? selection : [])
    .filter(item => item && item.slot && item.id)
    .map(item => `${String(item.slot)}:${encodeURIComponent(String(item.id))}`)
    .sort()
    .join("|");
}

function selectWardrobeItem(items, categories, desiredWarmth, report, slot, history, options = {}) {
  const excludedIds = Array.isArray(options.excludedIds) ? options.excludedIds.map(String) : [];
  const candidates = items.filter(item =>
    isWardrobeItemSuitable(item, slot, categories, report) && !excludedIds.includes(String(item.id))
  );
  if (!candidates.length) return null;

  const profile = report.profileSnapshot || {};
  const stylePreference = ["casual", "urbano", "deportivo", "minimalista", "elegante"].includes(report.stylePreference)
    ? report.stylePreference : "mixto";
  const favoriteIds = Array.isArray(profile.favoriteItemIds) ? profile.favoriteItemIds.map(String) : [];
  const dislikedIds = Array.isArray(profile.dislikedItemIds) ? profile.dislikedItemIds.map(String) : [];
  const gusts = clampFiniteNumber(report.gusts, 0, 0, 200);
  const ranked = candidates.map(item => {
    const warmth = clampFiniteNumber(item.warmthLevel, 2, 1, 3);
    let score = -Math.abs(warmth - desiredWarmth) * 2.8;
    const tags = Array.isArray(item.styleTags) ? item.styleTags.map(normalizeStyleTag).filter(Boolean) : [];
    if (stylePreference !== "mixto" && tags.includes(stylePreference)) score += 2.5;
    else if (stylePreference !== "mixto" && tags.length) score -= 1;

    const usage = recentUsageCount(item.id, history, report.date);
    score -= Math.min(usage, 4) * 0.85;
    if (favoriteIds.includes(String(item.id))) score += 2;
    if (dislikedIds.includes(String(item.id))) score -= 5;

    if (slot === "outer" && gusts >= 28) score += item.windproof === true ? 3.5 : -1.25;
    if (slot === "outer" && report.transport === "andando" && item.windproof === true) score += 1.5;
    if (slot === "outer" && report.rainExpected && item.waterproof === true) score += 3;

    const name = String(item.name || "").trim();
    if (!name) score -= 3;
    return { item, score };
  });
  ranked.sort((a, b) => b.score - a.score || String(a.item.id).localeCompare(String(b.item.id)));

  // La alternativa solo rota entre prendas casi igual de adecuadas, no sacrifica clima por variedad.
  const bestScore = ranked[0].score;
  const nearBest = ranked.filter(entry => entry.score >= bestScore - 1.25);
  const rotation = Math.max(0, Math.floor(clampFiniteNumber(options.rotationOffset, 0, 0, 1000)));
  return nearBest[rotation % nearBest.length].item;
}

function applyWardrobe(report, options = {}) {
  if (!report || !report.outfit || typeof report.outfit !== "object") throw new Error("No se puede seleccionar ropa: el informe meteorologico no contiene un outfit valido.");
  const items = loadWardrobe();
  const available = items.filter(item => item.available !== false);
  if (!available.length) {
    report.wardrobeEnabled = false;
    report.wardrobeSelection = [];
    report.wardrobeMissingSlots = [];
    report.wardrobeSelectionSignature = "";
    return report;
  }

  const history = loadHistory();
  const cold = clampFiniteNumber(report.feelsMin, 10, -40, 60);
  const warm = clampFiniteNumber(report.feelsMax, 18, -40, 60);
  const original = { ...report.outfit };
  const previousBySlot = {};
  (Array.isArray(options.previousSelection) ? options.previousSelection : []).forEach(item => {
    if (item && item.slot && item.id) previousBySlot[item.slot] = item;
  });
  const selection = [];
  const missing = [];
  const specs = [
    { slot: "base", field: "base", categories: ["camiseta", "camisa", "polo", "termica"], warmth: cold <= 5 ? 3 : cold <= 15 ? 2 : 1, required: true },
    { slot: "mid", field: "mid", categories: ["sudadera", "jersey", "forro_polar"], warmth: cold <= 4 ? 3 : cold <= 12 ? 2 : 1, required: !/sin capa intermedia|sin capa|opcional/i.test(original.mid || "") || cold <= 14 },
    { slot: "outer", field: "outer", categories: ["chaqueta", "abrigo", "cortavientos", "chubasquero"], warmth: report.rainExpected || cold <= 4 ? 3 : cold <= 12 ? 2 : 1, required: report.rainExpected || (!/sin chaqueta|sin abrigo|sin capa exterior|no hace falta/i.test(original.outer || "") && cold <= 22) },
    { slot: "lower", field: "lower", categories: ["pantalon", "vaqueros", "bermudas"], warmth: cold <= 3 ? 3 : warm >= 22 ? 1 : 2, required: true },
    { slot: "shoes", field: "shoes", categories: ["zapatillas", "zapatos", "botas"], warmth: report.rainExpected ? 3 : warm >= 24 ? 1 : 2, required: true }
  ];

  for (const spec of specs) {
    if (!spec.required) continue;
    const chosen = selectWardrobeItem(available, spec.categories, spec.warmth, report, spec.slot, history, options);
    let finalChoice = chosen;
    // En una alternativa solo se conserva la prenda anterior si sigue siendo adecuada para el tiempo.
    if (!finalChoice && options.previousSelection) {
      const old = previousBySlot[spec.slot];
      const stored = old ? available.find(item => String(item.id) === String(old.id)) : null;
      if (stored && isWardrobeItemSuitable(stored, spec.slot, spec.categories, report)) finalChoice = stored;
    }
    if (!finalChoice) { missing.push(spec.slot); continue; }

    const chosenName = String(finalChoice.name || `Prenda ${finalChoice.id}`).trim();
    report.outfit[spec.field] = chosenName;
    selection.push({
      id: finalChoice.id, slot: spec.slot, name: chosenName, category: normalizeWardrobeCategory(finalChoice.category),
      color: String(finalChoice.color || "").slice(0, 50), warmthLevel: clampFiniteNumber(finalChoice.warmthLevel, 2, 1, 3),
      waterproof: finalChoice.waterproof === true, windproof: finalChoice.windproof === true,
      imageFile: String(finalChoice.imageFile || ""), imageMimeType: finalChoice.imageMimeType || "image/jpeg",
      styleTags: Array.isArray(finalChoice.styleTags) ? finalChoice.styleTags.map(normalizeStyleTag).filter(Boolean).slice(0, 5) : []
    });
  }

  report.wardrobeEnabled = true;
  report.wardrobeSelection = selection;
  report.wardrobeMissingSlots = missing;
  report.wardrobeCount = available.length;
  report.stylePreference = report.stylePreference || "mixto";
  report.wardrobeSelectionSignature = wardrobeSelectionSignature(selection);
  report.notes = (report.notes || []).filter(note => !String(note).startsWith("Se han elegido ") && !String(note).startsWith("No hay una prenda registrada adecuada") && !String(note).startsWith("ATENCION: No hay una prenda impermeable"));
  if (selection.length) report.notes.push(`Se han elegido ${selection.length} prendas de tu armario.`);
  if (missing.length) {
    const labels = { base: "parte superior", mid: "capa intermedia", outer: "capa exterior", lower: "pantalon", shoes: "calzado" };
    report.notes.push(`No hay una prenda registrada adecuada para: ${missing.map(slot => labels[slot]).join(", ")}. Se mantiene la recomendacion meteorologica general para esos elementos.`);
  }
  if (report.rainExpected && (missing.includes("outer") || missing.includes("shoes"))) {
    report.notes.push("ATENCION: No hay una prenda impermeable registrada para completar todo el conjunto. La recomendacion generica no garantiza que tu ropa actual sea impermeable.");
  }
  if (gustsWarningNeeded(report, selection)) {
    report.notes.push("El viento puede ser intenso y no consta una prenda cortavientos adecuada en la seleccion. Comprueba la proteccion antes de salir.");
  }
  return report;
}

function gustsWarningNeeded(report, selection) {
  const gusts = clampFiniteNumber(report.gusts, 0, 0, 200);
  if (gusts < 45 || !Array.isArray(selection)) return false;
  const outer = selection.find(item => item.slot === "outer");
  return !outer || outer.windproof !== true;
}

function findUnusedAlternative(current) {
  const previousSelection = Array.isArray(current.wardrobeSelection) ? current.wardrobeSelection : [];
  const previousIds = previousSelection.map(item => String(item.id));
  const currentSignature = current.wardrobeSelectionSignature || wardrobeSelectionSignature(previousSelection);
  const seen = Array.isArray(current.wardrobeVariantSignatures) && current.wardrobeVariantSignatures.length
    ? current.wardrobeVariantSignatures
    : [currentSignature].filter(Boolean);

  // Prueba hasta 32 rotaciones entre prendas con una puntuacion similar.
  for (let rotationOffset = 0; rotationOffset < 32; rotationOffset++) {
    const candidate = JSON.parse(JSON.stringify(current));
    candidate.notes = (candidate.notes || []).filter(note =>
      !String(note).startsWith("Se han elegido ") &&
      !String(note).startsWith("No hay una prenda registrada adecuada") &&
      !String(note).startsWith("ATENCION: No hay una prenda impermeable") &&
      !String(note).startsWith("El viento puede ser intenso")
    );
    applyWardrobe(candidate, { excludedIds: previousIds, previousSelection, rotationOffset });
    const signature = candidate.wardrobeSelectionSignature || wardrobeSelectionSignature(candidate.wardrobeSelection || []);
    const beforeBySlot = new Map(previousSelection.map(item => [item.slot, String(item.id)]));
    const changedSlots = (candidate.wardrobeSelection || []).filter(item => beforeBySlot.get(item.slot) !== String(item.id)).length;
    if (changedSlots > 0 && signature && !seen.includes(signature) && signature !== currentSignature) {
      return { candidate, signature, changed: changedSlots, seen };
    }
  }
  return null;
}

async function showInfo(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("Aceptar");
  await alert.presentAlert();
}

function parseAemetFeed(xml) {
  const items = [];
  let current = null;
  let field = "";
  const parser = new XMLParser(xml);
  parser.didStartElement = (name, namespaceURI, qualifiedName, attributes) => {
    const tag = String(name).split(":").pop().toLowerCase();
    if (tag === "item" || tag === "entry") current = {};
    else if (current && tag === "link" && attributes) {
      const href = attributes.href || attributes.HREF || attributes["href"];
      if (href) current.link = String(href);
    } else if (current && ["title", "description", "link", "pubdate", "updated"].includes(tag)) field = tag;
  };
  parser.foundCharacters = value => {
    if (current && field) current[field] = (current[field] || "") + String(value);
  };
  parser.didEndElement = name => {
    const tag = String(name).split(":").pop().toLowerCase();
    if (current && ["title", "description", "link", "pubdate", "updated"].includes(tag)) field = "";
    if (tag === "item" || tag === "entry") {
      if (current) items.push(current);
      current = null;
      field = "";
    }
  };
  if (!parser.parse() || !/<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(String(xml || ""))) throw new Error("No se pudo interpretar una respuesta RSS/Atom valida de AEMET.");
  return items.map(item => ({
    title: String(item.title || "").replace(/<[^>]+>/g, " ").trim(),
    description: String(item.description || "").replace(/<[^>]+>/g, " ").trim(),
    url: String(item.link || "").trim(),
    issuedAt: String(item.pubdate || item.updated || "")
  })).filter(item => /^https?:\/\//i.test(item.url));
}

function capReferenceIds(value) {
  return String(value || "").trim().split(/\s+/).map(part => {
    const fields = part.split(",");
    return fields.length >= 2 ? fields[1].trim() : "";
  }).filter(Boolean);
}

function parseAemetCap(xml, feedItem) {
  const messages = [];
  let alertMessage = null;
  let info = null;
  let parameter = null;
  let area = null;
  let target = "";
  let field = "";
  const infoFields = ["language", "event", "headline", "description", "instruction", "expires", "onset", "severity", "urgency", "certainty", "web"];
  const rootFields = ["status", "msgtype", "scope", "sent", "identifier", "references"];
  const parser = new XMLParser(xml);

  parser.didStartElement = name => {
    const tag = String(name).split(":").pop().toLowerCase();
    if (tag === "alert") alertMessage = { infos: [], status: "", msgtype: "", identifier: "", references: "" };
    else if (alertMessage && tag === "info") info = { parameters: {}, areas: [] };
    else if (info && tag === "parameter") parameter = { name: "", value: "" };
    else if (info && tag === "area") area = { description: "" };
    else if (parameter && (tag === "valuename" || tag === "value")) { target = "parameter"; field = tag; }
    else if (area && tag === "areadesc") { target = "area"; field = tag; }
    else if (info && infoFields.includes(tag)) { target = "info"; field = tag; }
    else if (alertMessage && !info && rootFields.includes(tag)) { target = "alert"; field = tag; }
  };

  parser.foundCharacters = value => {
    const chunk = String(value);
    if (!field || !target) return;
    if (target === "parameter" && parameter) {
      if (field === "valuename") parameter.name += chunk;
      else if (field === "value") parameter.value += chunk;
    } else if (target === "area" && area) {
      area.description += chunk;
    } else if (target === "info" && info) {
      info[field] = (info[field] || "") + chunk;
    } else if (target === "alert" && alertMessage) {
      alertMessage[field] = (alertMessage[field] || "") + chunk;
    }
  };

  parser.didEndElement = name => {
    const tag = String(name).split(":").pop().toLowerCase();
    if (field === tag) { field = ""; target = ""; }
    if (tag === "parameter" && parameter && info) {
      if (parameter.name) info.parameters[parameter.name.trim()] = parameter.value.trim();
      parameter = null;
    } else if (tag === "area" && area && info) {
      if (area.description.trim()) info.areas.push(area.description.trim());
      area = null;
    } else if (tag === "info" && info && alertMessage) {
      alertMessage.infos.push(info);
      info = null;
    } else if (tag === "alert" && alertMessage) {
      messages.push(alertMessage);
      alertMessage = null;
      info = null;
      parameter = null;
      area = null;
      field = "";
      target = "";
    }
  };

  if (!parser.parse()) throw new Error("No se pudo interpretar el mensaje CAP de AEMET.");
  const normalized = value => String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  const now = Date.now();
  const result = { alerts: [], suppressedIdentifiers: [], invalidMessages: 0 };

  for (const message of messages) {
    const status = normalized(message.status);
    const messageType = normalized(message.msgtype);
    const references = capReferenceIds(message.references);
    if (messageType === "cancel" || messageType === "update") result.suppressedIdentifiers.push(...references);
    if (status !== "actual" || messageType === "cancel") continue;
    if (messageType && !["alert", "update", "ack", "test", "exercise"].includes(messageType)) continue;

    const selectedInfo = message.infos.find(item => normalized(item.language).startsWith("es")) || message.infos[0] || {};
    const parameters = selectedInfo.parameters || {};
    const levelParam = Object.entries(parameters).find(([key]) => normalized(key).includes("meteoalerta nivel"));
    const rawLevel = normalized(levelParam ? levelParam[1] : "");
    const text = normalized(`${selectedInfo.event || ""} ${selectedInfo.headline || ""} ${selectedInfo.description || ""}`);
    const level = ["rojo", "naranja", "amarillo"].find(value => rawLevel.includes(value)) ||
      (/nivel\s+rojo/.test(text) ? "rojo" : /nivel\s+naranja/.test(text) ? "naranja" : /nivel\s+amarillo/.test(text) ? "amarillo" : "");
    const expires = String(selectedInfo.expires || "").trim();
    const expiresMs = expires ? Date.parse(expires) : NaN;
    const onset = String(selectedInfo.onset || "").trim();
    const onsetMs = onset ? Date.parse(onset) : NaN;

    // CAP debe contener caducidad interpretable. Sin ella no afirmamos que el aviso siga vigente.
    if (!level || !Number.isFinite(expiresMs)) {
      result.invalidMessages += 1;
      continue;
    }
    if (expiresMs <= now || (Number.isFinite(onsetMs) && onsetMs > now + 72 * 60 * 60 * 1000)) continue;

    const rawURL = String(selectedInfo.web || feedItem.url || "").trim();
    const safeURL = /^https:\/\//i.test(rawURL) ? rawURL : "https://www.aemet.es/es/eltiempo/prediccion/avisos";
    result.alerts.push({
      id: String(message.identifier || ""),
      level,
      title: String(selectedInfo.headline || selectedInfo.event || feedItem.title || "Aviso AEMET").trim(),
      description: String(selectedInfo.description || selectedInfo.instruction || feedItem.description || "").trim(),
      area: (selectedInfo.areas || []).filter(Boolean).join(", "),
      url: safeURL,
      onset: Number.isFinite(onsetMs) ? onset : "",
      expires,
      issuedAt: String(message.sent || feedItem.issuedAt || "")
    });
  }
  return result;
}

function responseHeader(headers, name) {
  if (!headers) return "";
  const target = String(name).toLowerCase();
  const key = Object.keys(headers).find(value => String(value).toLowerCase() === target);
  return key ? String(headers[key]) : "";
}

function retryAfterMilliseconds(headers) {
  const value = responseHeader(headers, "retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function waitMilliseconds(milliseconds) {
  // Scriptable Timer.schedule recibe el intervalo en milisegundos.
  return new Promise(resolve => Timer.schedule(Math.max(0, milliseconds), false, resolve));
}

function httpRequestError(label, status, rawBody) {
  let detail = "";
  try {
    const parsed = JSON.parse(rawBody || "{}");
    detail = String(parsed.reason || (parsed.error && (parsed.error.message || parsed.error)) || "");
  } catch (_) {
    detail = String(rawBody || "").replace(/\s+/g, " ").slice(0, 180);
  }
  let explanation;
  if (status === 401 || status === 403) explanation = `${label}: el servidor ha rechazado el acceso (HTTP ${status}).`;
  else if (status === 404) explanation = `${label}: no se encuentra el recurso solicitado (HTTP 404).`;
  else if (status === 429) explanation = `${label}: limite temporal de peticiones (HTTP 429).`;
  else if ([500, 502, 503, 504].includes(status)) explanation = `${label}: servicio temporalmente no disponible (HTTP ${status}).`;
  else if (status === 408 || status === 425) explanation = `${label}: respuesta temporal o tiempo de espera agotado (HTTP ${status}).`;
  else explanation = `${label}: respuesta HTTP ${status || "desconocida"}.`;
  const error = new Error(`${explanation}${detail ? ` Detalle: ${detail}` : ""}`);
  error.statusCode = status;
  error.retryable = status === 0 || [408, 425, 429, 500, 502, 503, 504].includes(status);
  return error;
}

async function loadTextWithRetry(url, timeoutSeconds, label, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const request = new Request(url);
    request.timeoutInterval = timeoutSeconds;
    request.headers = { "Accept": "application/json, application/xml, text/xml, application/rss+xml, application/atom+xml, text/plain;q=0.9, */*;q=0.8", "Cache-Control": "no-cache" };
    let body = "";
    let status = 0;
    try {
      body = await request.loadString();
      status = Number(request.response && request.response.statusCode || 0);
      if (status >= 200 && status < 300 && String(body || "").trim()) return { body, status, headers: request.response && request.response.headers || {} };
      if (status >= 200 && status < 300) {
        lastError = new Error(`${label}: el servidor ha devuelto una respuesta vacia.`);
        lastError.statusCode = status;
        lastError.retryable = true;
      } else {
        lastError = httpRequestError(label, status, body);
      }
    } catch (error) {
      status = Number(request.response && request.response.statusCode || 0);
      lastError = error && error.retryable !== undefined ? error : httpRequestError(label, status, error && error.message ? error.message : String(error));
      if (status === 0) lastError.retryable = true;
    }
    if (!lastError.retryable || attempt >= maxAttempts) throw lastError;
    const retryDelay = retryAfterMilliseconds(request.response && request.response.headers);
    if (retryDelay > 15000) {
      lastError.message += ` El servidor solicita esperar ${Math.ceil(retryDelay / 1000)} segundos; no se repetira la peticion antes de ese plazo.`;
      lastError.retryAfterMs = retryDelay;
      throw lastError;
    }
    const backoff = Math.min(900 * Math.pow(2, attempt - 1), 6000);
    await waitMilliseconds(Math.max(retryDelay, backoff) + Math.floor(Math.random() * 300));
  }
  throw lastError || new Error(`${label}: no se pudo completar la peticion.`);
}

function validateWeatherPayload(data) {
  if (!data || typeof data !== "object" || !data.hourly || !data.daily) throw new Error("Open-Meteo ha devuelto una respuesta sin bloques horario y diario.");
  const h = data.hourly;
  const d = data.daily;
  if (!Array.isArray(h.time) || h.time.length < 12) throw new Error("Open-Meteo no ha devuelto suficientes horas de previsión.");
  if (!Array.isArray(d.time) || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.time[0] || ""))) throw new Error("Open-Meteo no ha devuelto una fecha diaria valida.");
  const hourlyFields = ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation_probability", "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m", "uv_index"];
  for (const field of hourlyFields) {
    if (!Array.isArray(h[field]) || h[field].length !== h.time.length) throw new Error(`La variable horaria ${field} falta o tiene una longitud inconsistente.`);
  }
  const dailyFields = ["temperature_2m_max", "temperature_2m_min", "apparent_temperature_max", "apparent_temperature_min", "precipitation_probability_max", "precipitation_sum", "wind_speed_10m_max", "wind_gusts_10m_max", "uv_index_max", "weather_code"];
  for (const field of dailyFields) {
    if (!Array.isArray(d[field]) || d[field].length < 1) throw new Error(`La variable diaria ${field} falta o esta vacia.`);
  }
  if (numberOrNull(d.temperature_2m_min[0]) === null || numberOrNull(d.temperature_2m_max[0]) === null) throw new Error("La temperatura maxima o minima diaria no contiene un valor numerico.");
  for (const target of TARGETS) {
    const index = hourIndex(h.time, target.minutes);
    if (index < 0) throw new Error(`No hay datos horarios para ${target.name}.`);
    for (const field of ["temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m"]) {
      if (numberOrNull(h[field][index]) === null) throw new Error(`Falta el dato horario ${field} para ${target.name}.`);
    }
  }
  return true;
}

function isWeatherCacheUsable(cache, latitude, longitude, now = Date.now()) {
  if (!cache || cache.version !== 1 || !Number.isFinite(Number(cache.savedAt))) return false;
  const age = now - Number(cache.savedAt);
  if (age < 0 || age > WEATHER_CACHE_MAX_AGE_MS) return false;
  if (Math.abs(Number(cache.latitude) - latitude) > 0.015 || Math.abs(Number(cache.longitude) - longitude) > 0.015) return false;
  try { return validateWeatherPayload(cache.data); } catch (_) { return false; }
}

function getUsableWeatherCache(latitude, longitude) {
  try {
    const cache = readJSON(weatherCachePath, null, value => value && value.version === 1 && Number.isFinite(Number(value.savedAt)) && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude)) && value.data && typeof value.data === "object");
    if (!isWeatherCacheUsable(cache, latitude, longitude)) return null;
    return cache;
  } catch (error) {
    console.warn(`La copia meteorologica no se puede utilizar: ${error.message || error}`);
    return null;
  }
}

async function getAemetAlerts(config) {
  const code = String(config.aemetRegionCode || "62");
  const regionName = String(config.aemetRegionName || "Comunidad seleccionada");
  const url = `https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC${encodeURIComponent(code)}_RSS.xml`;
  const checkedAt = new Date().toISOString();
  try {
    const response = await loadTextWithRetry(url, 18, "RSS de AEMET", 3);
    const feedXML = response.body;
    const feedItems = parseAemetFeed(feedXML).slice(0, 16);
    const alerts = [];
    const suppressed = new Set();
    let failures = 0;
    let invalidMessages = 0;

    // Se procesan lotes pequenos para evitar demasiadas conexiones simultaneas.
    for (let start = 0; start < feedItems.length; start += 4) {
      const batch = feedItems.slice(start, start + 4);
      const results = await Promise.all(batch.map(async item => {
        try {
          const capResponse = await loadTextWithRetry(item.url, 10, "Mensaje CAP de AEMET", 2);
          return parseAemetCap(capResponse.body, item);
        } catch (error) {
          console.warn(`No se pudo verificar un aviso CAP de AEMET: ${error.message || error}`);
          return null;
        }
      }));
      results.forEach(result => {
        if (result === null) failures += 1;
        else {
          result.suppressedIdentifiers.forEach(id => suppressed.add(id));
          invalidMessages += result.invalidMessages;
          alerts.push(...result.alerts);
        }
      });
    }

    // CAP Update/Cancel invalida los identificadores anteriores incluidos en references.
    const active = alerts.filter(alert => !alert.id || !suppressed.has(alert.id));
    const unique = [];
    const seen = new Set();
    for (const alert of active) {
      const key = alert.id || `${alert.area}|${alert.title}|${alert.expires}`;
      if (!seen.has(key)) { seen.add(key); unique.push(alert); }
    }
    const rank = { amarillo: 1, naranja: 2, rojo: 3 };
    unique.sort((a, b) => rank[b.level] - rank[a.level] || Date.parse(a.expires) - Date.parse(b.expires));
    const status = failures === 0 && invalidMessages === 0 ? "ok" : unique.length ? "partial" : "unavailable";
    return { status, regionName, alerts: unique.slice(0, 12), checkedAt: new Date().toISOString(), failedMessages: failures, invalidMessages, sourceURL: url };
  } catch (error) {
    console.warn(`No se pudieron consultar los avisos AEMET: ${error.message || error}`);
    return { status: "unavailable", regionName, alerts: [], error: String(error.message || error), checkedAt: new Date().toISOString(), failedMessages: 1, sourceURL: url };
  }
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

  try {
    const response = await loadTextWithRetry(url, 25, "Open-Meteo", WEATHER_RETRY_ATTEMPTS);
    let data;
    try { data = JSON.parse(response.body); }
    catch (error) { const invalid = new Error(`Open-Meteo ha devuelto un JSON invalido: ${error.message || error}`); invalid.retryable = true; throw invalid; }
    if (data.error) {
      const invalid = new Error(data.reason || "Open-Meteo ha devuelto un error de consulta.");
      invalid.retryable = false;
      throw invalid;
    }
    validateWeatherPayload(data);
    const fetchedAt = new Date().toISOString();
    const cache = { version: 1, savedAt: Date.now(), latitude, longitude, data };
    try {
      withDataLock(() => writeJSON(weatherCachePath, cache));
    } catch (cacheError) {
      console.warn(`No se pudo actualizar la copia meteorologica, pero se conserva la respuesta actual: ${cacheError.message || cacheError}`);
    }
    return { data, source: "live", fetchedAt, ageMinutes: 0 };
  } catch (error) {
    if (error && error.retryable) {
      const cache = getUsableWeatherCache(latitude, longitude);
      if (cache) {
        const ageMinutes = Math.max(1, Math.floor((Date.now() - Number(cache.savedAt)) / 60000));
        console.warn(`Open-Meteo no respondio. Se utilizara una prevision guardada hace ${ageMinutes} minutos.`);
        return { data: cache.data, source: "cache", fetchedAt: new Date(Number(cache.savedAt)).toISOString(), ageMinutes };
      }
    }
    throw new Error(`No se ha podido obtener una prevision meteorologica actualizada. ${error && error.message ? error.message : String(error)}`);
  }
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
  const stylePreference = config.stylePreference || "mixto";
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
  const transportRainExtra = transport === "andando" ? 10 : transport === "autobus" ? 5 : 0;
  const rainThreshold = 45 - Number(profile.rainSensitivity || 0) * 5 - transportRainExtra;
  const wetCode = periods.some(p => isWetCode(p.code));
  const rainExpected = maxRainProbability >= rainThreshold || maxRainAmount >= 0.2 || wetCode;

  const outfit = chooseUpper(coldFeel);
  const outdoorExtra = transport === "andando" ? 10 : transport === "autobus" ? 4 : 0;
  const windThreshold = 32 - Number(profile.windBias || 0) * 4 - outdoorExtra;
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
  if (transport === "andando") advice.push("Has indicado que vas andando: prioriza cortavientos, calzado comodo y proteccion frente a lluvia.");
  else if (transport === "autobus") advice.push("Has indicado autobus: prioriza una capa exterior comoda para esperar y caminar.");
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
    stylePreference,
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
    profileSnapshot: { ...profile },
    weatherAlerts: [],
    aemetAlertStatus: "pending",
    aemetRegionName: config.aemetRegionName || "Comunidad seleccionada",
    aemetCheckedAt: null,
    aemetFailedMessages: 0,
    outfitVariant: 1
  };
}

function saveReport(report) {
  return withDataLock(() => {
  const history = loadHistory();
  const existing = history.findIndex(item => item.date === report.date);
  const now = new Date().toISOString();

  if (existing >= 0) {
    const previous = history[existing];
    // Una ejecucion normal reinicia las alternativas para la nueva prevision; una alternativa las acumula.
    const previousSignatures = Array.isArray(previous.wardrobeVariantSignatures) ? previous.wardrobeVariantSignatures : [];
    const incomingSignature = report.wardrobeSelectionSignature || wardrobeSelectionSignature(report.wardrobeSelection || []);
    const signatures = Number(report.outfitVariant || 1) > 1
      ? Array.from(new Set([...previousSignatures, incomingSignature].filter(Boolean)))
      : (incomingSignature ? [incomingSignature] : []);
    // Una nueva ejecucion el mismo dia actualiza el tiempo, pero no borra la valoracion.
    history[existing] = {
      ...report,
      wardrobeVariantSignatures: signatures,
      createdAt: previous.createdAt || report.createdAt,
      updatedAt: now,
      feedback: previous.feedback || report.feedback || null,
      feedbackAt: previous.feedbackAt || report.feedbackAt || null,
      // Si el outfit ya fue valorado, mantenemos la combinacion a la que corresponde esa valoracion.
      ...(previous.feedback ? {
        outfit: previous.outfit || report.outfit,
        wardrobeSelection: previous.wardrobeSelection || report.wardrobeSelection || [],
        wardrobeEnabled: previous.wardrobeEnabled,
        wardrobeMissingSlots: previous.wardrobeMissingSlots || [],
        wardrobeSelectionSignature: previous.wardrobeSelectionSignature || incomingSignature,
        wardrobeVariantSignatures: previousSignatures
      } : {})
    };
  } else {
    history.push({ ...report, updatedAt: now });
  }

  history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  writeJSON(historyPath, history.slice(-HISTORY_LIMIT));
  });
}

async function removePendingByThread(threadIdentifier) {
  if (!threadIdentifier) return;
  const pending = await Notification.allPending();
  const identifiers = pending.filter(item => item.threadIdentifier === threadIdentifier).map(item => item.identifier).filter(Boolean);
  if (identifiers.length) await Notification.removePending(identifiers);
}

async function scheduleNotification(title, subtitle, body, openURL, date, threadIdentifier = "ropa-diaria-outfit") {
  // Evita acumular varias notificaciones pendientes del mismo tipo al ejecutar manualmente el script.
  await removePendingByThread(threadIdentifier);
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
  const highest = (report.weatherAlerts || [])[0];
  const staleForecast = report.weatherDataStatus === "cache";
  const warningPrefix = highest ? `⚠️ AEMET ${highest.level.toUpperCase()}: ` : "";
  const title = highest && highest.level !== "amarillo"
    ? `⚠️ AVISO ${highest.level.toUpperCase()} · Ropa diaria`
    : staleForecast ? "Previsión reciente · Ropa diaria" : `Ropa de hoy · ${Math.round(report.minTemp)}° / ${Math.round(report.maxTemp)}°`;
  const subtitle = `${report.place} · Sensacion ${Math.round(report.feelsMin)}–${Math.round(report.feelsMax)}°`;
  const verificationNote = ["partial", "unavailable"].includes(report.aemetAlertStatus)
    ? " No se pudieron verificar todos los avisos AEMET; consulta el canal oficial."
    : "";
  const weatherNote = staleForecast
    ? ` ATENCION: se usa una prevision guardada hace ${report.weatherAgeMinutes} min porque Open-Meteo no respondio. Comprueba el tiempo antes de salir.`
    : "";
  const body = `${warningPrefix}${report.outfit.base} + ${report.outfit.mid}. Exterior: ${report.outfit.outer}. ${report.outfit.lower}. ${report.outfit.shoes}. ${report.rainExpected ? "Lleva proteccion para la lluvia." : `Rachas: ${Math.round(report.gusts)} km/h.`}${weatherNote}${verificationNote} Toca para ver el outfit completo.`;
  await scheduleNotification(title, subtitle, body, `scriptable:///run/${encodeURIComponent(VIEW_SCRIPT)}`, new Date(Date.now() + 2500), "ropa-diaria-outfit");
}

async function scheduleRatingReminder(config) {
  const reminderDate = new Date();
  const [hour, minute] = String(config.ratingTime || "20:30").split(":").map(Number);
  reminderDate.setHours(hour, minute, 0, 0);
  if (reminderDate.getTime() <= Date.now()) reminderDate.setDate(reminderDate.getDate() + 1);
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
  await removePendingByThread("ropa-diaria-error");
  notification.title = "Ropa diaria: no se pudo actualizar";
  notification.body = String(message).slice(0, 220);
  notification.sound = "failure";
  notification.threadIdentifier = "ropa-diaria-error";
  notification.setTriggerDate(new Date(Date.now() + 1500));
  await notification.schedule();
}

async function generateAlternativeOutfit() {
  const history = loadHistory();
  const current = history.find(item => item.date === todayKey());
  if (!current) {
    await showInfo("Todavia no hay outfit", "Primero genera la recomendacion de hoy.");
    return;
  }
  if (current.feedback) {
    await showInfo("Outfit ya valorado", "Ya has valorado este conjunto. La alternativa no cambiara una recomendacion que ya has puntuado.");
    return;
  }
  if (!current.wardrobeEnabled || !(current.wardrobeSelection || []).length) {
    await showInfo("Armario sin suficientes prendas", "Añade varias prendas de distintas categorias para poder generar alternativas.");
    return;
  }

  const alternativeResult = findUnusedAlternative(current);
  if (!alternativeResult) {
    await showInfo("No hay otra combinacion diferente", "Ya has visto todas las combinaciones compatibles que permite tu armario con la prevision actual. Añade mas prendas para conseguir nuevas alternativas.");
    return;
  }

  const alternative = alternativeResult.candidate;
  const selectedSignature = alternativeResult.signature;
  const changed = alternativeResult.changed;
  const seen = alternativeResult.seen;
  alternative.outfitVariant = Math.round(clampFiniteNumber(current.outfitVariant, 1, 1, 100000)) + 1;
  alternative.createdAt = new Date().toISOString();
  alternative.feedback = null;
  alternative.wardrobeSelectionSignature = selectedSignature;
  alternative.wardrobeVariantSignatures = Array.from(new Set([...seen, selectedSignature]));
  saveReport(alternative);
  const done = new Alert();
  done.title = "🎰 Nuevo outfit generado";
  done.message = `He cambiado ${changed} prendas sin repetir una combinacion anterior y manteniendo las condiciones meteorologicas. Variante ${alternative.outfitVariant}.`;
  done.addAction("Ver nuevo outfit");
  await done.presentAlert();
  Safari.open(`scriptable:///run/${encodeURIComponent(VIEW_SCRIPT)}`);
}

try {
  recoverDataTransaction();
  const mode = args.queryParameters && args.queryParameters.mode;
  if (mode === "alternate") {
    await generateAlternativeOutfit();
  } else {
    const coords = parseCoordinates(args.shortcutParameter);
    let latitude;
    let longitude;
    if (coords) {
      latitude = coords.latitude;
      longitude = coords.longitude;
    } else {
      Location.setAccuracyToHundredMeters();
      const location = await Location.current();
      latitude = location.latitude;
      longitude = location.longitude;
    }

    const config = loadConfig();
    const profile = loadProfile();
    const weatherResult = await getWeather(latitude, longitude);
    const report = buildReport(weatherResult.data, "Ubicacion GPS", config, profile);
    report.weatherDataStatus = weatherResult.source;
    report.weatherFetchedAt = weatherResult.fetchedAt;
    report.weatherAgeMinutes = weatherResult.ageMinutes;
    if (weatherResult.source === "cache") report.notes.push(`ATENCION: se esta usando una prevision guardada hace ${weatherResult.ageMinutes} minutos. Comprueba la prevision actual antes de salir.`);
    const aemet = await getAemetAlerts(config);
    report.weatherAlerts = aemet.alerts;
    report.aemetAlertStatus = aemet.status;
    report.aemetRegionName = aemet.regionName;
    report.aemetCheckedAt = aemet.checkedAt || null;
    report.aemetFailedMessages = Number(aemet.failedMessages || 0);
    report.aemetSourceURL = aemet.sourceURL || null;
    if (aemet.status === "partial") report.notes.push("La consulta de AEMET ha sido parcial. Puede faltar algun aviso; consulta la fuente oficial.");
    if (aemet.status === "unavailable") report.notes.push("No se pudieron consultar los avisos oficiales de AEMET. Comprueba la conexión o consulta la web de AEMET.");
    applyWardrobe(report);
    report.wardrobeVariantSignatures = report.wardrobeSelectionSignature ? [report.wardrobeSelectionSignature] : [];
    report.outfitVariant = 1;
    report.schemaVersion = 5;
    saveReport(report);
    await sendReportNotification(report);
    await scheduleRatingReminder(config);
    console.log(`Recomendacion guardada para ${report.date}. Transporte: ${config.transport}. Estilo: ${config.stylePreference}.`);
  }
} catch (error) {
  console.error(error);
  try {
    await sendErrorNotification(error && error.message ? error.message : String(error));
  } catch (notificationError) {
    console.error(`Tampoco se pudo programar la notificacion de error: ${notificationError}`);
  }
}

Script.complete();
