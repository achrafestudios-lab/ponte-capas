# Changelog

Cambios relevantes del proyecto por versión.

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