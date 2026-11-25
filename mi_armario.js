// MI ARMARIO - Scriptable V5.3.0 · base V5.2
// Groq es el proveedor principal; Gemini actua como fallback automatico.

const APP_NAME = "Mi armario";
const GROQ_MODEL = "qwen/qwen3.8-27b";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_KEYCHAIN_KEY = "ropa_diaria_groq_api_key";
const MODEL = "gemini-3.8-flash";
const KEYCHAIN_KEY = "ropa_diaria_gemini_api_key";
const REMOVE_BG_KEYCHAIN_KEY = "ropa_diaria_removebg_api_key";
const INVENTORY_FILE = "ropa_diaria_wardrobe.json";
const BACKUP_INVENTORY_FILE = "ropa_diaria_wardrobe.backup.json";
const TEMP_INVENTORY_FILE = "ropa_diaria_wardrobe.tmp.json";
const PENDING_PHOTO_FILE = "pendiente_analisis.jpg";
const PENDING_META_FILE = "pendiente_analisis.json";
const PENDING_RESULT_FILE = "pendiente_analisis_resultado.json";
const AI_MAX_ATTEMPTS = 2;
const GROQ_TIMEOUT_SECONDS = 45;
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_TIMEOUT_SECONDS = 45;
const GEMINI_MAX_IMAGE_BASE64_CHARS = 15000000;
const WARDROBE_FOLDER = "ropa_diaria_armario";
const PHOTO_FOLDER = "photos";

const CATEGORIES = [
  ["camiseta", "Camiseta"], ["camisa", "Camisa"], ["polo", "Polo"], ["termica", "Camiseta termica"],
  ["sudadera", "Sudadera"], ["jersey", "Jersey"], ["forro_polar", "Forro polar"],
  ["chaqueta", "Chaqueta"], ["abrigo", "Abrigo"], ["cortavientos", "Cortavientos"], ["chubasquero", "Chubasquero"],
  ["pantalon", "Pantalon"], ["vaqueros", "Vaqueros"], ["bermudas", "Bermudas"],
  ["zapatillas", "Zapatillas"], ["zapatos", "Zapatos"], ["botas", "Botas"],
  ["falda", "Falda"], ["vestido", "Vestido"], ["accesorio", "Accesorio"], ["otro", "Otro"]
];

const fm = FileManager.local();
const root = fm.documentsDirectory();
const wardrobeDir = fm.joinPath(root, WARDROBE_FOLDER);
const photosDir = fm.joinPath(wardrobeDir, PHOTO_FOLDER);
const inventoryPath = fm.joinPath(root, INVENTORY_FILE);

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

const backupInventoryPath = fm.joinPath(root, BACKUP_INVENTORY_FILE);
const tempInventoryPath = fm.joinPath(root, TEMP_INVENTORY_FILE);
const pendingPhotoPath = fm.joinPath(wardrobeDir, PENDING_PHOTO_FILE);
const pendingMetaPath = fm.joinPath(wardrobeDir, PENDING_META_FILE);
const pendingResultPath = fm.joinPath(wardrobeDir, PENDING_RESULT_FILE);
let inventoryRecoveredFromBackup = false;

function ensureFolders() {
  if (!fm.fileExists(wardrobeDir)) fm.createDirectory(wardrobeDir, true);
  if (!fm.fileExists(photosDir)) fm.createDirectory(photosDir, true);
}

function parseInventoryContent(raw, sourceName) {
  const value = JSON.parse(raw);
  const items = Array.isArray(value) ? value : (value && Array.isArray(value.items) ? value.items : null);
  if (!items) throw new Error(`${sourceName}: el formato del armario no es valido.`);
  if (items.some(item => !item || typeof item !== "object" || Array.isArray(item) || !item.id || !item.category)) {
    throw new Error(`${sourceName}: hay registros de prendas danados o incompletos.`);
  }
  const ids = items.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${sourceName}: hay identificadores de prendas duplicados.`);
  return items;
}

function readInventory() {
  inventoryRecoveredFromBackup = false;
  if (fm.fileExists(inventoryPath)) {
    try {
      return parseInventoryContent(fm.readString(inventoryPath), "Armario principal");
    } catch (primaryError) {
      console.error(`No se pudo leer el armario principal: ${primaryError.message || primaryError}`);
      if (fm.fileExists(backupInventoryPath)) {
        try {
          const recovered = parseInventoryContent(fm.readString(backupInventoryPath), "Copia de seguridad");
          inventoryRecoveredFromBackup = true;
          return recovered;
        } catch (backupError) {
          throw new Error(`El armario principal y su copia de seguridad no se pueden leer. No se ha sobrescrito ningun dato. Principal: ${primaryError.message || primaryError}. Copia: ${backupError.message || backupError}.`);
        }
      }
      throw new Error(`No se puede leer el archivo del armario y no existe una copia de seguridad valida. No se ha creado un armario vacio para evitar perder tus prendas. Detalle: ${primaryError.message || primaryError}`);
    }
  }

  if (fm.fileExists(backupInventoryPath)) {
    try {
      inventoryRecoveredFromBackup = true;
      return parseInventoryContent(fm.readString(backupInventoryPath), "Copia de seguridad");
    } catch (error) {
      throw new Error(`No se encontro el armario principal y la copia de seguridad tampoco se puede leer. No se han borrado datos. Detalle: ${error.message || error}`);
    }
  }
  return [];
}

function saveInventory(items) {
  return withDataLock(() => {
  if (!Array.isArray(items)) throw new Error("No se puede guardar el armario: la lista de prendas no es valida.");
  if (items.some(item => !item || typeof item !== "object" || Array.isArray(item) || !item.id || !item.category)) {
    throw new Error("No se puede guardar el armario: cada prenda debe tener identificador y categoria.");
  }
  const ids = items.map(item => String(item.id));
  if (new Set(ids).size !== ids.length) throw new Error("No se puede guardar el armario: hay identificadores de prendas duplicados.");

  const payload = JSON.stringify({ schemaVersion: 5, updatedAt: new Date().toISOString(), items }, null, 2);
  JSON.parse(payload);

  // Escribe y valida el temporal antes de tocar el archivo principal.
  if (fm.fileExists(tempInventoryPath)) fm.remove(tempInventoryPath);
  fm.writeString(tempInventoryPath, payload);
  JSON.parse(fm.readString(tempInventoryPath));

  if (fm.fileExists(inventoryPath)) {
    const currentContent = fm.readString(inventoryPath);
    let currentIsValid = true;
    try { parseInventoryContent(currentContent, "Armario actual"); } catch (_) { currentIsValid = false; }
    if (currentIsValid) {
      // Si no se puede refrescar la copia, no se toca el archivo principal.
      fm.writeString(backupInventoryPath, currentContent);
      parseInventoryContent(fm.readString(backupInventoryPath), "Copia de seguridad");
    } else {
      if (!fm.fileExists(backupInventoryPath)) {
        if (fm.fileExists(tempInventoryPath)) fm.remove(tempInventoryPath);
        throw new Error("No se ha actualizado el armario: el archivo principal esta danado y no existe una copia de seguridad.");
      }
      parseInventoryContent(fm.readString(backupInventoryPath), "Copia de seguridad");
    }
  }

  try {
    replaceFileFromTemp(tempInventoryPath, inventoryPath, content => parseInventoryContent(content, "Armario actualizado"));
    parseInventoryContent(fm.readString(inventoryPath), "Armario actualizado");
  } catch (error) {
    if (fm.fileExists(tempInventoryPath)) fm.remove(tempInventoryPath);
    if (!fm.fileExists(inventoryPath) && fm.fileExists(backupInventoryPath)) {
      try { fm.writeString(inventoryPath, fm.readString(backupInventoryPath)); } catch (restoreError) { console.error(restoreError); }
    }
    throw new Error(`No se pudo guardar el armario. Se ha conservado la copia de seguridad. ${error.message || error}`);
  }
  });
}

function hasPendingPhoto() {
  return fm.fileExists(pendingPhotoPath);
}

function savePendingPhoto(jpegData, image) {
  ensureFolders();
  const metadata = {
    id: `prenda_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
    createdAt: new Date().toISOString(),
    width: Number(image && image.size ? image.size.width : 0) || null,
    height: Number(image && image.size ? image.size.height : 0) || null
  };
  fm.write(pendingPhotoPath, jpegData);
  fm.writeString(pendingMetaPath, JSON.stringify(metadata, null, 2));
  if (fm.fileExists(pendingResultPath)) fm.remove(pendingResultPath);
}

