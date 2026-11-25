// DIAGNOSTICO ROPA DIARIA - Scriptable V5.3.0 · base V5.2
// Solo lectura: comprueba JSON, copias, transacciones, bloqueo, fotos y claves configuradas.
// No modifica archivos, no restaura copias y no realiza llamadas de red.

const fm = FileManager.local();
const root = fm.documentsDirectory();
const checks = [];
let errors = 0;
let warnings = 0;

function add(status, label, detail) {
  if (status === "ERROR") errors += 1;
  if (status === "AVISO") warnings += 1;
  checks.push({status, label, detail: String(detail || "")});
}
function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parts = String(value).split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}
function readJSON(filePath) {
  if (!fm.fileExists(filePath)) return {exists: false, valid: false, value: null, error: "No existe"};
  try {
    return {exists: true, valid: true, value: JSON.parse(fm.readString(filePath)), error: ""};
  } catch (error) {
    return {exists: true, valid: false, value: null, error: error.message || String(error)};
  }
}
function inspectDocument(filename, validator, optional, backupFilenames = []) {
  const path = fm.joinPath(root, filename);
  const backupPaths = [...backupFilenames.map(name => fm.joinPath(root, name)), `${path}.bak`];
  const primary = readJSON(path);
  const findValidBackup = () => {
    for (const backupPath of backupPaths) {
      const candidate = readJSON(backupPath);
      if (candidate.valid && validator(candidate.value)) return { path: backupPath, value: candidate.value };
    }
    return null;
  };
  if (!primary.exists) {
    const backupData = findValidBackup();
    if (backupData) {
      add("AVISO", filename, `Falta el archivo principal; existe una copia JSON valida (${backupData.path.split("/").pop()}). No se ha restaurado automaticamente.`);
    } else if (optional) {
      add("INFO", filename, "Todavia no se ha creado. No es un error si aun no has usado esta funcion.");
    } else {
      add("AVISO", filename, "Todavia no existe el archivo principal.");
    }
    return null;
  }
  if (primary.valid && validator(primary.value)) {
    add("OK", filename, "JSON legible y estructura basica valida.");
    return primary.value;
  }
  const backupData = findValidBackup();
  if (backupData) {
    add("AVISO", filename, `El principal no es valido, pero hay una copia valida (${backupData.path.split("/").pop()}). No se ha modificado nada.`);
  } else {
    add("ERROR", filename, "El principal no es valido y no hay una copia de seguridad recuperable.");
  }
  return null;
}

const config = inspectDocument("ropa_diaria_config.json", isPlainObject, true);
const profile = inspectDocument("ropa_diaria_profile.json", isPlainObject, true);
const history = inspectDocument("ropa_diaria_history.json", value => Array.isArray(value) && value.every(item => isPlainObject(item) && validDateKey(item.date)), true);
const wardrobe = inspectDocument("ropa_diaria_wardrobe.json", value => {
  const items = Array.isArray(value) ? value : (isPlainObject(value) && Array.isArray(value.items) ? value.items : null);
  if (!items) return false;
  const ids = items.map(item => item && item.id ? String(item.id) : "");
  return items.every(item => isPlainObject(item) && item.id && item.category) && ids.every(Boolean) && new Set(ids).size === ids.length;
}, true, ["ropa_diaria_wardrobe.backup.json"]);
const favorites = inspectDocument("ropa_diaria_favorites.json", value => {
  return isPlainObject(value) && value.version === 1 && Array.isArray(value.items) && value.items.every(item =>
    isPlainObject(item) && typeof item.id === "string" && !!item.id &&
    typeof item.signature === "string" && !!item.signature &&
    typeof item.name === "string" && !!item.name && validDateKey(item.sourceDate) &&
    isPlainObject(item.report) && isPlainObject(item.report.outfit)
  );
}, true);

