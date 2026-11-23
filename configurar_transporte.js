// CONFIGURAR TRANSPORTE - ejecutar manualmente, con el iPhone desbloqueado.
const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), "ropa_diaria_config.json");
let current = "coche";
try {
  if (fm.fileExists(path)) {
    const saved = JSON.parse(fm.readString(path));
    if (saved.transport === "autobus") current = "autobus";
  }
} catch (_) {}

const alert = new Alert();
alert.title = "Transporte habitual";
alert.message = `Ahora esta configurado: ${current === "autobus" ? "autobus" : "coche"}. La recomendacion de las 07:30 usara esta opcion hasta que la cambies.`;
alert.addAction("🚗 Coche");
alert.addAction("🚌 Autobus");
alert.addCancelAction("Mantener configuracion actual");
const choice = await alert.presentAlert();
if (choice === 0 || choice === 1) {
  const transport = choice === 0 ? "coche" : "autobus";
  fm.writeString(path, JSON.stringify({ transport, updatedAt: new Date().toISOString() }, null, 2));
  const done = new Alert();
  done.title = "Transporte guardado";
  done.message = `La recomendacion diaria utilizara: ${transport}.`;
  done.addAction("Aceptar");
  await done.presentAlert();
}
Script.complete();