function readPendingMetadata() {
  if (!fm.fileExists(pendingMetaPath)) {
    const fallback = { id: `prenda_${Date.now()}_${Math.floor(Math.random() * 1000000)}`, createdAt: new Date().toISOString() };
    fm.writeString(pendingMetaPath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    const value = JSON.parse(fm.readString(pendingMetaPath));
    if (value && typeof value.id === "string" && value.id) return value;
  } catch (error) {
    console.warn(`No se pudo leer la informacion de la foto pendiente: ${error.message || error}`);
  }
  const fallback = { id: `prenda_${Date.now()}_${Math.floor(Math.random() * 1000000)}`, createdAt: new Date().toISOString() };
  fm.writeString(pendingMetaPath, JSON.stringify(fallback, null, 2));
  return fallback;
}

function clearPendingPhoto() {
  if (fm.fileExists(pendingPhotoPath)) fm.remove(pendingPhotoPath);
  if (fm.fileExists(pendingMetaPath)) fm.remove(pendingMetaPath);
  if (fm.fileExists(pendingResultPath)) fm.remove(pendingResultPath);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function categoryLabel(category) {
  const match = CATEGORIES.find(item => item[0] === category);
  return match ? match[1] : "Otro";
}

// Agrupaciones de visualizacion. No cambian la categoria almacenada en cada prenda.
const GALLERY_CATEGORY_GROUPS = [
  { id: "camisetas", label: "Camisetas", categories: ["camiseta", "camisa", "polo", "termica"] },
  { id: "sudaderas", label: "Sudaderas", categories: ["sudadera", "jersey", "forro_polar"] },
  { id: "pantalones", label: "Pantalones", categories: ["pantalon", "vaqueros", "bermudas"] },
  { id: "abrigos", label: "Abrigos", categories: ["chaqueta", "abrigo", "cortavientos", "chubasquero"] },
  { id: "calzado", label: "Calzado", categories: ["zapatillas", "zapatos", "botas"] },
  { id: "accesorios", label: "Accesorios", categories: ["accesorio"] },
  { id: "otros", label: "Otros", categories: ["falda", "vestido", "otro"] }
];

function galleryGroupForCategory(category) {
  const normalized = normalizeCategory(category);
  const group = GALLERY_CATEGORY_GROUPS.find(entry => entry.categories.includes(normalized));
  return group ? group.id : "otros";
}

function normalizeCategory(value) {
  const raw = String(value || "").toLowerCase().trim().replace(/[áà]/g, "a").replace(/[é]/g, "e").replace(/[í]/g, "i").replace(/[ó]/g, "o").replace(/[ú]/g, "u").replace(/[ -]+/g, "_");
  if (CATEGORIES.some(item => item[0] === raw)) return raw;
  const aliases = [
    ["camiseta", /camiseta|t_shirt|tee/], ["camisa", /camisa|shirt/], ["polo", /polo/], ["termica", /termica|thermal/],
    ["sudadera", /sudadera|hoodie|sweatshirt/], ["jersey", /jersey|sueter|sweater/], ["forro_polar", /polar|fleece/],
    ["chaqueta", /chaqueta|jacket/], ["abrigo", /abrigo|coat/], ["cortavientos", /cortavientos|windbreaker/], ["chubasquero", /chubasquero|impermeable|raincoat/],
    ["vaqueros", /vaquero|jean/], ["pantalon", /pantalon|trouser|pant/], ["bermudas", /bermuda|short/],
    ["zapatillas", /zapatilla|sneaker/], ["botas", /bota|boot/], ["zapatos", /zapato|shoe/],
    ["falda", /falda|skirt/], ["vestido", /vestido|dress/], ["accesorio", /accesorio|bufanda|gorro|guante|scarf|hat/]
  ];
  const found = aliases.find(([, pattern]) => pattern.test(raw));
  return found ? found[0] : "otro";
}

async function choosePhoto() {
  const alert = new Alert();
  alert.title = "Añadir fotografía";
  alert.message = "¿De dónde quieres obtener la foto de la prenda?";
  alert.addAction("📷 Hacer foto con la camara");
  alert.addAction("🖼️ Elegir de la galeria");
  alert.addCancelAction("Cancelar");
  const choice = await alert.presentAlert();
  if (choice === 0) return await Photos.fromCamera();
  if (choice === 1) return await Photos.fromLibrary();
  return null;
}

function resizeForAI(image) {
  const width = Number(image && image.size ? image.size.width : 0);
  const height = Number(image && image.size ? image.size.height : 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("La imagen no tiene unas dimensiones validas. Selecciona otra fotografia.");
  }
  const maxSide = 1100;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  if (scale >= 1) return image;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const context = new DrawContext();
  context.size = new Size(targetWidth, targetHeight);
  context.opaque = true;
  context.respectScreenScale = false;
  context.drawImageInRect(image, new Rect(0, 0, targetWidth, targetHeight));
  return context.getImage();
}

async function configureGroqKey() {
  const exists = Keychain.contains(GROQ_KEYCHAIN_KEY);
  const alert = new Alert();
  alert.title = "Conectar Groq (principal)";
  alert.message = exists
    ? "Ya hay una API Key de Groq guardada. Puedes sustituirla o eliminarla."
    : "Pega tu API Key de GroqCloud. Se guardara en el Keychain de Scriptable, nunca en el codigo.";
  alert.addAction(exists ? "Actualizar API Key" : "Guardar API Key");
  if (exists) alert.addDestructiveAction("Eliminar API Key");
  alert.addCancelAction("Cancelar");
  const choice = await alert.presentAlert();
  if (choice === 0) {
    const input = new Alert();
    input.title = "API Key de Groq";
    input.message = "Crea la clave en console.groq.com/keys. No la compartas ni la envies por el chat.";
    input.addSecureTextField("gsk_...", "");
    input.addAction("Guardar de forma segura");
    input.addCancelAction("Cancelar");
    if (await input.presentAlert() !== 0) return;
    const key = input.textFieldValue(0).trim();
    if (!key.startsWith("gsk_") || key.length < 25) {
      await showMessage("Clave de Groq no valida", "La clave parece incompleta o no tiene el formato habitual gsk_. Vuelve a intentarlo.");
      return;
    }
    Keychain.set(GROQ_KEYCHAIN_KEY, key);
    await showMessage("Groq conectado", "La API Key se ha guardado en el Keychain de Scriptable.");
  } else if (exists && choice === 1) {
    Keychain.remove(GROQ_KEYCHAIN_KEY);
    await showMessage("Clave eliminada", "Groq ya no estara disponible como proveedor principal hasta que configures otra clave.");
  }
}

async function configureGeminiKey() {
  const exists = Keychain.contains(KEYCHAIN_KEY);
  const alert = new Alert();
  alert.title = "Conectar Gemini (fallback)";
  alert.message = exists
    ? "Ya hay una API Key guardada. Puedes sustituirla o eliminarla."
    : "Pega tu API Key de Google AI Studio. Se guardara en el Keychain de Scriptable, no en el codigo.";
  alert.addAction(exists ? "Actualizar API Key" : "Guardar API Key");
  if (exists) alert.addDestructiveAction("Eliminar API Key");
  alert.addCancelAction("Cancelar");
  const choice = await alert.presentAlert();
  if (choice === 0) {
    const input = new Alert();
    input.title = "API Key de Gemini";
    input.message = "Pega la clave creada en Google AI Studio. No la compartas ni la envies por el chat.";
    input.addSecureTextField("AIza...", "");
    input.addAction("Guardar de forma segura");
    input.addCancelAction("Cancelar");
    const result = await input.presentAlert();
    if (result !== 0) return;
    const key = input.textFieldValue(0).trim();
    if (key.length < 20) {
      await showMessage("Clave no valida", "La clave parece incompleta. Vuelve a intentarlo.");
      return;
    }
    Keychain.set(KEYCHAIN_KEY, key);
    await showMessage("Gemini conectado", "La API Key se ha guardado en el Keychain. Gemini se utilizara como fallback si Groq falla.");
  } else if (exists && choice === 1) {
    Keychain.remove(KEYCHAIN_KEY);
    await showMessage("Clave eliminada", "Se ha eliminado la API Key guardada en Scriptable.");
  }
}


async function configureRemoveBgKey() {
  const exists = Keychain.contains(REMOVE_BG_KEYCHAIN_KEY);
  const alert = new Alert();
  alert.title = "Recorte automatico de fondo";
  alert.message = exists
    ? "Hay una clave de remove.bg guardada. Puedes actualizarla o eliminarla. El servicio puede consumir creditos por imagen."
    : "Pega tu API Key de remove.bg para guardar una version PNG transparente de cada prenda. Es un servicio externo con limites/creditos. Sin esta clave, las fotos se guardan con su fondo original.";
  alert.addAction(exists ? "Actualizar clave" : "Configurar clave");
  if (exists) alert.addDestructiveAction("Eliminar clave");
  alert.addCancelAction("Cancelar");
  const choice = await alert.presentAlert();
  if (choice === 0) {
    const input = new Alert();
    input.title = "API Key remove.bg";
    input.addSecureTextField("API Key", "");
    input.addAction("Guardar en Keychain");
    input.addCancelAction("Cancelar");
    if (await input.presentAlert() !== 0) return;
    const key = input.textFieldValue(0).trim();
    if (key.length < 10) return await showMessage("Clave no valida", "La clave parece incompleta.");
    Keychain.set(REMOVE_BG_KEYCHAIN_KEY, key);
    await showMessage("Clave guardada", "La clave de remove.bg se ha guardado en el Keychain de Scriptable.");
  } else if (exists && choice === 1) {
    Keychain.remove(REMOVE_BG_KEYCHAIN_KEY);
    await showMessage("Clave eliminada", "Las nuevas prendas se guardaran con su fondo original.");
  }
}

async function removeImageBackground(jpegData) {
  if (!Keychain.contains(REMOVE_BG_KEYCHAIN_KEY)) throw new Error("No hay una API Key de remove.bg configurada.");
  const request = new Request("https://api.remove.bg/v1.0/removebg");
  request.method = "POST";
  request.timeoutInterval = 90;
  request.headers = { "X-Api-Key": Keychain.get(REMOVE_BG_KEYCHAIN_KEY), "Accept": "image/png" };
  request.addParameterToMultipart("size", "preview");
  request.addParameterToMultipart("format", "png");
  request.addParameterToMultipart("type", "product");
  request.addParameterToMultipart("crop", "true");
  request.addParameterToMultipart("crop_margin", "8%");
  request.addFileDataToMultipart(jpegData, "image/jpeg", "image_file", "ropa.jpg");
  const data = await request.load();
  const status = request.response ? request.response.statusCode : 0;
  if (status !== 200) throw new Error(`remove.bg ha devuelto HTTP ${status || "desconocido"}. Revisa tu clave y los creditos disponibles.`);
  return data;
}

async function askBackgroundRemoval() {
  if (!Keychain.contains(REMOVE_BG_KEYCHAIN_KEY)) return false;
  const alert = new Alert();
  alert.title = "Fondo de la fotografia";
  alert.message = "¿Quieres quitar el fondo y guardar la prenda como PNG transparente? La foto se enviara a remove.bg y puede consumir creditos.";
  alert.addAction("Quitar fondo");
  alert.addAction("Conservar foto original");
  alert.addCancelAction("Cancelar registro");
  const choice = await alert.presentAlert();
  if (choice === -1) return null;
  return choice === 0;
}

async function showMessage(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("Aceptar");
  await alert.presentAlert();
}

function extractJSON(text) {
  let clean = String(text || "").trim();
  clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("El proveedor no ha devuelto un JSON reconocible.");
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch (error) {
    throw new Error(`El proveedor ha devuelto un JSON incorrecto: ${error.message || error}`);
  }
}

function waitMilliseconds(milliseconds) {
  // Scriptable Timer.schedule recibe el intervalo en milisegundos.
  return new Promise(resolve => Timer.schedule(Math.max(0, milliseconds), false, resolve));
}

function responseHeader(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  const key = Object.keys(headers).find(value => value.toLowerCase() === target);
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

function providerMessageFromBody(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    if (value && value.error) return String(value.error.message || value.error || "").slice(0, 500);
    return "";
  } catch (error) {
    return String(raw || "").replace(/\s+/g, " ").slice(0, 250);
  }
}

function createProviderHttpError(provider, status, apiMessage) {
  const name = provider === "Groq" ? "Groq" : "Gemini";
  let explanation;
  switch (status) {
    case 400: explanation = `${name} ha rechazado el formato de la peticion.`; break;
    case 401: explanation = `${name} no ha aceptado la API Key. Comprueba que sea correcta y siga activa.`; break;
    case 403: explanation = `La clave de ${name} no tiene permisos o el proyecto tiene restricciones.`; break;
    case 404: explanation = `${name} no encuentra el modelo o endpoint solicitado.`; break;
    case 413: explanation = `La fotografia es demasiado grande para ${name}. Prueba con una imagen mas pequena.`; break;
    case 429: explanation = `${name} ha alcanzado un limite de uso o peticiones.`; break;
    case 503: explanation = `${name} esta temporalmente saturado o no disponible.`; break;
    case 500: case 502: case 504: explanation = `${name} ha devuelto un error temporal del servidor (HTTP ${status}).`; break;
    default: explanation = `${name} ha devuelto un error HTTP ${status || "desconocido"}.`;
  }
  const error = new Error(`${explanation}${apiMessage ? `\nDetalle del proveedor: ${apiMessage}` : ""}`);
  error.provider = provider;
  error.statusCode = status;
  error.retryable = status === 0 || [408, 425, 429, 500, 502, 503, 504].includes(status);
  return error;
}

function createGeminiHttpError(status, apiMessage) {
  return createProviderHttpError("Gemini", status, apiMessage);
}

function validateGarmentResult(value, provider, model) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La respuesta de IA no contiene una ficha de prenda valida.");
  }
  const name = String(value.name || "").trim();
  const color = String(value.color || "").trim();
  const description = String(value.description || "").trim();
  if (!name || !color || !description) {
    throw new Error("La IA no ha identificado correctamente el nombre, color y descripcion. Puedes volver a analizar la fotografia.");
  }
  return {
    name: name.slice(0, 70),
    category: normalizeCategory(value.category),
    color: color.slice(0, 50),
    pattern: String(value.pattern || "otro").trim().slice(0, 30),
    description: description.slice(0, 350),
    styleTags: Array.isArray(value.styleTags) ? value.styleTags.slice(0, 8) : [],
    provider: String(provider || value.provider || value.analysisProvider || "Gemini").slice(0, 30),
    model: String(model || value.model || value.analysisModel || "").slice(0, 80),
    fallbackFrom: String(value.fallbackFrom || "").slice(0, 30)
  };
}

