# PonteCapas

PonteCapas es un proyecto de scripts para **Scriptable (iOS)** que recomienda qué ropa ponerte cada día según la previsión meteorológica de tu ubicación.

Tiene en cuenta los momentos en los que estás fuera: **salida de casa (07:50)**, **descanso (11:10–11:40)** y **salida del centro (14:20)**, ajustando el outfit por sensación térmica, viento, lluvia, humedad y UV.

## Versión actual: v3.0

La v3 está pensada para ejecutarse de forma automática desde **Atajos** a las 07:30, sin preguntas ni ventanas durante la automatización.

### Scripts

| Archivo | Función |
|---|---|
| `ropa_diaria.js` | Motor automático: recibe coordenadas GPS desde Atajos, consulta Open-Meteo, guarda la recomendación y programa la notificación. |
| `configurar_transporte.js` | Configura manualmente la preferencia de transporte (coche/autobús) que usará la recomendación automática. |
| `ver_outfit_hoy.js` | Muestra la ficha visual del outfit del día; pensado para abrirse al tocar la notificación. |
| `valorar_outfit.js` | Registra tu valoración del día (frío, calor, viento, lluvia o perfecto) para ajustar futuras recomendaciones. |
| `historial_ropa.js` | Muestra las recomendaciones y valoraciones guardadas. |

### Instalación rápida

1. Instala **Scriptable** y **Atajos** en iPhone.
2. Copia los scripts `.js` a Scriptable con los nombres indicados en `LEEME_v3.txt`.
3. Ejecuta **Configurar transporte** una vez para guardar tu preferencia.
4. Crea/modifica la automatización de las 07:30 en Atajos para obtener la ubicación actual y pasar `Latitud|Longitud` como parámetro a `Ropa diaria`.
5. Desactiva **Run In App** y **Show When Run** en la acción Run Script.

La guía completa está en [LEEME_v3.txt](LEEME_v3.txt).

### Flujo diario

- **07:30**: Atajos obtiene GPS y ejecuta la recomendación sin interacción.
- **Notificación**: al tocarla, abre `Ver outfit hoy`.
- **20:30** (opcional): recordatorio para valorar el outfit con `Valorar outfit`.
- **Historial**: consulta recomendaciones anteriores con `Historial ropa`.

## Versiones anteriores

Las versiones anteriores se publican en [GitHub Releases](https://github.com/achrafestudios-lab/ponte-capas/releases):

- **v2.0** — Pantalla visual, historial local y aprendizaje por valoraciones.
- **v1.0** — Recomendación básica por clima con notificación local.

## Privacidad

- La ubicación se usa en el momento de la ejecución para consultar la previsión.
- Las coordenadas se redondean a 3 decimales antes de enviarse a Open-Meteo.
- El historial y el perfil aprendido se guardan localmente en el directorio de documentos de Scriptable.
- La recomendación es orientativa y depende de la previsión meteorológica disponible.

## Tecnologías

- [Scriptable](https://scriptable.app/) para iOS
- JavaScript
- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