if (config) {
  const transportOK = ["coche", "autobus", "andando"].includes(config.transport);
  const styleOK = ["casual", "urbano", "deportivo", "minimalista", "elegante", "mixto"].includes(config.stylePreference || "mixto");
  const timeOK = /^([01]\d|2[0-3]):[0-5]\d$/.test(config.ratingTime || "20:30");
  add(transportOK && styleOK && timeOK ? "OK" : "AVISO", "Preferencias", `Transporte ${transportOK ? "valido" : "revisar"}; estilo ${styleOK ? "valido" : "revisar"}; hora de valoracion ${timeOK ? "valida" : "revisar"}.`);
}

if (history) {
  const duplicates = history.length - new Set(history.map(item => item.date)).size;
  add(duplicates === 0 ? "OK" : "AVISO", "Historial", `${history.length} registros; ${duplicates} fechas repetidas.`);
}
if (favorites) {
  const duplicateIds = favorites.items.length - new Set(favorites.items.map(item => item.id)).size;
  const duplicateSignatures = favorites.items.length - new Set(favorites.items.map(item => item.signature)).size;
  add(duplicateIds === 0 && duplicateSignatures === 0 ? "OK" : "AVISO", "Outfits favoritos", `${favorites.items.length} conjuntos guardados; ${duplicateIds} ID repetidos y ${duplicateSignatures} combinaciones duplicadas.`);
}

if (wardrobe) {
  const items = Array.isArray(wardrobe) ? wardrobe : wardrobe.items;
  add("OK", "Armario", `${items.length} prendas; identificadores unicos y categorias presentes.`);
  const photosDir = fm.joinPath(root, "ropa_diaria_armario/photos");
  let missingPhotos = 0;
  items.forEach(item => {
    [item.imageFile, item.originalImageFile].filter(Boolean).forEach(relative => {
      const safe = String(relative).replace(/\\/g, "/");
      if (safe.startsWith("/") || safe.split("/").includes("..")) { missingPhotos += 1; return; }
      const photoPath = fm.joinPath(root, safe);
      if (!fm.fileExists(photoPath)) missingPhotos += 1;
    });
  });
  add(missingPhotos === 0 ? "OK" : "AVISO", "Fotografias de prendas", missingPhotos === 0 ? "Todas las rutas registradas existen." : `${missingPhotos} ruta(s) de imagen no encontradas o no seguras.`);
  if (fm.fileExists(photosDir)) {
    try { add("OK", "Carpeta de fotos", `${fm.listContents(photosDir).length} archivos encontrados.`); }
    catch (_) { add("AVISO", "Carpeta de fotos", "Existe, pero no se ha podido listar su contenido."); }
  } else add("AVISO", "Carpeta de fotos", "No existe; se creara al anadir la primera prenda.");
}

const transactionPath = fm.joinPath(root, "ropa_diaria_transaction.json");
const transaction = readJSON(transactionPath);
if (!transaction.exists) add("OK", "Transacciones", "No hay ninguna transaccion pendiente.");
else if (transaction.valid && isPlainObject(transaction.value) && transaction.value.version === 1 && isPlainObject(transaction.value.profile) && Array.isArray(transaction.value.history)) {
  add(transaction.value.state === "committed" ? "AVISO" : "AVISO", "Transacciones", transaction.value.state === "committed" ? "Hay una transaccion ya marcada como completada; los scripts la limpiaran al iniciarse." : "Hay una operacion pendiente de recuperacion. Abre Ropa diaria o Valorar outfit para que se procese.");
} else add("ERROR", "Transacciones", "El archivo de recuperacion existe, pero su estructura JSON no es valida.");

const lockPath = fm.joinPath(root, "ropa_diaria_storage.lock");
if (!fm.fileExists(lockPath)) add("OK", "Bloqueo de almacenamiento", "No hay ningun bloqueo activo.");
else {
  try {
    const lock = JSON.parse(fm.readString(lockPath));
    const age = Date.now() - Number(lock.createdAt || 0);
    if (!Number.isFinite(age) || age < 0) add("AVISO", "Bloqueo de almacenamiento", "El bloqueo tiene una fecha no valida.");
    else if (age > 120000) add("AVISO", "Bloqueo de almacenamiento", `Bloqueo antiguo (${Math.round(age / 1000)} s). Los scripts pueden considerarlo obsoleto.`);
    else add("AVISO", "Bloqueo de almacenamiento", `Hay una operacion reciente (${Math.round(age / 1000)} s). No la interrumpas.`);
  } catch (_) { add("AVISO", "Bloqueo de almacenamiento", "El archivo de bloqueo no se puede leer; se revisara al ejecutar un script."); }
}