function prepareImageBase64(jpegData) {
  if (!jpegData || typeof jpegData.toBase64String !== "function") {
    throw new Error("La fotografia no se ha podido preparar para el analisis. Vuelve a seleccionarla.");
  }
  const imageBase64 = jpegData.toBase64String();
  if (!imageBase64 || imageBase64.length < 100) throw new Error("La fotografia esta vacia o no se ha podido convertir a JPEG.");
  if (imageBase64.length > GEMINI_MAX_IMAGE_BASE64_CHARS) throw new Error("La fotografia sigue siendo demasiado grande despues de optimizarla. Selecciona otra imagen.");
  return imageBase64;
}

function garmentPrompt() {
  return `Analiza la fotografia de una sola prenda de ropa. Devuelve exclusivamente un objeto JSON valido con estos campos: name (nombre corto en español), category (elige exactamente uno de estos valores: ${CATEGORIES.map(item => item[0]).join(", ")}), color (color principal en español), pattern (liso, rayas, cuadros, estampado u otro), description (descripcion visual breve), styleTags (array con cero o mas estilos de esta lista: casual, urbano, deportivo, minimalista, elegante). No inventes marca, material ni nivel de abrigo. No deduzcas grosor exacto a partir de la foto. Si no puedes identificar la prenda con suficiente seguridad, usa category "otro". Los styleTags son solo una orientacion visual, no una certeza. Responde solo con el objeto JSON.`;
}

