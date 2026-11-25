// VER OUTFIT HOY - Scriptable V5.3.0 · base V5.2; outfit, favoritos, fotos y avisos AEMET.
const fm = FileManager.local();
const root = fm.documentsDirectory();
const path = fm.joinPath(root, "ropa_diaria_history.json");
const profilePath = fm.joinPath(root, "ropa_diaria_profile.json");
const historyPath = path;
function esc(value) {
  return String(value ?? "—").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
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

function readHistory() {
  const value = readJSON(path, [], data => Array.isArray(data) && data.every(item => item && typeof item === "object" && !Array.isArray(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ""))));
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || Array.isArray(item) || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))) {
    throw new Error("El historial contiene registros con un formato no valido. No se ha modificado.");
  }
  return value;
}

function dateText(value) {
  try {
    const [y,m,d] = value.split("-").map(Number);
    return new Date(y,m-1,d,12).toLocaleDateString("es-ES", { weekday:"long", day:"numeric", month:"long" });
  } catch (_) { return value; }
}

recoverDataTransaction();
const history = readHistory();
const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
const report = history.find(item => item.date === todayKey) || null;

if (!report) {
  const alert = new Alert();
  alert.title = "Todavia no hay outfit";
  alert.message = "Todavia no hay una recomendacion guardada para hoy. Ejecuta Ropa diaria para generar el outfit. Puedes consultar los dias anteriores desde Historial ropa.";
  alert.addAction("Aceptar");
  await alert.presentAlert();
} else {
  const outfit = report.outfit || {};
  const feedbackLabels = { frio: "🥶 Pasaste frio", calor: "🥵 Pasaste calor", viento: "💨 Viento molesto", lluvia: "🌧️ Te mojaste", perfecto: "✅ Todo perfecto" };
  const feedbackText = report.feedback ? feedbackLabels[report.feedback] || "Valorado" : "Pendiente de valorar";
  const variantNumber = Math.max(1, Math.floor(Number(report.outfitVariant) || 1));
  const variantLabel = variantNumber > 1 ? ` · Alternativa ${variantNumber}` : "";
  const preferenceLabels = { friolero: "Friolero", normal: "Normal", caluroso: "Caluroso" };
  const preferenceText = preferenceLabels[report.thermalPreference] || "Normal";
  const selectedBySlot = {};
  (report.wardrobeSelection || []).forEach(item => { selectedBySlot[item.slot] = item; });

  function imageDataFor(item) {
    try {
      if (!item || !item.imageFile) return "";
      const imagePath = fm.joinPath(fm.documentsDirectory(), item.imageFile);
      if (!fm.fileExists(imagePath)) return "";
      const mime = item.imageMimeType || (String(item.imageFile).toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
      return `data:${mime};base64,${Data.fromFile(imagePath).toBase64String()}`;
    } catch (error) {
      console.warn(`No se pudo cargar la foto de ${item.name}: ${error}`);
      return "";
    }
  }

  const pieces = [
    ["👕", "Capa base", outfit.base, "base"],
    ["🧶", "Capa intermedia", outfit.mid, "mid"],
    ["🧥", "Capa exterior", outfit.outer, "outer"],
    ["👖", "Pantalon", outfit.lower, "lower"],
    ["👟", "Calzado", outfit.shoes, "shoes"],
    ["🎒", "Accesorios", (outfit.accessories || []).join(" · "), "accessories"]
  ];
  const cards = pieces.map(([icon,title,value,slot]) => {
    const selected = selectedBySlot[slot];
    const imageData = selected ? imageDataFor(selected) : "";
    const image = imageData
      ? `<img class="wardrobe-photo" src="${imageData}" alt="${esc(selected.name)}">`
      : `<div class="icon">${icon}</div>`;
    const meta = selected
      ? `${esc(selected.color || selected.category)} · ${selected.warmthLevel === 3 ? "Gruesa" : selected.warmthLevel === 1 ? "Fina" : "Media"}`
      : "";
    return `<article class="piece">${image}<div><small>${esc(title)}</small><strong>${esc(value)}</strong>${meta ? `<span class="piece-meta">${meta}</span>` : ""}</div></article>`;
  }).join("");
  const wardrobeNotice = report.wardrobeEnabled
    ? `<div class="wardrobe-notice">Armario inteligente · ${Number((report.wardrobeSelection || []).length)} prendas seleccionadas de tu ropa guardada.</div>`
    : `<div class="wardrobe-notice">Recomendacion general · Añade prendas en “Mi armario” para utilizar tu ropa real.</div>`;
  const periods = (report.periods || []).map(p => `<article class="period"><header><strong>${esc(p.name)}</strong><span>${esc(p.time)}</span></header><div class="temp">${p.temperature == null ? "—" : Math.round(p.temperature)}°C <small>sensacion ${p.feels == null ? "—" : Math.round(p.feels)}°C</small></div><div class="meta">${esc(p.weather)} · Viento ${p.wind == null ? "—" : Math.round(p.wind)} km/h · Rachas ${p.gusts == null ? "—" : Math.round(p.gusts)} km/h · Lluvia ${p.rainProbability == null ? "—" : Math.round(p.rainProbability)}%</div></article>`).join("");
  const notes = (report.notes || []).map(item => `<li>${esc(item)}</li>`).join("");
  const alertStyles = {
    amarillo: { label: "AVISO AMARILLO · PELIGRO BAJO", color: "#e2b12f", bg: "#3a321b", advice: "Estate atento y consulta la evolucion del aviso." },
    naranja: { label: "AVISO NARANJA · PELIGRO IMPORTANTE", color: "#f08a38", bg: "#422a1c", advice: "Toma precauciones y revisa las indicaciones oficiales." },
    rojo: { label: "AVISO ROJO · PELIGRO EXTRAORDINARIO", color: "#f05252", bg: "#421f25", advice: "Actua segun las autoridades y evita desplazamientos no necesarios." }
  };
  const warningCards = (report.weatherAlerts || []).map(alert => {
    const style = alertStyles[alert.level] || alertStyles.amarillo;
    const area = alert.area ? `<p><strong>Zona:</strong> ${esc(alert.area)}</p>` : "";
    const expiry = alert.expires ? `<p><strong>Vigente hasta:</strong> ${esc(new Date(alert.expires).toLocaleString("es-ES"))}</p>` : `<p>La hora de caducidad no se pudo verificar; consulta AEMET.</p>`;
    const onset = alert.onset ? `<p><strong>Inicio:</strong> ${esc(new Date(alert.onset).toLocaleString("es-ES"))}</p>` : "";
    return `<article class="warning" style="--warning:${style.color};--warning-bg:${style.bg}"><div class="warning-label">⚠️ ${style.label}</div><strong>${esc(alert.title)}</strong>${area}<p>${esc(alert.description || style.advice)}</p>${onset}${expiry}<a href="${esc(alert.url || "https://www.aemet.es/es/eltiempo/prediccion/avisos")}">Consultar detalle en AEMET ↗</a></article>`;
  }).join("");
  const aemetCheckedLabel = report.aemetCheckedAt ? ` · Consulta: ${esc(new Date(report.aemetCheckedAt).toLocaleString("es-ES"))}` : "";
  const warningStatus = report.aemetAlertStatus === "unavailable"
    ? `<div class="warning warning-unknown">No se pudieron verificar los avisos de AEMET. No interpretes esto como ausencia de riesgo.${aemetCheckedLabel} <a href="https://www.aemet.es/es/eltiempo/prediccion/avisos">Consultar AEMET ↗</a></div>`
    : report.aemetAlertStatus === "partial"
      ? `<div class="warning warning-unknown">La comprobacion de AEMET ha sido parcial. Podria faltar algun aviso; consulta la fuente oficial.${aemetCheckedLabel} <a href="https://www.aemet.es/es/eltiempo/prediccion/avisos">Consultar AEMET ↗</a></div>${warningCards}`
      : report.aemetAlertStatus === "ok"
        ? warningCards ? `${warningCards}<div class="tag">Consulta AEMET${aemetCheckedLabel}</div>` : `<div class="no-warning">No se muestran avisos activos en el canal regional configurado (${esc(report.aemetRegionName || "AEMET")}).${aemetCheckedLabel}</div>`
        : `<div class="warning warning-unknown">El estado de AEMET no esta verificado. Consulta la fuente oficial antes de interpretar que no hay avisos. <a href="https://www.aemet.es/es/eltiempo/prediccion/avisos">Consultar AEMET ↗</a></div>`;
  const weatherStatusBanner = report.weatherDataStatus === "cache"
    ? `<div class="warning warning-unknown">⚠️ Se esta mostrando una prevision guardada hace ${Number(report.weatherAgeMinutes || 0)} minutos porque Open-Meteo no ha respondido. No es una actualizacion en directo. Comprueba la prevision actual antes de salir.</div>`
    : "";
  const weatherTimestamp = report.weatherFetchedAt ? `Datos meteorologicos: ${esc(new Date(report.weatherFetchedAt).toLocaleString("es-ES"))}` : "";
  const favoriteRestoreNotice = report.manualFavoriteRestore
    ? `<div class="favorite-notice">❤️ Conjunto recuperado de tus favoritos: ${esc(report.manualFavoriteRestore.favoriteName || "Outfit guardado")}. La prevision mostrada corresponde a hoy; revisa que la ropa siga siendo adecuada.</div>`
    : "";
  const favoriteActions = `<section class="favorite-actions"><a class="favorite-save" href="scriptable:///run/Mis%20outfits%20favoritos?mode=save">♡ Guardar en favoritos</a><a class="favorite-list" href="scriptable:///run/Mis%20outfits%20favoritos?mode=list">Ver mis outfits favoritos</a></section>`;
  const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:22px 16px 36px;background:#101318;color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif}.wrap{max-width:560px;margin:auto}.eyebrow{color:#92a0b1;text-transform:uppercase;letter-spacing:.12em;font-size:11px}h1{font-size:29px;margin:9px 0 4px}.date{color:#aab2bf;font-size:14px}.status{display:inline-block;margin-top:10px;padding:7px 11px;border-radius:30px;background:#29323d;color:#dce6ef;font-size:12px}.hero{margin:18px 0;padding:18px;border-radius:20px;background:#202b38}.hero strong{font-size:35px}.hero p{margin:5px 0 0;color:#c3ccd7;font-size:13px}.section{margin:24px 0 10px;font-size:17px}.piece,.period{display:flex;gap:13px;align-items:center;background:#1b2028;border:1px solid #303741;border-radius:16px;padding:14px;margin:9px 0}.icon{font-size:25px;width:34px;text-align:center}.piece small{display:block;color:#98a5b4;font-size:11px;margin-bottom:4px}.piece strong{font-size:14px;line-height:1.45}.wardrobe-photo{width:76px;height:86px;object-fit:contain;background:#29323d;border-radius:12px}.piece-meta{display:block;color:#92a0b1;font-size:11px;margin-top:5px}.wardrobe-notice{padding:12px 14px;background:#243447;border-radius:14px;color:#cbd8e7;font-size:12px;line-height:1.5;margin:12px 0}.period{display:block}.period header{display:flex;justify-content:space-between;color:#aab2bf;font-size:12px}.period header strong{color:#f4f5f7}.temp{font-size:23px;font-weight:750;margin:12px 0 5px}.temp small,.meta{color:#aab2bf;font-size:12px;font-weight:400}.notes{padding:15px 15px 15px 32px;background:#202b38;border-radius:16px;color:#d6dee8;font-size:13px;line-height:1.6}.foot{color:#718093;font-size:11px;text-align:center;margin-top:22px}.warning{padding:15px;border:1px solid var(--warning);background:var(--warning-bg);border-radius:16px;margin:12px 0;color:#f6f3ed}.warning-label{font-size:11px;font-weight:800;letter-spacing:.05em;color:var(--warning);margin-bottom:7px}.warning strong{font-size:15px}.warning p{font-size:12px;line-height:1.5;color:#e4e7eb}.warning a,.warning-unknown a{color:inherit;text-decoration:underline;font-size:12px}.warning-unknown{padding:14px;border:1px solid #b78b42;background:#342d20;border-radius:14px;color:#f5dfb5;font-size:12px;line-height:1.5;margin:12px 0}.no-warning{padding:12px;background:#1e2d2a;border-radius:13px;color:#bdd9cf;font-size:12px;margin:12px 0}.roulette{display:block;width:100%;padding:14px;border:0;border-radius:15px;background:#e0b33c;color:#1a1a1a;font-size:15px;font-weight:800;text-align:center;text-decoration:none;margin:14px 0}.favorite-actions{display:grid;grid-template-columns:1fr;gap:9px;margin:14px 0}.favorite-save,.favorite-list{display:block;width:100%;padding:14px;border-radius:15px;text-align:center;text-decoration:none;font-size:14px;font-weight:750}.favorite-save{background:#e8a4b1;color:#28151a}.favorite-list{background:#293847;color:#edf3f8;border:1px solid #405164}.favorite-notice{padding:12px 14px;background:#342b25;border:1px solid #8a6943;border-radius:14px;color:#f1d6ae;font-size:12px;line-height:1.55;margin:12px 0}.tag{font-size:11px;color:#bdc9d5;margin-top:4px}
  </style></head><body><main class="wrap"><div class="eyebrow">Ropa diaria V5.3.0 · ${esc(report.place || "GPS")}</div><h1>Tu outfit de hoy</h1><div class="date">${esc(dateText(report.date))}${esc(variantLabel)} · ${esc(report.transport === "autobus" ? "Autobus" : report.transport === "andando" ? "Andando" : "Coche")} · Perfil termico: ${esc(preferenceText)} · Estilo: ${esc(report.stylePreference || "mixto")}</div><div class="status">${esc(feedbackText)}</div>${favoriteRestoreNotice}<section class="hero"><strong>${report.minTemp == null ? "—" : Math.round(report.minTemp)}° / ${report.maxTemp == null ? "—" : Math.round(report.maxTemp)}°</strong><p>Sensacion durante tus franjas: ${report.feelsMin == null ? "—" : Math.round(report.feelsMin)}°–${report.feelsMax == null ? "—" : Math.round(report.feelsMax)}° · Rachas maximas ${report.gusts == null ? "—" : Math.round(report.gusts)} km/h</p></section>${weatherStatusBanner}<div class="tag">${weatherTimestamp}</div><h2 class="section">Avisos meteorologicos oficiales</h2>${warningStatus}<h2 class="section">Prendas recomendadas</h2>${wardrobeNotice}${cards}${report.wardrobeEnabled && !report.feedback ? `<a class="roulette" href="scriptable:///run/Ropa%20diaria?mode=alternate">🎰 Probar otra combinacion</a>` : ""}${favoriteActions}<h2 class="section">A lo largo del dia</h2>${periods}<h2 class="section">Consejos</h2><ul class="notes">${notes || "<li>Sin consejos adicionales.</li>"}</ul><div class="foot">Prevision Open-Meteo · Avisos oficiales AEMET (canal regional configurado) · Datos guardados localmente en Scriptable.</div></main></body></html>`;
  const web = new WebView();
  await web.loadHTML(html);
  await web.present(true);
}
Script.complete();
