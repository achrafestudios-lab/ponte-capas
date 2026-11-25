// CONFIGURAR TRANSPORTE - V5.3.0 · base V5.2
// Guarda transporte, preferencia termica, estilo, hora de valoracion y comunidad AEMET.

const fm = FileManager.local();
const root = fm.documentsDirectory();
const path = fm.joinPath(root, "ropa_diaria_config.json");
const regions = [
  ["61", "Andalucia"], ["62", "Aragon"], ["63", "Asturias"], ["64", "Islas Baleares"],
  ["65", "Canarias"], ["66", "Cantabria"], ["67", "Castilla y Leon"], ["68", "Castilla-La Mancha"],
  ["69", "Cataluna"], ["70", "Extremadura"], ["71", "Galicia"], ["72", "Comunidad de Madrid"],
  ["73", "Region de Murcia"], ["74", "Navarra"], ["75", "Pais Vasco"], ["76", "La Rioja"],
  ["77", "Comunidad Valenciana"], ["78", "Ceuta"], ["79", "Melilla"]
];
const styles = [
  ["casual", "Casual"], ["urbano", "Urbano / streetwear"], ["deportivo", "Deportivo"],
  ["minimalista", "Minimalista"], ["elegante", "Elegante"], ["mixto", "Mezcla / sin preferencia"]
];

function jsonBackupPath(filePath) { return `${filePath}.bak`; }
function jsonTempPath(filePath) { return `${filePath}.tmp`; }

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
    } catch (_) { stale = true; }
    if (!stale) throw new Error("Ropa diaria esta guardando datos en otra operacion. Vuelve a intentarlo en unos segundos.");
    fm.remove(lockPath);
  }
  fm.writeString(lockPath, JSON.stringify({token, createdAt: Date.now()}));
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
function restoreJSONFile(filePath, raw) {
  const tempPath = jsonTempPath(filePath) + ".restore";
  JSON.parse(raw);
  fm.writeString(tempPath, raw);
  JSON.parse(fm.readString(tempPath));
  replaceFileFromTemp(tempPath, filePath, content => JSON.parse(content));
  JSON.parse(fm.readString(filePath));
}
function readConfig() {
  const backupPath = jsonBackupPath(path);
  if (fm.fileExists(path)) {
    try {
      const value = JSON.parse(fm.readString(path));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("La configuracion no tiene un objeto valido.");
      return value;
    } catch (primaryError) {
      if (!fm.fileExists(backupPath)) throw new Error(`La configuracion esta danada y no tiene copia valida. No se ha sobrescrito. ${primaryError.message || primaryError}`);
      const raw = fm.readString(backupPath);
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("La copia de seguridad de la configuracion tampoco es valida.");
      restoreJSONFile(path, raw);
      return value;
    }
  }
  if (fm.fileExists(backupPath)) {
    const raw = fm.readString(backupPath);
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("La copia de seguridad de la configuracion no es valida.");
    restoreJSONFile(path, raw);
    return value;
  }
  return {};
}
function writeConfig(value) {
  return withDataLock(() => {
  const raw = JSON.stringify(value, null, 2);
  JSON.parse(raw);
  const backupPath = jsonBackupPath(path);
  const tempPath = jsonTempPath(path);
  if (fm.fileExists(tempPath)) fm.remove(tempPath);
  fm.writeString(tempPath, raw);
  JSON.parse(fm.readString(tempPath));
  if (fm.fileExists(path)) {
    const oldRaw = fm.readString(path);
    JSON.parse(oldRaw);
    fm.writeString(backupPath, oldRaw);
    JSON.parse(fm.readString(backupPath));
  }
  try {
    replaceFileFromTemp(tempPath, path, content => JSON.parse(content));
    JSON.parse(fm.readString(path));
  } catch (error) {
    if (fm.fileExists(tempPath)) fm.remove(tempPath);
    if (!fm.fileExists(path) && fm.fileExists(backupPath)) fm.writeString(path, fm.readString(backupPath));
    throw new Error(`No se pudo guardar la configuracion. Se conserva la copia de seguridad. ${error.message || error}`);
  }
  });
}

async function choose(title, message, options, currentIndex) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  options.forEach(option => alert.addAction(option));
  alert.addCancelAction(`Mantener actual (${options[currentIndex] || options[0]})`);
  const result = await alert.presentAlert();
  return result < 0 ? currentIndex : result;
}

const current = readConfig();
const config = {
  transport: ["coche", "autobus", "andando"].includes(current.transport) ? current.transport : "coche",
  thermalPreference: ["friolero", "normal", "caluroso"].includes(current.thermalPreference) ? current.thermalPreference : "normal",
  stylePreference: styles.some(item => item[0] === current.stylePreference) ? current.stylePreference : "mixto",
  ratingTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(current.ratingTime || "") ? current.ratingTime : "20:30",
  aemetRegionCode: regions.some(item => item[0] === String(current.aemetRegionCode)) ? String(current.aemetRegionCode) : "62",
  aemetRegionName: current.aemetRegionName || "Aragon"
};

const transportOptions = ["🚗 Coche", "🚌 Autobus", "🚶 Andando"];
let index = await choose("Transporte habitual", "¿Como sueles desplazarte?", transportOptions,
  ["coche", "autobus", "andando"].indexOf(config.transport));
config.transport = ["coche", "autobus", "andando"][index];

const thermalOptions = ["🥶 Soy friolero", "🙂 Normal", "🔥 Soy caluroso"];
index = await choose("Sensibilidad termica", "Ajusta la cantidad de abrigo.", thermalOptions,
  ["friolero", "normal", "caluroso"].indexOf(config.thermalPreference));
config.thermalPreference = ["friolero", "normal", "caluroso"][index];

index = await choose("Tu estilo", "¿Que estilo quieres priorizar al combinar tus prendas? Puedes cambiarlo cuando quieras.",
  styles.map(item => item[1]), Math.max(0, styles.findIndex(item => item[0] === config.stylePreference)));
config.stylePreference = styles[index][0];

const timeAlert = new Alert();
timeAlert.title = "Hora para valorar el outfit";
timeAlert.message = "Escribe la hora del recordatorio en formato 24 h, por ejemplo 20:30.";
timeAlert.addTextField("HH:MM", config.ratingTime);
timeAlert.addAction("Guardar hora");
timeAlert.addCancelAction(`Mantener ${config.ratingTime}`);
if (await timeAlert.presentAlert() === 0) {
  const time = timeAlert.textFieldValue(0).trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) config.ratingTime = time;
  else {
    const warning = new Alert();
    warning.title = "Hora no valida";
    warning.message = "Se mantiene la hora anterior: " + config.ratingTime;
    warning.addAction("Aceptar");
    await warning.presentAlert();
  }
}

const regionOptions = regions.map(item => item[1]);
index = await choose("Avisos oficiales AEMET", "Selecciona la comunidad autonoma cuyos avisos quieres consultar. Si viajas a otra comunidad, cambia este ajuste.",
  regionOptions, Math.max(0, regions.findIndex(item => item[0] === config.aemetRegionCode)));
config.aemetRegionCode = regions[index][0];
config.aemetRegionName = regions[index][1];
config.updatedAt = new Date().toISOString();
writeConfig(config);

const done = new Alert();
done.title = "Preferencias guardadas";
done.message = `Transporte: ${config.transport}\nSensibilidad: ${config.thermalPreference}\nEstilo: ${styles.find(item => item[0] === config.stylePreference)[1]}\nRecordatorio: ${config.ratingTime}\nAvisos AEMET: ${config.aemetRegionName}`;
done.addAction("Aceptar");
await done.presentAlert();
Script.complete();
