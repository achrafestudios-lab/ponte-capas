// CONFIGURAR TRANSPORTE - V4
// Mantiene el nombre del script para no tener que cambiar la configuracion existente.
// Ahora permite elegir transporte y sensibilidad personal al frio/calor.

const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), "ropa_diaria_config.json");

function readConfig() {
  try {
    if (fm.fileExists(path)) return JSON.parse(fm.readString(path)) || {};
  } catch (error) {
    console.warn(`No se pudo leer la configuracion: ${error}`);
  }
  return {};
}

const current = readConfig();
const config = {
  transport: current.transport === "autobus" ? "autobus" : "coche",
  thermalPreference: ["friolero", "normal", "caluroso"].includes(current.thermalPreference)
    ? current.thermalPreference
    : "normal"
};

const transportAlert = new Alert();
transportAlert.title = "Transporte habitual";
transportAlert.message = `Configurado: ${config.transport === "autobus" ? "Autobus" : "Coche"}. Puedes cambiarlo o mantenerlo.`;
transportAlert.addAction("🚗 Coche");
transportAlert.addAction("🚌 Autobus");
transportAlert.addCancelAction("Mantener transporte");
const transportChoice = await transportAlert.presentAlert();
if (transportChoice === 0) config.transport = "coche";
if (transportChoice === 1) config.transport = "autobus";

const preferenceAlert = new Alert();
preferenceAlert.title = "Sensibilidad termica";
preferenceAlert.message = "¿Como sueles llevar la temperatura? Esta preferencia ajusta ligeramente el abrigo recomendado.";
preferenceAlert.addAction("🥶 Soy friolero");
preferenceAlert.addAction("🙂 Normal");
preferenceAlert.addAction("🔥 Soy caluroso");
preferenceAlert.addCancelAction("Mantener preferencia");
const preferenceChoice = await preferenceAlert.presentAlert();
if (preferenceChoice === 0) config.thermalPreference = "friolero";
if (preferenceChoice === 1) config.thermalPreference = "normal";
if (preferenceChoice === 2) config.thermalPreference = "caluroso";

config.updatedAt = new Date().toISOString();
fm.writeString(path, JSON.stringify(config, null, 2));

const done = new Alert();
done.title = "Preferencias guardadas";
done.message = `Transporte: ${config.transport === "autobus" ? "Autobus" : "Coche"}.
Sensibilidad termica: ${config.thermalPreference}.`;
done.addAction("Aceptar");
await done.presentAlert();
Script.complete();