async function loadProviderWithRetries(provider, createRequest, maxAttempts) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const request = createRequest();
    let rawResponse;
    try {
      rawResponse = await request.loadString();
    } catch (networkError) {
      lastError = new Error(`No se ha podido conectar con ${provider}: ${networkError.message || String(networkError)}`);
      lastError.provider = provider;
      lastError.retryable = true;
    }

    if (!lastError || rawResponse !== undefined) {
      const rawStatus = request.response ? Number(request.response.statusCode) : 0;
      const status = Number.isFinite(rawStatus) ? rawStatus : 0;
      if (status >= 200 && status < 300) return { rawResponse, request };
      lastError = createProviderHttpError(provider, status, providerMessageFromBody(rawResponse));
    }

    if (!lastError.retryable || attempt >= maxAttempts) throw lastError;
    const headers = request.response && request.response.headers;
    const retryHeaderDelay = retryAfterMilliseconds(headers);
    if (retryHeaderDelay > 15000) {
      lastError.message += `\n${provider} solicita esperar ${Math.ceil(retryHeaderDelay / 1000)} segundos. Se pasara al proveedor alternativo sin bloquear la app.`;
      lastError.retryAfterMs = retryHeaderDelay;
      throw lastError;
    }
    const defaultDelay = attempt === 1 ? 1800 : 5000;
    const delay = Math.max(retryHeaderDelay, defaultDelay) + Math.floor(Math.random() * 400);
    console.warn(`${provider} fallo. Reintento ${attempt + 1}/${maxAttempts} en ${delay} ms.`);
    await waitMilliseconds(delay);
    lastError = null;
  }
  throw lastError || new Error(`No se pudo completar la peticion a ${provider}.`);
}

function parseGroqResponse(rawResponse) {
  let response;
  try { response = JSON.parse(rawResponse); }
  catch (_) { throw new Error("Groq ha respondido con un JSON de API no valido."); }
  if (response.error) throw createProviderHttpError("Groq", 500, String(response.error.message || "Error sin descripcion"));
  const content = response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : "";
  if (typeof content !== "string" || !content.trim()) throw new Error("Groq ha respondido sin contenido de analisis.");
  return validateGarmentResult(extractJSON(content), "Groq", GROQ_MODEL);
}

