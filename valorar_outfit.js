// ============================================================
// VALORAR OUTFIT - Scriptable
// Ejecutar preferiblemente al final del dia (por ejemplo 20:30).
// Aprende de tu valoracion y ajusta las proximas recomendaciones.
// ============================================================
const fm = FileManager.local();
const root = fm.documentsDirectory();
const profilePath = fm.joinPath(root, "ropa_diaria_profile.json");
const historyPath = fm.joinPath(root, "ropa_diaria_history.json");

function readJSON(path, fallback) {
  try { return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : fallback; }
  catch (_) { return fallback; }
}
function writeJSON(path, value) { fm.writeString(path, JSON.stringify(value, null, 2)); }
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

try {
  const history = readJSON(historyPath, []);
  const profile = {
    thermalBias: 0, windBias: 0, rainSensitivity: 0, ratingsCount: 0, lastUpdated: null,
    ...readJSON(profilePath, {})
  };
  const today = history.find(item => item.date === todayKey());

  if (!today) {
    const alert = new Alert();
    alert.title = "No hay outfit guardado hoy";
    alert.message = "Primero debe haberse generado la recomendación de esta mañana.";
    alert.addAction("Aceptar");
    await alert.presentAlert();
  } else if (today.feedback) {
    const alert = new Alert();
    alert.title = "Hoy ya has valorado tu outfit";
    alert.message = `Valoración guardada: ${today.feedback}. No aplicaré dos veces el mismo ajuste.`;
    alert.addAction("Aceptar");
    await alert.presentAlert();
  } else {
    const alert = new Alert();
    alert.title = "¿Cómo has pasado el día?";
    alert.message = "Tu respuesta ajustará las recomendaciones futuras. Solo se guarda en este iPhone.";
    alert.addAction("He pasado frío");
    alert.addAction("He pasado calor");
    alert.addAction("El viento me ha molestado");
    alert.addAction("Me he mojado");
    alert.addAction("Todo perfecto");
    alert.addCancelAction("Ahora no");
    const choice = await alert.presentAlert();
    const options = ["frio", "calor", "viento", "lluvia", "perfecto"];
    if (choice >= 0 && choice < options.length) {
      const feedback = options[choice];
      if (feedback === "frio") profile.thermalBias = Math.min(4, profile.thermalBias + 0.8);
      if (feedback === "calor") profile.thermalBias = Math.max(-4, profile.thermalBias - 0.8);
      if (feedback === "viento") profile.windBias = Math.min(3, profile.windBias + 1);
      if (feedback === "lluvia") profile.rainSensitivity = Math.min(3, profile.rainSensitivity + 1);
      if (feedback === "perfecto") {
        profile.thermalBias *= 0.75;
        profile.windBias = Math.max(0, profile.windBias - 1);
        profile.rainSensitivity = Math.max(0, profile.rainSensitivity - 1);
      }
      profile.ratingsCount += 1;
      profile.lastUpdated = new Date().toISOString();
      today.feedback = feedback;
      today.feedbackAt = new Date().toISOString();
      writeJSON(profilePath, profile);
      writeJSON(historyPath, history.slice(-90));

      const done = new Alert();
      done.title = "Valoración guardada";
      done.message = feedback === "frio"
        ? "La próxima vez añadiré algo más de abrigo."
        : feedback === "calor"
        ? "La próxima vez recomendaré menos abrigo."
        : feedback === "viento"
        ? "Seré más exigente con la protección frente al viento."
        : feedback === "lluvia"
        ? "Aumentaré la precaución cuando exista riesgo de lluvia."
        : "Perfecto. Iré suavizando los ajustes que ya no hagan falta.";
      done.addAction("Aceptar");
      await done.presentAlert();
    }
  }
} catch (error) {
  const alert = new Alert();
  alert.title = "No se pudo guardar la valoración";
  alert.message = error && error.message ? error.message : String(error);
  alert.addAction("Aceptar");
  await alert.presentAlert();
}
Script.complete();
