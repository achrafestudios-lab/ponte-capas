# PonteCapas v1.0

Primera versión del script de recomendación de ropa diaria para **Scriptable** (iOS).

## Qué hace

Genera una recomendación de outfit para el día según la previsión meteorológica de tu ubicación actual. El resultado se entrega mediante una **notificación local** en el iPhone.

## Flujo

1. Pregunta cómo te desplazas: **coche** o **autobús**.
2. Obtiene la ubicación GPS actual (`Location`, precisión de ~100 m).
3. Consulta la previsión de **Open-Meteo** (1 día, zona horaria automática, viento en km/h).
4. Calcula la recomendación para tres momentos clave:
   - **Salida de casa** · 07:50
   - **Descanso** · 11:10–11:40
   - **Salida del centro** · 14:20
5. Programa una notificación con el outfit recomendado.

## Lógica de recomendación

- **Capas superiores**: se eligen según la sensación térmica más fría de las franjas exteriores, con ajustes por rachas de viento, amplitud térmica y humedad.
- **Pantalón**: se ajusta a la sensación térmica fría/cálida del día.
- **Calzado**: prioriza calzado cerrado impermeable si hay riesgo de lluvia.
- **Accesorios**: paraguas/chubasquero, protección contra el viento, guantes opcionales o gafas de sol según condiciones.
- **Transporte**: el modo autobús/coche añade consejos en las notas (más exposición al esperar/caminar en autobús).

## Datos meteorológicos

- Fuente: [Open-Meteo](https://open-meteo.com/).
- Campos horarios: temperatura, sensación térmica, humedad, probabilidad/cantidad de precipitación, código meteorológico, viento, rachas y UV.
- Campos diarios: mín/máx de temperatura y sensación térmica, probabilidad máxima y suma de precipitación, viento/rachas máximos y UV máximo.
- Las coordenadas se redondean a 3 decimales antes de enviarse a la API.

## Uso

1. Copia `ropa_diaria.js` en un script de Scriptable llamado `Ropa diaria`.
2. Ejecútalo manualmente la primera vez para conceder permisos de ubicación/notificaciones.
3. Opcional: crea una automatización en Atajos para ejecutarlo cada mañana.

## Limitaciones conocidas

- Sin interfaz visual: la salida es solo una notificación.
- Sin historial ni aprendizaje de preferencias.
- La selección horaria se aproxima por hora, no por minuto exacto.
- El transporte influye en las notas, pero no modifica los umbrales de la recomendación.
- No hay valoración posterior del outfit.
