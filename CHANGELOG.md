# Changelog

Cambios relevantes del proyecto por versión.

## [v4.0.0] - 2026-11-23

### Añadido
- Preferencia térmica en `Configurar transporte`: friolero, normal o caluroso.
- Consulta de historial por periodos de 7, 30 o 90 días.
- Estadísticas en el historial: valoraciones, porcentaje de días perfectos e incidencia más frecuente.
- El historial conserva hasta 365 registros diarios.

### Cambiado
- Si se ejecuta `Ropa diaria` varias veces el mismo día, se actualizan los datos meteorológicos sin borrar la valoración ya guardada.
- `Ver outfit hoy` muestra la preferencia térmica y si el outfit ya fue valorado.
- Se mantiene compatibilidad con los nombres de scripts y archivos JSON de v3.

## [v3.0.0] - 2026-11-23

### Añadido
- Ejecución automática desde Atajos pasando coordenadas `Latitud|Longitud`.
- Script `configurar_transporte.js` para guardar la preferencia coche/autobús.
- Script `ver_outfit_hoy.js` para abrir la ficha visual del día.
- Recordatorio automático de valoración a las 20:30.

### Cambiado
- El flujo principal deja de pedir interacción durante la ejecución automática.
- La recomendación usa la configuración de transporte guardada localmente.
- El repositorio publica la versión actual en la raíz y las versiones anteriores en GitHub Releases.

## [v2.0.0] - 2026-11-23

### Añadido
- Pantalla visual del outfit en WebView.
- Historial local de recomendaciones.
- Perfil aprendido a partir de valoraciones.
- Script de valoración del outfit.
- Script de historial.

### Cambiado
- La recomendación incorpora aprendizaje heurístico por frío, calor, viento y lluvia.
- Selección horaria más precisa por minutos.
- El transporte influye en los umbrales de recomendación.

## [v1.0.0] - 2026-11-23

### Añadido
- Script inicial `ropa_diaria.js` para Scriptable.
- Consulta meteorológica con Open-Meteo según ubicación GPS.
- Recomendación por capas para salida, descanso y salida del centro.
- Notificación local con el resumen del outfit.