const cachePath = fm.joinPath(root, "ropa_diaria_weather_cache.json");
const cache = readJSON(cachePath);
if (!cache.exists) add("INFO", "Cache meteorologica", "Todavia no hay una prevision guardada.");
else if (!cache.valid || !isPlainObject(cache.value) || !Number.isFinite(Number(cache.value.savedAt))) add("AVISO", "Cache meteorologica", "La cache no es legible o no contiene fecha de guardado valida.");
else {
  const age = Date.now() - Number(cache.value.savedAt);
  const usable = age >= 0 && age <= 60 * 60 * 1000;
  add(usable ? "OK" : "AVISO", "Cache meteorologica", usable ? `Respaldo de ${Math.round(age / 60000)} min.` : "La prevision guardada tiene mas de 60 minutos o una fecha futura; no debe tratarse como actual.");
}

const wardrobeDir = fm.joinPath(root, "ropa_diaria_armario");
const pendingPhotoPath = fm.joinPath(wardrobeDir, "pendiente_analisis.jpg");
const pendingMetaPath = fm.joinPath(wardrobeDir, "pendiente_analisis.json");
const pendingResultPath = fm.joinPath(wardrobeDir, "pendiente_analisis_resultado.json");
if (fm.fileExists(pendingPhotoPath)) {
  const meta = readJSON(pendingMetaPath);
  const result = readJSON(pendingResultPath);
  add("AVISO", "Fotografia pendiente", `Hay una foto pendiente de analizar. Metadatos ${meta.valid ? "validos" : "ausentes o ilegibles"}; resultado guardado ${result.valid ? "disponible" : "no disponible"}.`);
} else add("OK", "Fotografia pendiente", "No hay ninguna foto pendiente de analizar.");

try {
  const groqConfigured = Keychain.contains("ropa_diaria_groq_api_key");
  const geminiConfigured = Keychain.contains("ropa_diaria_gemini_api_key");
  const removeBgConfigured = Keychain.contains("ropa_diaria_removebg_api_key");
  add(groqConfigured ? "OK" : "AVISO", "Groq principal API Key", groqConfigured ? "Clave guardada en Keychain (contenido oculto)." : "No hay una clave Groq guardada en Keychain.");
  add(geminiConfigured ? "OK" : "AVISO", "Gemini fallback API Key", geminiConfigured ? "Clave guardada en Keychain (contenido oculto)." : "No hay una clave Gemini guardada en Keychain.");
  add(removeBgConfigured ? "OK" : "INFO", "remove.bg API Key", removeBgConfigured ? "Clave guardada en Keychain (contenido oculto)." : "Recorte de fondo no configurado; es opcional.");
} catch (error) {
  add("AVISO", "Keychain", `No se pudo consultar el estado de las claves: ${error.message || error}`);
}

const statusCounts = {OK: checks.filter(x => x.status === "OK").length, AVISO: warnings, ERROR: errors};
const lines = checks.map(item => `${item.status === "OK" ? "✓" : item.status === "ERROR" ? "✕" : item.status === "AVISO" ? "!" : "·"} ${item.label}: ${item.detail}`);
const summary = `DIAGNOSTICO ROPA DIARIA V5.3.0\n${statusCounts.OK} correctos · ${statusCounts.AVISO} avisos · ${statusCounts.ERROR} errores\n\n${lines.join("\n")}\n\nEste informe es de solo lectura. No se han modificado archivos ni se han enviado fotos o claves a Internet.`;
const alert = new Alert();
alert.title = errors ? "Diagnostico: revisar errores" : warnings ? "Diagnostico completado con avisos" : "Diagnostico correcto";
alert.message = summary;
alert.addAction("Aceptar");
await alert.presentAlert();
Script.complete();