async function analyzeWithGroq(imageBase64) {
  if (!Keychain.contains(GROQ_KEYCHAIN_KEY)) throw new Error("No hay una API Key de Groq configurada.");
  const apiKey = Keychain.get(GROQ_KEYCHAIN_KEY);
  if (!apiKey || !String(apiKey).startsWith("gsk_") || String(apiKey).length < 25) throw new Error("La API Key guardada de Groq parece incompleta. Abre Mi armario y actualizala.");

  const content = [
    { type: "text", text: garmentPrompt() },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
  ];
  const loaded = await loadProviderWithRetries("Groq", () => {
    const request = new Request(GROQ_ENDPOINT);
    request.method = "POST";
    request.timeoutInterval = GROQ_TIMEOUT_SECONDS;
    request.headers = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
    request.body = JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content }],
      temperature: 0.2,
      max_completion_tokens: 900,
      response_format: { type: "json_object" },
      reasoning_format: "hidden",
      reasoning_effort: "none",
      stream: false
    });
    return request;
  }, AI_MAX_ATTEMPTS);
  return parseGroqResponse(loaded.rawResponse);
}

async function analyzeWithGemini(imageBase64) {
  if (!Keychain.contains(KEYCHAIN_KEY)) throw new Error("No hay una API Key de Gemini configurada para el fallback.");
  const apiKey = Keychain.get(KEYCHAIN_KEY);
  if (!apiKey || String(apiKey).trim().length < 20) throw new Error("La API Key guardada de Gemini parece incompleta. Abre Mi armario y actualizala.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const requestBody = {
    contents: [{ role: "user", parts: [
      { text: garmentPrompt() },
      { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
    ]}],
    generationConfig: { responseMimeType: "application/json" }
  };
  const loaded = await loadProviderWithRetries("Gemini", () => {
    const request = new Request(endpoint);
    request.method = "POST";
    request.timeoutInterval = GEMINI_TIMEOUT_SECONDS;
    request.headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
    request.body = JSON.stringify(requestBody);
    return request;
  }, GEMINI_MAX_ATTEMPTS);

  let response;
  try { response = JSON.parse(loaded.rawResponse); }
  catch (_) { throw new Error("Gemini ha respondido con un JSON de API no valido."); }
  if (response.error) throw createGeminiHttpError(loaded.request.response ? loaded.request.response.statusCode : 500, String(response.error.message || "Error sin descripcion"));
  const candidate = response.candidates && response.candidates[0];
  if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts)) {
    const blockReason = response.promptFeedback && response.promptFeedback.blockReason;
    if (blockReason) throw new Error(`Gemini ha bloqueado el analisis (${blockReason}). Prueba con una foto clara de la prenda sin personas.`);
    throw new Error("Gemini ha respondido sin incluir el resultado del analisis.");
  }
  const text = candidate.content.parts.map(part => part.text || "").join("\n").trim();
  if (!text) throw new Error("Gemini no ha devuelto una descripcion de la prenda.");
  return validateGarmentResult(extractJSON(text), "Gemini", MODEL);
}

async function analyzeWithAI(jpegData) {
  const imageBase64 = prepareImageBase64(jpegData);
  if (!Keychain.contains(GROQ_KEYCHAIN_KEY)) throw new Error("Configura primero la API Key de Groq, que es el proveedor principal.");

  let groqError;
  try {
    const result = await analyzeWithGroq(imageBase64);
    console.log(`Analisis completado con Groq (${GROQ_MODEL}).`);
    return result;
  } catch (error) {
    groqError = error;
    console.warn(`Groq no ha podido analizar la prenda; se intentara Gemini como fallback: ${error.message || error}`);
  }

  if (Keychain.contains(KEYCHAIN_KEY)) {
    try {
      const result = await analyzeWithGemini(imageBase64);
      console.log(`Fallback completado con Gemini (${MODEL}).`);
      result.fallbackFrom = "Groq";
      return result;
    } catch (geminiError) {
      throw new Error(`Groq no disponible: ${groqError.message || groqError}\n\nGemini fallback tambien fallo: ${geminiError.message || geminiError}\n\nLa fotografia se conserva para reintentar.`);
    }
  }
  throw new Error(`Groq no disponible: ${groqError.message || groqError}\n\nNo hay API Key de Gemini configurada para el fallback. La fotografia se conserva.`);
}

async function askWarmth() {
  const alert = new Alert();
  alert.title = "¿Cuanto abriga?";
  alert.message = "La foto no permite saber con precision el grosor. Elige tu valoracion.";
  alert.addAction("Fina / abriga poco");
  alert.addAction("Media / abrigo normal");
  alert.addAction("Gruesa / abriga mucho");
  alert.addCancelAction("Cancelar registro");
  const choice = await alert.presentAlert();
  return choice < 0 ? null : choice + 1;
}

async function askProtection(title, question) {
  const alert = new Alert();
  alert.title = title;
  alert.message = question;
  alert.addAction("Si");
  alert.addAction("No");
  alert.addAction("No lo se");
  alert.addCancelAction("Cancelar registro");
  const choice = await alert.presentAlert();
  if (choice === -1) return null;
  return choice === 0;
}

async function ensureAIConfigured() {
  if (!Keychain.contains(GROQ_KEYCHAIN_KEY)) {
    await showMessage("Falta conectar Groq", "Groq sera el proveedor principal para analizar prendas. Configura su API Key desde el menu de Mi armario.");
    await configureGroqKey();
    if (!Keychain.contains(GROQ_KEYCHAIN_KEY)) return false;
  }
  if (!Keychain.contains(KEYCHAIN_KEY)) {
    const alert = new Alert();
    alert.title = "Configurar proveedor alternativo";
    alert.message = "Gemini permite continuar si Groq esta saturado o falla. Puedes configurarlo ahora o continuar solo con Groq.";
    alert.addAction("Configurar Gemini fallback");
    alert.addAction("Continuar solo con Groq");
    alert.addCancelAction("Cancelar");
    const choice = await alert.presentAlert();
    if (choice === 0) await configureGeminiKey();
    else if (choice !== 1) return false;
    if (!Keychain.contains(KEYCHAIN_KEY) && choice !== 1) return false;
    if (!Keychain.contains(KEYCHAIN_KEY)) await showMessage("Fallback desactivado", "El analisis funcionara con Groq, pero si Groq falla tendras que reintentar manualmente.");
  }
  return true;
}

async function askReplacePendingPhoto() {
  if (!hasPendingPhoto()) return true;
  const alert = new Alert();
  alert.title = "Hay una fotografia pendiente";
  alert.message = "Tienes una fotografia anterior guardada porque la IA no pudo analizarla. Puedes reintentarla desde el menu o sustituirla por una nueva.";
  alert.addAction("Sustituir por la nueva foto");
  alert.addCancelAction("Conservar la pendiente");
  return (await alert.presentAlert()) === 0;
}

