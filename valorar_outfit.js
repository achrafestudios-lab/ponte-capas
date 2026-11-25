// VALORAR OUTFIT - Scriptable V5.3.0 · base V5.2
// Permite valorar cualquier recomendacion pendiente de los ultimos 30 dias.

const fm = FileManager.local();
const root = fm.documentsDirectory();
const profilePath = fm.joinPath(root, "ropa_diaria_profile.json");
const historyPath = fm.joinPath(root, "ropa_diaria_history.json");
const transactionPath = fm.joinPath(root, "ropa_diaria_transaction.json");
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

function dateText(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}
async function showInfo(title, message) {
  const alert = new Alert(); alert.title = title; alert.message = message; alert.addAction("Aceptar"); await alert.presentAlert();
}

try {
  recoverDataTransaction();
  const history = readJSON(historyPath, [], data => Array.isArray(data) && data.every(item => item && typeof item === "object" && !Array.isArray(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ""))));
  if (!Array.isArray(history) || history.some(item => !item || typeof item !== "object" || Array.isArray(item) || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))) {
    throw new Error("El historial contiene registros con un formato no valido. No se ha modificado.");
  }
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30); cutoff.setHours(0, 0, 0, 0);
  const pending = history.filter(item => {
    if (item.feedback) return false;
    const parts = String(item.date || "").split("-").map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return false;
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
    return date >= cutoff;
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!pending.length) {
    await showInfo("No hay valoraciones pendientes", "No encuentro outfits sin valorar en los ultimos 30 dias. Puedes seguir consultando tu historial.");
  } else {
    const choose = new Alert();
    choose.title = "¿Que outfit quieres valorar?";
    choose.message = "Puedes recuperar una valoracion aunque no la hicieras a la hora del recordatorio.";
    const options = pending.slice(0, 20);
    options.forEach(item => choose.addAction(`${dateText(item.date)} · ${item.outfit && item.outfit.outer ? item.outfit.outer : "Outfit del dia"}`));
    choose.addCancelAction("Cancelar");
    const index = await choose.presentAlert();
    const selected = index >= 0 ? options[index] : null;
    if (selected) {
      const alert = new Alert();
      alert.title = `Valoracion · ${dateText(selected.date)}`;
      alert.message = "¿Como has pasado el dia con este conjunto?";
      alert.addAction("🥶 He pasado frio");
      alert.addAction("🥵 He pasado calor");
      alert.addAction("💨 El viento me ha molestado");
      alert.addAction("🌧️ Me he mojado");
      alert.addAction("✅ Todo perfecto");
      alert.addCancelAction("Dejar pendiente");
      const choice = await alert.presentAlert();
      const values = ["frio", "calor", "viento", "lluvia", "perfecto"];
      if (choice >= 0 && choice < values.length) {
        const feedback = values[choice];
        const styleAlert = new Alert();
        styleAlert.title = "¿Te ha gustado la combinacion?";
        styleAlert.message = "Esta respuesta ayuda a priorizar las prendas que te gustan.";
        styleAlert.addAction("😍 Si, me ha gustado");
        styleAlert.addAction("👎 No es mi estilo");
        styleAlert.addAction("No estoy seguro");
        styleAlert.addCancelAction("Omitir");
        const styleChoice = await styleAlert.presentAlert();
        const styleFeedback = styleChoice === 0 ? "liked" : styleChoice === 1 ? "disliked" : null;

        // Leer y actualizar el estado mas reciente dentro del bloqueo para no pisar
        // cambios de historial/perfil efectuados mientras estaban abiertos los dialogos.
        withDataLock(() => {
          const commitHistory = readJSON(historyPath, [], data => Array.isArray(data) && data.every(item => item && typeof item === "object" && !Array.isArray(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ""))));
          if (!Array.isArray(commitHistory) || commitHistory.some(item => !item || typeof item !== "object" || Array.isArray(item) || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))) {
            throw new Error("El historial contiene registros con un formato no valido. No se ha guardado la valoracion.");
          }
          const commitTarget = commitHistory.find(item => item.date === selected.date);
          if (!commitTarget || commitTarget.feedback) throw new Error("Este outfit ya fue valorado en otra ejecucion. No se ha aplicado la valoracion dos veces.");

          const latestProfileData = readJSON(profilePath, {}, data => data && typeof data === "object" && !Array.isArray(data));
          if (!latestProfileData || typeof latestProfileData !== "object" || Array.isArray(latestProfileData)) throw new Error("El perfil personal no tiene un formato valido. No se ha guardado la valoracion.");
          const committedProfile = {
            thermalBias: 0, windBias: 0, rainSensitivity: 0, ratingsCount: 0,
            favoriteItemIds: [], dislikedItemIds: [], lastUpdated: null,
            ...latestProfileData
          };

          if (feedback === "frio") committedProfile.thermalBias = Math.min(4, Number(committedProfile.thermalBias || 0) + 0.8);
          if (feedback === "calor") committedProfile.thermalBias = Math.max(-4, Number(committedProfile.thermalBias || 0) - 0.8);
          if (feedback === "viento") committedProfile.windBias = Math.min(3, Number(committedProfile.windBias || 0) + 1);
          if (feedback === "lluvia") committedProfile.rainSensitivity = Math.min(3, Number(committedProfile.rainSensitivity || 0) + 1);
          if (feedback === "perfecto") {
            committedProfile.thermalBias = Number(committedProfile.thermalBias || 0) * 0.75;
            committedProfile.windBias = Math.max(0, Number(committedProfile.windBias || 0) - 1);
            committedProfile.rainSensitivity = Math.max(0, Number(committedProfile.rainSensitivity || 0) - 1);
          }

          commitTarget.feedback = feedback;
          commitTarget.feedbackAt = new Date().toISOString();
          commitTarget.styleFeedback = styleFeedback;
          if (styleFeedback) {
            const ids = (commitTarget.wardrobeSelection || []).map(item => item.id).filter(Boolean);
            committedProfile.favoriteItemIds = Array.isArray(committedProfile.favoriteItemIds) ? committedProfile.favoriteItemIds : [];
            committedProfile.dislikedItemIds = Array.isArray(committedProfile.dislikedItemIds) ? committedProfile.dislikedItemIds : [];
            if (styleFeedback === "liked") {
              committedProfile.favoriteItemIds = Array.from(new Set([...committedProfile.favoriteItemIds, ...ids]));
              committedProfile.dislikedItemIds = committedProfile.dislikedItemIds.filter(id => !ids.includes(id));
            } else {
              committedProfile.dislikedItemIds = Array.from(new Set([...committedProfile.dislikedItemIds, ...ids]));
              committedProfile.favoriteItemIds = committedProfile.favoriteItemIds.filter(id => !ids.includes(id));
            }
          }
          committedProfile.ratingsCount = Number(committedProfile.ratingsCount || 0) + 1;
          committedProfile.lastUpdated = new Date().toISOString();
          commitTarget.schemaVersion = 5;
          commitHistory.sort((a, b) => String(a.date).localeCompare(String(b.date)));

          // Diario de transaccion recuperable si la app se interrumpe entre archivos.
          writeJSON(transactionPath, {
            version: 1,
            state: "pending",
            id: `rating_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
            createdAt: new Date().toISOString(),
            profile: committedProfile,
            history: commitHistory.slice(-365)
          });
          writeJSON(profilePath, committedProfile);
          writeJSON(historyPath, commitHistory.slice(-365));
          const committedTransaction = readJSON(transactionPath, null);
          if (committedTransaction) {
            committedTransaction.state = "committed";
            writeJSON(transactionPath, committedTransaction);
          }
          [transactionPath, jsonBackupPath(transactionPath), jsonTempPath(transactionPath)].forEach(path => { if (fm.fileExists(path)) fm.remove(path); });
        });
        await showInfo("Valoracion guardada", `Se ha actualizado ${dateText(selected.date)}. El conjunto ya no aparecera como pendiente.`);
      }
    }
  }
} catch (error) {
  await showInfo("No se pudo guardar la valoracion", error && error.message ? error.message : String(error));
}
Script.complete();
