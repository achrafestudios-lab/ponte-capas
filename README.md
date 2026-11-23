# PonteCapas

Automatización para iPhone que recomienda qué ropa ponerte según el tiempo de tu ubicación.

Usa **Atajos** + **Scriptable** y consulta la previsión de [Open-Meteo](https://open-meteo.com/) para las franjas clave del día: **07:50**, **11:10–11:40** y **14:20**.

## Qué hace

- Calcula un outfit por capas según temperatura, sensación térmica, viento, lluvia, humedad y UV.
- Adapta la recomendación a tu transporte: **coche** o **autobús**.
- Envía una notificación diaria y permite ver una ficha visual.
- Guarda historial y valoraciones en local para ajustar futuras recomendaciones.

## Scripts

| Script | Uso |
|---|---|
| `ropa_diaria.js` | Genera la recomendación diaria y programa notificaciones. |
| `configurar_transporte.js` | Guarda tu transporte habitual. |
| `ver_outfit_hoy.js` | Muestra la ficha visual del día. |
| `valorar_outfit.js` | Registra si pasaste frío, calor, viento, lluvia o perfecto. |
| `historial_ropa.js` | Muestra recomendaciones anteriores. |

## Instalación rápida

1. Copia los scripts `.js` a **Scriptable** con los mismos nombres.
2. Ejecuta **Configurar transporte** una vez.
3. En **Atajos**, crea una automatización diaria a las **07:30**:
   - Obtén la ubicación actual.
   - Extrae **Latitud** y **Longitud**.
   - Crea un texto con formato `Latitud|Longitud`.
   - Ejecuta `Ropa diaria` en Scriptable pasando ese texto como **Parameter**.
   - Desactiva **Run In App** y **Show When Run**.
4. Haz una prueba manual y otra con el iPhone bloqueado antes de darla por operativa.

> **Nota:** la ejecución con pantalla bloqueada depende de iOS y de los permisos del dispositivo. Las acciones visuales pueden requerir desbloquear el iPhone.

## Privacidad

- No usa servidor propio.
- Las coordenadas se redondean a 3 decimales antes de consultar Open-Meteo.
- El historial y el perfil se guardan localmente en Scriptable.

## Versiones

La versión actual en el repo es **v3.0**. Las versiones anteriores están en [GitHub Releases](https://github.com/achrafestudios-lab/ponte-capas/releases):

- [v3.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v3.0.0) — Automatización sin interacción
- [v2.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v2.0.0) — Pantalla visual, historial y aprendizaje
- [v1.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v1.0.0) — Recomendación básica por notificación
