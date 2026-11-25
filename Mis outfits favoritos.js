// MIS OUTFITS FAVORITOS - Scriptable V5.3.0 · base V5.2
// Guarda combinaciones favoritas, permite consultarlas, eliminarlas y aplicarlas al outfit de hoy.

const APP_NAME = "Ropa diaria";
const HISTORY_FILE = "ropa_diaria_history.json";
const FAVORITES_FILE = "ropa_diaria_favorites.json";
const FAVORITES_LIMIT = 500;
const LIST_PAGE_SIZE = 10;

const fm = FileManager.local();
const root = fm.documentsDirectory();
const historyPath = fm.joinPath(root, HISTORY_FILE);
const favoritesPath = fm.joinPath(root, FAVORITES_FILE);
const profilePath = fm.joinPath(root, "ropa_diaria_profile.json");

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}
function jsonBackupPath(path) { return `${path}.bak`; }
function jsonTempPath(path) { return `${path}.tmp`; }

function withDataLock(callback) {
  const lockPath = fm.joinPath(root, "ropa_diaria_storage.lock");
  const token = `lock_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  if (fm.fileExists(lockPath)) {
    let stale = false;
    try {
      const current = JSON.parse(fm.readString(lockPath));
      const createdAt = Number(current.createdAt || 0);
      stale = !createdAt || (Date.now() - createdAt) > 120000;
    } catch (_) { stale = true; }
    if (!stale) throw new Error("Ropa diaria esta guardando datos en otra operacion. Vuelve a intentarlo en unos segundos.");
    fm.remove(lockPath);
  }
  fm.writeString(lockPath, JSON.stringify({ token, createdAt: Date.now() }));
  const confirmed = JSON.parse(fm.readString(lockPath));
  if (!confirmed || confirmed.token !== token) throw new Error("No se pudo adquirir el bloqueo de almacenamiento. No se han modificado los datos.");
  try { return callback(); }
  finally {
    if (fm.fileExists(lockPath)) {
      try {
        const current = JSON.parse(fm.readString(lockPath));
        if (current && current.token === token) fm.remove(lockPath);
      } catch (_) {}
    }
  }
}

function replaceFileFromTemp(tempPath, destinationPath, validateContent = null) {
  if (!fm.fileExists(tempPath)) throw new Error("No existe el archivo temporal que se quiere guardar.");
  const rollbackPath = `${destinationPath}.rollback.${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  let movedOriginal = false;
  if (fm.fileExists(destinationPath)) {
    try { fm.move(destinationPath, rollbackPath); movedOriginal = true; }
    catch (error) {
      if (fm.fileExists(tempPath)) { try { fm.remove(tempPath); } catch (_) {} }
      throw new Error(`No se pudo apartar el archivo anterior; no se ha sustituido. ${error.message || error}`);
    }
  }
  try {
    fm.move(tempPath, destinationPath);
    if (!fm.fileExists(destinationPath)) throw new Error("El archivo no aparece despues del movimiento.");
    const savedContent = fm.readString(destinationPath);
    if (validateContent) validateContent(savedContent);
  } catch (error) {
    try { if (fm.fileExists(destinationPath)) fm.remove(destinationPath); } catch (_) {}
    if (movedOriginal && fm.fileExists(rollbackPath)) {
      try { fm.move(rollbackPath, destinationPath); }
      catch (restoreError) {
        throw new Error(`Fallo el reemplazo y tambien la restauracion. El archivo anterior se conserva en ${rollbackPath}. Error original: ${error.message || error}. Restauracion: ${restoreError.message || restoreError}`);
      }
    }
    throw error;
  }
  if (movedOriginal && fm.fileExists(rollbackPath)) {
    try { fm.remove(rollbackPath); }
    catch (cleanupError) { console.warn(`Se conserva un archivo rollback: ${cleanupError.message || cleanupError}`); }
  }
}

function restoreJSONFile(path, raw, validator = null) {
  const tempPath = `${jsonTempPath(path)}.restore`;
  const parsed = JSON.parse(raw);
  if (validator && !validator(parsed)) throw new Error("La copia no cumple la estructura esperada.");
  fm.writeString(tempPath, raw);
  JSON.parse(fm.readString(tempPath));
  replaceFileFromTemp(tempPath, path, content => {
    const value = JSON.parse(content);
    if (validator && !validator(value)) throw new Error("El contenido restaurado no es valido.");
  });
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
    try { return parseValidated(fm.readString(path)); }
    catch (primaryError) {
      if (!fm.fileExists(backupPath)) {
        throw new Error(`El archivo ${path.split("/").pop()} esta danado y no existe una copia de seguridad. No se ha sobrescrito ningun dato. Detalle: ${primaryError.message || primaryError}`);
      }
      try {
        const backupRaw = fm.readString(backupPath);
        const recovered = parseValidated(backupRaw);
        restoreJSONFile(path, backupRaw, validator);
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
      restoreJSONFile(path, backupRaw, validator);
      console.warn(`Se ha restaurado ${path.split("/").pop()} desde su copia de seguridad porque faltaba el archivo principal.`);
      return recovered;
    } catch (error) {
      throw new Error(`Falta ${path.split("/").pop()} y su copia de seguridad no se puede recuperar: ${error.message || error}`);
    }
  }
  return fallback;
}

function writeJSON(path, value, validator = null) {
  const serialized = JSON.stringify(value, null, 2);
  if (typeof serialized !== "string") throw new Error(`No se pudo serializar ${path.split("/").pop()}.`);
  const parsed = JSON.parse(serialized);
  if (validator && !validator(parsed)) throw new Error(`No se guardo ${path.split("/").pop()}: la estructura no es valida.`);
  const backupPath = jsonBackupPath(path);
  const tempPath = jsonTempPath(path);
  if (fm.fileExists(tempPath)) fm.remove(tempPath);
  fm.writeString(tempPath, serialized);
  JSON.parse(fm.readString(tempPath));

  if (fm.fileExists(path)) {
    const currentRaw = fm.readString(path);
    let currentIsValid = true;
    try {
      const current = JSON.parse(currentRaw);
      if (validator && !validator(current)) currentIsValid = false;
    } catch (_) { currentIsValid = false; }
    if (currentIsValid) {
      fm.writeString(backupPath, currentRaw);
      const backup = JSON.parse(fm.readString(backupPath));
      if (validator && !validator(backup)) throw new Error("La copia de seguridad no ha superado la validacion.");
    } else if (!fm.fileExists(backupPath)) {
      if (fm.fileExists(tempPath)) fm.remove(tempPath);
      throw new Error(`No se actualizo ${path.split("/").pop()}: el archivo actual esta danado y no hay una copia valida.`);
    } else {
      const backup = JSON.parse(fm.readString(backupPath));
      if (validator && !validator(backup)) throw new Error("No se actualizo el archivo: la copia de seguridad tampoco es valida.");
    }
  }
  try {
    replaceFileFromTemp(tempPath, path, content => {
      const saved = JSON.parse(content);
      if (validator && !validator(saved)) throw new Error("El archivo guardado no cumple la estructura esperada.");
    });
    const saved = JSON.parse(fm.readString(path));
    if (validator && !validator(saved)) throw new Error("El archivo final no ha superado la validacion.");
  } catch (error) {
    if (fm.fileExists(tempPath)) fm.remove(tempPath);
    if (!fm.fileExists(path) && fm.fileExists(backupPath)) {
      try { fm.writeString(path, fm.readString(backupPath)); } catch (restoreError) { console.error(restoreError); }
    }
    throw new Error(`No se pudo guardar ${path.split("/").pop()}. Se ha conservado la copia de seguridad. Detalle: ${error.message || error}`);
  }
}

function validHistory(value) {
  return Array.isArray(value) && value.every(item => isPlainObject(item) && validDateKey(item.date));
}
function validFavorite(item) {
  return isPlainObject(item) && typeof item.id === "string" && !!item.id &&
    typeof item.signature === "string" && !!item.signature &&
    typeof item.name === "string" && !!item.name &&
    typeof item.savedAt === "string" && validDateKey(item.sourceDate) &&
    isPlainObject(item.report) && isPlainObject(item.report.outfit);
}
function validFavoriteStore(value) {
  return isPlainObject(value) && value.version === 1 && Array.isArray(value.items) && value.items.every(validFavorite);
}
function readHistory() {
  const value = readJSON(historyPath, [], validHistory);
  if (!validHistory(value)) throw new Error("El historial no tiene una estructura valida. No se ha modificado ningun dato.");
  return value;
}
function readFavoriteStore() {
  const value = readJSON(favoritesPath, { version: 1, items: [] }, validFavoriteStore);
  if (!validFavoriteStore(value)) throw new Error("El archivo de favoritos no tiene una estructura valida.");
  return value;
}

function recoverDataTransaction() {
  const transactionPath = fm.joinPath(root, "ropa_diaria_transaction.json");
  if (!fm.fileExists(transactionPath)) return false;
  return withDataLock(() => {
    if (!fm.fileExists(transactionPath)) return false;
    const transaction = readJSON(transactionPath, null, value => isPlainObject(value) && value.version === 1 && isPlainObject(value.profile) && Array.isArray(value.history) && validHistory(value.history));
    if (!transaction || transaction.version !== 1 || !isPlainObject(transaction.profile) || !validHistory(transaction.history)) {
      throw new Error("Hay una operacion de valoracion pendiente, pero su archivo de recuperacion no es valido. No se han modificado los datos.");
    }
    if (transaction.state !== "committed") {
      writeJSON(profilePath, transaction.profile);
      writeJSON(historyPath, transaction.history, validHistory);
      transaction.state = "committed";
      writeJSON(transactionPath, transaction);
    }
    [transactionPath, jsonBackupPath(transactionPath), jsonTempPath(transactionPath)].forEach(path => {
      if (fm.fileExists(path)) fm.remove(path);
    });
    return true;
  });
}

function dateText(value, includeYear = true) {
  if (!validDateKey(value)) return String(value || "Fecha desconocida");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString("es-ES", {
    day: "numeric", month: "long", ...(includeYear ? { year: "numeric" } : {})
  });
}
function normalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function outfitSignature(report) {
  const outfit = report.outfit || {};
  const parts = ["base", "mid", "outer", "lower", "shoes"].map(key => normalized(outfit[key]));
  const accessories = (Array.isArray(outfit.accessories) ? outfit.accessories : []).map(normalized).sort();
  const selection = (Array.isArray(report.wardrobeSelection) ? report.wardrobeSelection : [])
    .map(item => String(item && (item.id || item.name) || ""))
    .filter(Boolean).sort();
  return JSON.stringify({ parts, accessories, selection });
}
function safeSelection(selection) {
  if (!Array.isArray(selection)) return [];
  return selection.filter(isPlainObject).map(item => ({
    id: item.id == null ? null : String(item.id),
    name: String(item.name || "Prenda"),
    slot: String(item.slot || ""),
    category: String(item.category || ""),
    color: String(item.color || ""),
    warmthLevel: Number.isFinite(Number(item.warmthLevel)) ? Number(item.warmthLevel) : null,
    imageFile: item.imageFile ? String(item.imageFile) : null,
    imageMimeType: item.imageMimeType ? String(item.imageMimeType) : null
  }));
}
function createFavorite(report) {
  const outfit = report.outfit || {};
  const snapshot = {
    outfit: {
      base: String(outfit.base || ""),
      mid: String(outfit.mid || ""),
      outer: String(outfit.outer || ""),
      lower: String(outfit.lower || ""),
      shoes: String(outfit.shoes || ""),
      accessories: Array.isArray(outfit.accessories) ? outfit.accessories.map(item => String(item)) : []
    },
    wardrobeEnabled: !!report.wardrobeEnabled,
    wardrobeSelection: safeSelection(report.wardrobeSelection),
    wardrobeMissingSlots: Array.isArray(report.wardrobeMissingSlots) ? report.wardrobeMissingSlots.map(String) : [],
    wardrobeSelectionSignature: report.wardrobeSelectionSignature || null,
    transport: report.transport || "coche",
    thermalPreference: report.thermalPreference || "normal",
    stylePreference: report.stylePreference || "mixto",
    minTemp: report.minTemp ?? null,
    maxTemp: report.maxTemp ?? null,
    feelsMin: report.feelsMin ?? null,
    feelsMax: report.feelsMax ?? null,
    gusts: report.gusts ?? null,
    rainExpected: !!report.rainExpected
  };
  const id = `fav_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  return {
    id,
    signature: outfitSignature(report),
    name: `Outfit del ${dateText(report.date)}`,
    savedAt: new Date().toISOString(),
    sourceDate: report.date,
    report: snapshot
  };
}

async function showInfo(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("Aceptar");
  await alert.presentAlert();
}
async function askConfirmation(title, message, confirmLabel) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction(confirmLabel);
  alert.addCancelAction("Cancelar");
  return (await alert.presentAlert()) === 0;
}

async function saveCurrentOutfit() {
  const result = withDataLock(() => {
    const report = readHistory().find(item => item.date === todayKey());
    if (!report || !isPlainObject(report.outfit)) return { status: "missing" };
    const store = readFavoriteStore();
    const signature = outfitSignature(report);
    const existing = store.items.find(item => item.signature === signature);
    if (existing) return { status: "duplicate", favorite: existing };
    if (store.items.length >= FAVORITES_LIMIT) return { status: "limit" };
    const favorite = createFavorite(report);
    store.items.unshift(favorite);
    writeJSON(favoritesPath, store, validFavoriteStore);
    return { status: "saved", favorite };
  });

  if (result.status === "missing") {
    await showInfo("Todavia no hay outfit", "Primero ejecuta Ropa diaria para generar la recomendacion de hoy. Despues podras guardarla en favoritos.");
  } else if (result.status === "duplicate") {
    await showInfo("Ya esta en favoritos", `Esta combinacion ya esta guardada como «${result.favorite.name}». No se ha creado un duplicado.`);
  } else if (result.status === "limit") {
    await showInfo("Coleccion completa", `Has alcanzado el limite de ${FAVORITES_LIMIT} outfits favoritos. Elimina alguno antes de guardar otro.`);
  } else {
    const outfit = result.favorite.report.outfit;
    await showInfo("Outfit guardado ❤️", `${result.favorite.name}

${outfit.base}
${outfit.mid}
${outfit.outer}
${outfit.lower}
${outfit.shoes}

Ya forma parte de tu coleccion de favoritos.`);
  }
}

function favoriteDescription(favorite) {
  const report = favorite.report || {};
  const outfit = report.outfit || {};
  const temp = report.minTemp == null && report.maxTemp == null
    ? "Temperatura no registrada"
    : `${report.minTemp == null ? "—" : Math.round(report.minTemp)}° / ${report.maxTemp == null ? "—" : Math.round(report.maxTemp)}°`;
  const lines = [
    `Guardado: ${dateText(favorite.sourceDate)}`,
    `Tiempo del dia original: ${temp}`,
    "",
    `👕 ${outfit.base || "—"}`,
    `🧶 ${outfit.mid || "—"}`,
    `🧥 ${outfit.outer || "—"}`,
    `👖 ${outfit.lower || "—"}`,
    `👟 ${outfit.shoes || "—"}`
  ];
  if (Array.isArray(outfit.accessories) && outfit.accessories.length) lines.push(`🎒 ${outfit.accessories.join(" · ")}`);
  lines.push("", report.wardrobeEnabled ? `${(report.wardrobeSelection || []).length} prendas de tu armario` : "Recomendacion general");
  return lines.join("\n");
}

async function removeFavorite(favoriteId) {
  const result = withDataLock(() => {
    const store = readFavoriteStore();
    const index = store.items.findIndex(item => item.id === favoriteId);
    if (index < 0) return false;
    store.items.splice(index, 1);
    writeJSON(favoritesPath, store, validFavoriteStore);
    return true;
  });
  await showInfo(result ? "Favorito eliminado" : "No se encontro", result ? "El outfit se ha quitado de tu coleccion. El historial original no se ha modificado." : "Este favorito ya no esta guardado.");
}

async function applyFavoriteToToday(favoriteId) {
  let initialStore = readFavoriteStore();
  const selected = initialStore.items.find(item => item.id === favoriteId);
  if (!selected) {
    await showInfo("Favorito no encontrado", "Puede que se haya eliminado desde otra ejecucion.");
    return;
  }
  const initialToday = readHistory().find(item => item.date === todayKey());
  if (!initialToday) {
    await showInfo("Genera primero el outfit de hoy", "Ejecuta Ropa diaria para cargar la prevision y los avisos meteorologicos actuales. Despues podras aplicar el conjunto favorito sin perder esos datos.");
    return;
  }
  if (initialToday.feedback) {
    await showInfo("Outfit ya valorado", "No se puede sustituir una recomendacion que ya has valorado. Asi se conserva la integridad de tu historial y de tus preferencias.");
    return;
  }
  const accepted = await askConfirmation(
    "Aplicar outfit favorito",
    `Se sustituira la ropa recomendada de hoy por este conjunto:

${favoriteDescription(selected)}

Se conservaran la temperatura, la prevision y los avisos de hoy. El conjunto se guardo en otra fecha y puede no ajustarse al tiempo actual. Revisa las condiciones antes de salir.`,
    "Aplicar conjunto"
  );
  if (!accepted) return;

  const result = withDataLock(() => {
    const store = readFavoriteStore();
    const favorite = store.items.find(item => item.id === favoriteId);
    if (!favorite) return "missingFavorite";
    const history = readHistory();
    const index = history.findIndex(item => item.date === todayKey());
    if (index < 0) return "missingToday";
    const current = history[index];
    if (current.feedback) return "rated";
    const snapshot = favorite.report;
    const signature = snapshot.wardrobeSelectionSignature || null;
    const priorSignatures = Array.isArray(current.wardrobeVariantSignatures) ? current.wardrobeVariantSignatures : [];
    history[index] = {
      ...current,
      outfit: cloneJSON(snapshot.outfit),
      wardrobeEnabled: !!snapshot.wardrobeEnabled,
      wardrobeSelection: cloneJSON(snapshot.wardrobeSelection || []),
      wardrobeMissingSlots: cloneJSON(snapshot.wardrobeMissingSlots || []),
      wardrobeSelectionSignature: signature,
      wardrobeVariantSignatures: Array.from(new Set([...priorSignatures, signature].filter(Boolean))),
      manualFavoriteRestore: {
        favoriteId: favorite.id,
        favoriteName: favorite.name,
        sourceDate: favorite.sourceDate,
        restoredAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    };
    writeJSON(historyPath, history, validHistory);
    return "applied";
  });

  if (result === "applied") {
    await showInfo("Outfit aplicado", "El conjunto favorito ya aparece como tu outfit de hoy. Se han mantenido los datos meteorologicos actuales.");
    Safari.open("scriptable:///run/Ver%20outfit%20hoy");
  } else if (result === "rated") {
    await showInfo("Outfit ya valorado", "La recomendacion de hoy se ha valorado mientras confirmabas. No se ha modificado.");
  } else {
    await showInfo("No se pudo aplicar", result === "missingToday" ? "Ya no hay una recomendacion para hoy. Ejecuta Ropa diaria y vuelve a intentarlo." : "El favorito ya no esta disponible.");
  }
}

async function showFavoriteDetail(favorite) {
  const alert = new Alert();
  alert.title = favorite.name;
  alert.message = favoriteDescription(favorite);
  alert.addAction("Aplicar a outfit de hoy");
  alert.addDestructiveAction("Eliminar de favoritos");
  alert.addCancelAction("Volver");
  const choice = await alert.presentAlert();
  if (choice === 0) await applyFavoriteToToday(favorite.id);
  else if (choice === 1) {
    const accepted = await askConfirmation("Eliminar favorito", `¿Quieres eliminar «${favorite.name}» de favoritos? No se borrara del historial.`, "Eliminar");
    if (accepted) await removeFavorite(favorite.id);
  }
}

async function showFavoriteList() {
  let page = 0;
  while (true) {
    const store = readFavoriteStore();
    const favorites = store.items.slice().sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    if (!favorites.length) {
      await showInfo("Todavia no tienes favoritos", "Cuando veas un conjunto que te guste, pulsa «Guardar en favoritos» desde Ver outfit hoy.");
      return;
    }
    const pageCount = Math.max(1, Math.ceil(favorites.length / LIST_PAGE_SIZE));
    page = Math.max(0, Math.min(page, pageCount - 1));
    const pageItems = favorites.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);
    const alert = new Alert();
    alert.title = "Mis outfits favoritos";
    alert.message = `${favorites.length} conjuntos guardados · Pagina ${page + 1} de ${pageCount}\nSelecciona uno para consultar sus detalles.`;
    pageItems.forEach((favorite, index) => {
      const outfit = favorite.report.outfit || {};
      alert.addAction(`${page * LIST_PAGE_SIZE + index + 1}. ${favorite.name} · ${String(outfit.base || "Outfit").slice(0, 24)}`);
    });
    let previousIndex = -1;
    let nextIndex = -1;
    if (page > 0) { previousIndex = pageItems.length; alert.addAction("← Pagina anterior"); }
    if (page < pageCount - 1) {
      nextIndex = pageItems.length + (page > 0 ? 1 : 0);
      alert.addAction("Pagina siguiente →");
    }
    alert.addCancelAction("Cerrar");
    const choice = await alert.presentAlert();
    if (choice < 0) return;
    if (choice < pageItems.length) {
      await showFavoriteDetail(pageItems[choice]);
      continue;
    }
    if (choice === previousIndex) { page -= 1; continue; }
    if (choice === nextIndex) { page += 1; continue; }
    return;
  }
}

async function showMainMenu() {
  const count = readFavoriteStore().items.length;
  const alert = new Alert();
  alert.title = "Mis outfits favoritos";
  alert.message = `${count} conjuntos guardados.\n\nGuarda las combinaciones que te gustan y vuelve a consultarlas cuando quieras.`;
  alert.addAction("Ver mis favoritos");
  alert.addAction("Guardar outfit de hoy");
  alert.addCancelAction("Cerrar");
  const choice = await alert.presentAlert();
  if (choice === 0) await showFavoriteList();
  else if (choice === 1) await saveCurrentOutfit();
}

try {
  recoverDataTransaction();
  const mode = args.queryParameters && args.queryParameters.mode;
  if (mode === "save") await saveCurrentOutfit();
  else if (mode === "list") await showFavoriteList();
  else await showMainMenu();
} catch (error) {
  console.error(error);
  await showInfo("Mis outfits favoritos: error", error && error.message ? error.message : String(error));
}

Script.complete();
