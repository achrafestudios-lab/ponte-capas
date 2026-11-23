# PonteCapas v2.0

Segunda versión de PonteCapas para **Scriptable** (iOS). Amplía la v1.0 con interfaz visual, historial local y aprendizaje a partir de valoraciones.

## Archivos

| Archivo | Función |
|---|---|
| `ropa_diaria_v2.js` | Script principal: consulta el clima, genera la recomendación, guarda historial y muestra la pantalla visual. |
| `valorar_outfit.js` | Permite valorar el outfit al final del día y ajusta el perfil aprendido. |
| `historial_ropa.js` | Muestra las últimas recomendaciones y valoraciones guardadas. |
| `LEEME_ropa_diaria_v2.txt` | Instrucciones de instalación en iPhone/Scriptable. |

## Mejoras respecto a v1.0

### Experiencia de usuario
- **Pantalla visual del outfit**: además de la notificación, muestra un informe HTML en `WebView` con capas recomendadas, evolución por franjas, accesorios y consejos.
- **Nombre de ubicación**: usa geocodificación inversa para mostrar la localidad/lugar en el informe.
- **Notificación más concisa**: resume el outfit y el riesgo principal; el detalle completo queda en la pantalla visual.

### Recomendación más contextual
- **Perfil aprendido**: las valoraciones ajustan sesgos de `thermalBias`, `windBias` y `rainSensitivity`.
- **Transporte con efecto real**: en autobús se reduce el umbral de viento para recomendar antes protección cortavientos.
- **Selección horaria más precisa**: las franjas se comparan por minutos (`07:50`, `11:25`, `14:20`) en lugar de solo por hora.
- **Lluvia más sensible al perfil**: el umbral de probabilidad de lluvia se ajusta según la sensibilidad aprendida.
- **Detalle por franja**: cada momento del día incluye temperatura, sensación, rachas, probabilidad de lluvia, estado y recomendación de capa.

### Persistencia local
- **Historial**: guarda recomendaciones diarias en `ropa_diaria_history.json` (hasta 90 registros).
- **Perfil**: guarda ajustes aprendidos en `ropa_diaria_profile.json`.
- **Sin duplicados diarios**: si se regenera el outfit del mismo día, se reemplaza la entrada de esa fecha.

### Valoración y aprendizaje

El script `valorar_outfit.js` permite registrar una valoración al día:

| Valoración | Efecto |
|---|---|
| He pasado frío | Sube `thermalBias` (+0.8, máx. 4) |
| He pasado calor | Baja `thermalBias` (-0.8, mín. -4) |
| El viento me ha molestado | Sube `windBias` (+1, máx. 3) |
| Me he mojado | Sube `rainSensitivity` (+1, máx. 3) |
| Todo perfecto | Suaviza ajustes: `thermalBias *= 0.75`, reduce viento/lluvia |

### Historial visual

`historial_ropa.js` abre un `WebView` con las últimas 30 recomendaciones, mostrando fecha, lugar, transporte, temperaturas, sensación, rachas, outfit y valoración.

## Uso

Consulta `LEEME_ropa_diaria_v2.txt` para la instalación paso a paso en Scriptable y Atajos.

## Privacidad

- Los datos de historial y perfil se guardan **localmente** en el directorio de documentos de Scriptable.
- La ubicación se obtiene en el momento de ejecución; las coordenadas se redondean a 3 decimales antes de consultar Open-Meteo.
- La recomendación es orientativa y depende de la previsión disponible.