async function saveDetectedGarment(detected, jpegData) {
  const category = normalizeCategory(detected.category);
  const suggestedName = String(detected.name || `${categoryLabel(category)} ${detected.color || ""}`).trim().slice(0, 70);
  const color = String(detected.color || "No identificado").trim().slice(0, 50);
  const description = String(detected.description || "Prenda identificada a partir de una fotografia.").trim().slice(0, 350);
  const validStyles = ["casual", "urbano", "deportivo", "minimalista", "elegante"];
  const styleTags = Array.isArray(detected.styleTags) ? detected.styleTags.map(tag => String(tag).toLowerCase().trim()).filter(tag => validStyles.includes(tag)).slice(0, 5) : [];
  const summary = `Nombre: ${suggestedName}\nTipo: ${categoryLabel(category)}\nColor: ${color}\nPatron: ${detected.pattern || "No identificado"}\nEstilos visuales sugeridos: ${styleTags.join(", ") || "Sin clasificar"}\n\n${description}\n\nProveedor: ${detected.provider || "IA"}${detected.model ? ` (${detected.model})` : ""}${detected.fallbackFrom ? ` · fallback desde ${detected.fallbackFrom}` : ""}\nConfirma el resultado. Los estilos son orientativos y el grosor lo indicas tu.`;
  const confirm = new Alert();
  confirm.title = `Resultado de ${detected.provider || "IA"}`;
  confirm.message = summary;
  confirm.addAction("Confirmar y guardar");
  confirm.addCancelAction("Dejar pendiente");
  const confirmed = await confirm.presentAlert();
  if (confirmed !== 0) return false;

  const warmthLevel = await askWarmth();
  if (warmthLevel === null) return false;

  const outerCategories = ["chaqueta", "abrigo", "cortavientos", "chubasquero"];
  let waterproof = false;
  let windproof = false;
  if (outerCategories.includes(category) || ["zapatillas", "zapatos", "botas"].includes(category)) {
    const waterAnswer = await askProtection("Proteccion frente a lluvia", "¿Has comprobado que esta prenda o calzado protege de la lluvia?");
    if (waterAnswer === null) return false;
    waterproof = waterAnswer;
    if (outerCategories.includes(category)) {
      const windAnswer = await askProtection("Proteccion frente al viento", "¿Has comprobado que esta prenda protege del viento?");
      if (windAnswer === null) return false;
      windproof = windAnswer;
    }
  }

  ensureFolders();
  const pendingMeta = readPendingMetadata();
  const id = pendingMeta.id || `prenda_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  const items = readInventory();
  if (items.some(existing => existing.id === id)) {
    clearPendingPhoto();
    await showMessage("Prenda ya registrada", "Esta fotografia ya se habia guardado correctamente. Se ha eliminado la copia pendiente para evitar duplicados.");
    return true;
  }

  const originalFilename = `prenda_${id}_original.jpg`;
  const originalRelativePath = `${WARDROBE_FOLDER}/${PHOTO_FOLDER}/${originalFilename}`;
  let displayRelativePath = originalRelativePath;
  let displayMimeType = "image/jpeg";

  const removeBackground = await askBackgroundRemoval();
  if (removeBackground === null) return false;

  fm.write(fm.joinPath(root, originalRelativePath), jpegData);
  if (removeBackground) {
    try {
      const pngData = await removeImageBackground(jpegData);
      const pngFilename = `prenda_${id}_sin_fondo.png`;
      displayRelativePath = `${WARDROBE_FOLDER}/${PHOTO_FOLDER}/${pngFilename}`;
      fm.write(fm.joinPath(root, displayRelativePath), pngData);
      displayMimeType = "image/png";
    } catch (error) {
      const fallback = new Alert();
      fallback.title = "No se pudo quitar el fondo";
      fallback.message = `${error.message || String(error)}\n\nSe guardara la foto original.`;
      fallback.addAction("Continuar");
      await fallback.presentAlert();
    }
  }

  const now = new Date().toISOString();
  const item = {
    id,
    name: suggestedName,
    category,
    color,
    pattern: String(detected.pattern || "").slice(0, 30),
    styleTags,
    description,
    analysisProvider: detected.provider || "IA",
    analysisModel: detected.model || "",
    analysisFallbackFrom: detected.fallbackFrom || "",
    warmthLevel,
    waterproof,
    windproof,
    available: true,
    imageFile: displayRelativePath,
    originalImageFile: originalRelativePath,
    imageMimeType: displayMimeType,
    createdAt: pendingMeta.createdAt || now,
    updatedAt: now
  };
  items.push(item);
  saveInventory(items);
  clearPendingPhoto();
  await showMessage("Prenda guardada", `${item.name} se ha añadido al armario. Ya podra aparecer en futuras recomendaciones.`);
  return true;
}

async function analyzePendingGarment() {
  if (!hasPendingPhoto()) {
    await showMessage("No hay fotografia pendiente", "Selecciona una foto nueva desde Añadir prenda.");
    return;
  }
  if (!(await ensureAIConfigured())) return;

  let jpegData;
  try {
    jpegData = Data.fromFile(pendingPhotoPath);
    if (!jpegData) throw new Error("El archivo de la fotografia esta vacio o no se puede leer.");
  } catch (error) {
    await showMessage("No se puede recuperar la fotografia", `${error.message || String(error)}\nPuedes seleccionar la imagen de nuevo desde la galeria.`);
    return;
  }

  let detected;
  if (fm.fileExists(pendingResultPath)) {
    try {
      detected = validateGarmentResult(JSON.parse(fm.readString(pendingResultPath)));
      console.log(`Se reutiliza el resultado guardado de ${detected.provider || "IA"} para no repetir la peticion.`);
    } catch (error) {
      console.warn(`El resultado pendiente no era valido y se volvera a analizar: ${error.message || error}`);
      fm.remove(pendingResultPath);
    }
  }

  if (!detected) {
    try {
      detected = await analyzeWithAI(jpegData);
      try {
        fm.writeString(pendingResultPath, JSON.stringify(detected, null, 2));
      } catch (cacheError) {
        console.warn(`No se pudo guardar el resultado temporal de IA: ${cacheError.message || cacheError}`);
      }
    } catch (error) {
      console.error(`Error de analisis multi-IA: ${error.message || error}`);
      await showMessage("No se pudo analizar la prenda", `${error.message || String(error)}\n\nLa fotografia se ha conservado en Scriptable. Puedes reintentar el analisis desde el menu de Mi armario. No necesitas volver a seleccionarla.`);
      return;
    }
  }

  await saveDetectedGarment(detected, jpegData);
}

async function addGarment() {
  if (!(await ensureAIConfigured())) return;
  if (!(await askReplacePendingPhoto())) return;

  let originalImage;
  try {
    originalImage = await choosePhoto();
  } catch (error) {
    await showMessage("No se pudo abrir la foto", error.message || String(error));
    return;
  }
  if (!originalImage) return;

  let jpegData;
  try {
    const resizedImage = resizeForAI(originalImage);
    jpegData = Data.fromJPEG(resizedImage);
    const base64Length = jpegData ? jpegData.toBase64String().length : 0;
    if (!jpegData || base64Length < 100) {
      throw new Error("No se ha podido convertir la imagen a JPEG. Prueba con otra fotografia.");
    }
    if (base64Length > GEMINI_MAX_IMAGE_BASE64_CHARS) {
      throw new Error("La fotografia es demasiado grande incluso despues de optimizarla. Prueba con una imagen mas pequena.");
    }
    savePendingPhoto(jpegData, resizedImage);
  } catch (error) {
    await showMessage("No se pudo preparar la fotografia", error.message || String(error));
    return;
  }

  await analyzePendingGarment();
}

async function showGallery() {
  const items = readInventory().slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!items.length) {
    await showMessage("Tu armario esta vacio", "Utiliza “Añadir prenda” para fotografiar tu primera prenda.");
    return;
  }

  const counts = new Map();
  for (const item of items) {
    const groupId = galleryGroupForCategory(item.category);
    counts.set(groupId, (counts.get(groupId) || 0) + 1);
  }

  const filterButtons = [
    `<button type="button" class="filter-button active" data-filter="todo">Todo <span>${items.length}</span></button>`,
    ...GALLERY_CATEGORY_GROUPS
      .filter(group => (counts.get(group.id) || 0) > 0)
      .map(group => `<button type="button" class="filter-button" data-filter="${group.id}">${escapeHTML(group.label)} <span>${counts.get(group.id)}</span></button>`)
  ].join("");

  const cards = items.map(item => {
    let image = "";
    try {
      const path = fm.joinPath(root, item.imageFile || "");
      if (item.imageFile && fm.fileExists(path)) {
        const mime = item.imageMimeType || (String(item.imageFile).toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
        image = `data:${mime};base64,${Data.fromFile(path).toBase64String()}`;
      }
    } catch (error) { console.warn(error); }

    const photo = image
      ? `<img src="${image}" alt="${escapeHTML(item.name)}" loading="lazy">`
      : `<div class="placeholder" aria-label="Sin fotografia">👕</div>`;
    const warmth = item.warmthLevel === 3 ? "Gruesa" : item.warmthLevel === 1 ? "Fina" : "Media";
    const groupId = galleryGroupForCategory(item.category);
    const searchText = [
      item.name, item.category, categoryLabel(item.category), item.color, item.pattern,
      item.description, ...(Array.isArray(item.styleTags) ? item.styleTags : [])
    ].filter(Boolean).join(" ").toLowerCase();
    const availability = item.available === false
      ? `<span class="availability unavailable">No disponible</span>`
      : `<span class="availability">Disponible</span>`;

    return `<article class="card" data-group="${groupId}" data-search="${escapeHTML(searchText)}">
      <div class="photo">${photo}</div>
      <div class="card-info">
        <strong>${escapeHTML(item.name || "Prenda sin nombre")}</strong>
        <span class="category">${escapeHTML(categoryLabel(item.category))}</span>
        <small>${escapeHTML(item.color || "Sin color")} · ${warmth}</small>
        <div class="card-footer">${availability}</div>
      </div>
    </article>`;
  }).join("");

  const html = `<!doctype html>
<html lang="es"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta charset="utf-8">
<title>Mi armario</title>
<style>
*{box-sizing:border-box}
:root{color-scheme:dark}
body{margin:0;padding:18px 14px 28px;background:#101318;color:#f3f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
.wrap{max-width:760px;margin:0 auto}
.header{padding:5px 2px 14px}
h1{font-size:27px;line-height:1.1;margin:4px 0 7px;letter-spacing:-.5px}
.sub{color:#9da8b6;font-size:13px}
.toolbar{position:sticky;top:0;z-index:5;background:rgba(16,19,24,.97);padding:9px 0 11px;backdrop-filter:blur(12px)}
.search{width:100%;border:1px solid #303946;border-radius:13px;background:#1b2028;color:#f3f5f7;padding:13px 14px;font-size:15px;outline:none}
.search:focus{border-color:#8396ad}
.filters{display:flex;gap:8px;overflow-x:auto;padding:11px 1px 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.filters::-webkit-scrollbar{display:none}
.filter-button{flex:0 0 auto;border:1px solid #343d49;border-radius:999px;background:#1b2028;color:#c7d0db;padding:9px 12px;font-size:12px;font-weight:600;white-space:nowrap}
.filter-button span{display:inline-block;margin-left:5px;color:#8997a8;font-size:11px}
.filter-button.active{background:#e8edf3;border-color:#e8edf3;color:#111820}
.filter-button.active span{color:#4c5a69}
.summary{display:flex;justify-content:space-between;gap:10px;color:#9da8b6;font-size:12px;padding:3px 2px 9px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.card{min-width:0;overflow:hidden;background:#1b2028;border:1px solid #303741;border-radius:16px}
.card[hidden]{display:none}
.photo{height:150px;background:repeating-conic-gradient(#29323d 0% 25%,#222a34 0% 50%) 50% / 16px 16px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.photo img,.placeholder{width:100%;height:100%;object-fit:contain}
.placeholder{display:grid;place-items:center;font-size:38px;background:transparent}
.card-info{padding:10px 11px 11px;min-width:0}
.card-info strong{display:block;font-size:13px;line-height:1.35;overflow-wrap:anywhere}
.category{display:inline-block;color:#d8e1ec;font-size:11px;margin-top:5px}
.card-info small{display:block;color:#9da8b6;font-size:11px;margin-top:5px;overflow-wrap:anywhere}
.card-footer{margin-top:9px}
.availability{display:inline-block;border-radius:999px;padding:4px 7px;background:#20382f;color:#a9e0c4;font-size:10px}
.availability.unavailable{background:#3b2b2b;color:#e9b4b4}
.empty{display:none;text-align:center;color:#aab4c0;padding:35px 18px;border:1px dashed #3a4654;border-radius:16px;font-size:13px}
.empty.visible{display:block}
.foot{color:#8290a0;font-size:11px;text-align:center;margin:22px 0 4px}
@media(min-width:560px){body{padding:24px}.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.photo{height:175px}}
</style></head><body>
<main class="wrap">
  <header class="header"><h1>Mi armario</h1><div class="sub">${items.length} prendas registradas · Organiza tu ropa por categorias</div></header>
  <section class="toolbar" aria-label="Filtros del armario">
    <input id="search" class="search" type="search" placeholder="Buscar por nombre, color o estilo..." autocomplete="off" aria-label="Buscar prendas">
    <nav class="filters" aria-label="Categorias">${filterButtons}</nav>
  </section>
  <div class="summary"><span id="visibleCount">${items.length} prendas</span><span id="activeLabel">Todo el armario</span></div>
  <section id="grid" class="grid">${cards}</section>
  <div id="empty" class="empty">No hay prendas que coincidan con esta categoria o busqueda.</div>
  <div class="foot">Las fotografias permanecen en los documentos locales de Scriptable.</div>
</main>
<script>
(function(){
  const buttons = Array.from(document.querySelectorAll('.filter-button'));
  const cards = Array.from(document.querySelectorAll('.card'));
  const search = document.getElementById('search');
  const visibleCount = document.getElementById('visibleCount');
  const activeLabel = document.getElementById('activeLabel');
  const empty = document.getElementById('empty');
  let activeFilter = 'todo';
  function normalize(value){
    return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();
  }
  function update(){
    const query = normalize(search.value);
    let visible = 0;
    cards.forEach(card => {
      const matchesCategory = activeFilter === 'todo' || card.dataset.group === activeFilter;
      const matchesSearch = !query || normalize(card.dataset.search).includes(query);
      const show = matchesCategory && matchesSearch;
      card.hidden = !show;
      if(show) visible += 1;
    });
    visibleCount.textContent = visible + ' de ' + cards.length + ' prendas';
    empty.classList.toggle('visible', visible === 0);
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter || 'todo';
    buttons.forEach(entry => entry.classList.toggle('active', entry === button));
    activeLabel.textContent = button.dataset.filter === 'todo' ? 'Todo el armario' : button.textContent.trim();
    update();
  }));
  search.addEventListener('input', update);
  update();
})();
</script>
</body></html>`;
  const web = new WebView();
  await web.loadHTML(html);
  await web.present(true);
}

async function editGarment() {
  const items = readInventory();
  if (!items.length) {
    await showMessage("Armario vacio", "Todavia no hay prendas que gestionar.");
    return;
  }
  const list = new Alert();
  list.title = "Selecciona una prenda";
  list.message = "Elige una prenda para editarla, cambiar su disponibilidad o eliminarla.";
  items.forEach(item => list.addAction(`${item.available === false ? "⏸️" : "✅"} ${item.name}`));
  list.addCancelAction("Cancelar");
  const index = await list.presentAlert();
  if (index < 0 || !items[index]) return;
  const item = items[index];

  const actions = new Alert();
  actions.title = item.name;
  actions.message = `${categoryLabel(item.category)} · ${item.color || "Color no indicado"}`;
  actions.addAction("Editar nombre");
  actions.addAction("Cambiar tipo de prenda");
  actions.addAction("Cambiar grosor");
  actions.addAction(item.available === false ? "Marcar como disponible" : "Marcar como no disponible");
  actions.addDestructiveAction("Eliminar del armario");
  actions.addCancelAction("Volver");
  const action = await actions.presentAlert();
  if (action < 0) return;

  if (action === 0) {
    const rename = new Alert();
    rename.title = "Editar nombre";
    rename.addTextField("Nombre de la prenda", item.name);
    rename.addAction("Guardar");
    rename.addCancelAction("Cancelar");
    if (await rename.presentAlert() === 0) item.name = rename.textFieldValue(0).trim() || item.name;
  } else if (action === 1) {
    const category = new Alert();
    category.title = "Tipo de prenda";
    CATEGORIES.forEach(entry => category.addAction(entry[1]));
    category.addCancelAction("Cancelar");
    const choice = await category.presentAlert();
    if (choice >= 0 && CATEGORIES[choice]) item.category = CATEGORIES[choice][0];
  } else if (action === 2) {
    const warmth = new Alert();
    warmth.title = "Grosor de la prenda";
    warmth.addAction("Fina"); warmth.addAction("Media"); warmth.addAction("Gruesa");
    warmth.addCancelAction("Cancelar");
    const choice = await warmth.presentAlert();
    if (choice >= 0) item.warmthLevel = choice + 1;
  } else if (action === 3) {
    item.available = item.available === false;
  } else if (action === 4) {
    const confirm = new Alert();
    confirm.title = "Eliminar prenda";
    confirm.message = "Se quitara del armario. La foto no se borra para que los outfits antiguos puedan seguir mostrandola.";
    confirm.addDestructiveAction("Eliminar");
    confirm.addCancelAction("Cancelar");
    if (await confirm.presentAlert() === 0) {
      const updated = items.filter(entry => entry.id !== item.id);
      saveInventory(updated);
      await showMessage("Prenda eliminada", "La prenda se ha quitado del armario. La fotografia historica se conserva.");
      return;
    }
  }
  item.updatedAt = new Date().toISOString();
  saveInventory(items);
  await showMessage("Armario actualizado", "Los cambios se han guardado.");
}

async function main() {
  ensureFolders();
  const items = readInventory();
  if (inventoryRecoveredFromBackup) {
    await showMessage("Copia de seguridad recuperada", "El archivo principal del armario no se podia leer. Se ha recuperado la ultima copia valida. No borres ropa_diaria_wardrobe.backup.json hasta comprobar que aparecen todas tus prendas.");
  }

  const groqStatus = Keychain.contains(GROQ_KEYCHAIN_KEY) ? "Groq principal conectado" : "Groq principal sin configurar";
  const geminiStatus = Keychain.contains(KEYCHAIN_KEY) ? "Gemini fallback conectado" : "Gemini fallback sin configurar";
  const menu = new Alert();
  menu.title = APP_NAME;
  menu.message = `${items.length} prendas registradas · ${groqStatus} · ${geminiStatus}${hasPendingPhoto() ? " · Hay una foto pendiente de analizar" : ""}`;
  menu.addAction("➕ Añadir prenda con foto");
  if (hasPendingPhoto()) menu.addAction("🔄 Reintentar analisis pendiente");
  menu.addAction("👕 Ver mi armario");
  menu.addAction("✏️ Gestionar prendas");
  menu.addAction("🔑 Configurar API Key Groq (principal)");
  menu.addAction("🔑 Configurar API Key Gemini (fallback)");
  menu.addAction(Keychain.contains(REMOVE_BG_KEYCHAIN_KEY) ? "🪄 Gestionar clave remove.bg" : "🪄 Configurar recorte de fondo");
  menu.addCancelAction("Cerrar");
  const choice = await menu.presentAlert();
  let index = 0;
  if (choice === index++) { await addGarment(); return; }
  if (hasPendingPhoto()) {
    if (choice === index++) { await analyzePendingGarment(); return; }
  }
  if (choice === index++) { await showGallery(); return; }
  if (choice === index++) { await editGarment(); return; }
  if (choice === index++) { await configureGroqKey(); return; }
  if (choice === index++) { await configureGeminiKey(); return; }
  if (choice === index) await configureRemoveBgKey();
}

try {
  await main();
} catch (error) {
  console.error(error);
  await showMessage("Error en Mi armario", error && error.message ? error.message : String(error));
}
Script.complete();
