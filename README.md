# PonteCapas

**Asistente de recomendaciones de vestimenta para iPhone, basado en previsión meteorológica.**

[![Platform](https://img.shields.io/badge/plataforma-iOS-black)](https://www.apple.com/ios/)
[![Scriptable](https://img.shields.io/badge/Scriptable-JavaScript-6C5CE7)](https://scriptable.app/)
[![Shortcuts](https://img.shields.io/badge/Atajos-Automatizaci%C3%B3n-0A84FF)](https://support.apple.com/es-es/guide/shortcuts/welcome/ios)
[![Weather](https://img.shields.io/badge/datos-Open--Meteo-2E7D32)](https://open-meteo.com/)
[![Release](https://img.shields.io/github/v/release/achrafestudios-lab/ponte-capas)](https://github.com/achrafestudios-lab/ponte-capas/releases)

PonteCapas es una automatización para iPhone que transforma la previsión meteorológica de la ubicación actual en una recomendación práctica de vestimenta. Su objetivo es facilitar la elección de ropa para toda la jornada, considerando las variaciones de temperatura, sensación térmica, viento, lluvia, humedad e índice UV.

---

## Tabla de contenidos

- [Descripción general](#descripción-general)
- [Características principales](#características-principales)
- [Arquitectura](#arquitectura)
- [Flujo diario](#flujo-diario)
- [Instalación](#instalación)
- [Datos meteorológicos y reglas](#datos-meteorológicos-y-reglas)
- [Privacidad y almacenamiento](#privacidad-y-almacenamiento)
- [Limitaciones](#limitaciones)
- [Roadmap](#roadmap)
- [Versiones](#versiones)
- [Referencias](#referencias)

---

## Descripción general

| Aspecto | Detalle |
|---|---|
| **Versión actual** | 3.0 |
| **Plataforma** | iPhone (iOS) |
| **Automatización** | Atajos + Scriptable |
| **Fuente meteorológica** | Open-Meteo Forecast API |
| **Ejecución recomendada** | Diaria, 07:30 |

La recomendación se calcula para tres momentos habituales del día:

| Momento | Hora de referencia | Contexto |
|---|---|---|
| Salida de casa | 07:50 | Desplazamiento inicial |
| Descanso | 11:10–11:40 | Exposición al aire libre |
| Salida del centro | 14:20 | Regreso a casa |

> Las horas de referencia son configurables en el código. La previsión se obtiene con resolución horaria, por lo que cada franja utiliza el dato más cercano disponible.

## Características principales

- **Recomendación por capas**: sugiere capa base, capa intermedia, capa exterior, pantalón, calzado y accesorios.
- **Contexto meteorológico completo**: considera temperatura, sensación térmica, viento, rachas, precipitación, humedad y UV.
- **Automatización diaria**: diseñada para ejecutarse desde Atajos sin interacción en el flujo automático.
- **Adaptación al transporte**: ajusta la recomendación según el uso de coche o autobús.
- **Historial local**: guarda recomendaciones y valoraciones en el dispositivo.
- **Aprendizaje heurístico**: ajusta progresivamente ciertos parámetros a partir de la valoración del usuario.
- **Ficha visual**: permite consultar el detalle del outfit del día mediante una vista HTML en Scriptable.

## Arquitectura

El proyecto se compone de cinco scripts JavaScript independientes, ubicados en la raíz del repositorio:

| Script | Responsabilidad | Ejecución |
|---|---|---|
| `ropa_diaria.js` | Motor principal: consulta el clima, calcula el outfit, guarda el informe y programa notificaciones. | Automática, desde Atajos (07:30). |
| `configurar_transporte.js` | Define la preferencia de transporte (`coche` / `autobús`). | Manual. |
| `ver_outfit_hoy.js` | Presenta la ficha visual del outfit guardado. | Al tocar la notificación o manual. |
| `valorar_outfit.js` | Registra la valoración del día y actualiza el perfil personal. | Manual o desde recordatorio (20:30). |
| `historial_ropa.js` | Muestra el historial reciente y el estado del perfil aprendido. | Manual. |

### Estructura del repositorio

```text
.
├── README.md
├── LEEME_v3.txt
├── ropa_diaria.js
├── configurar_transporte.js
├── ver_outfit_hoy.js
├── valorar_outfit.js
└── historial_ropa.js
```

### Detalle de componentes

#### `ropa_diaria.js`
Recibe coordenadas desde Atajos en formato `latitud|longitud`, consulta Open-Meteo, calcula la recomendación por franjas, guarda el informe, programa la notificación de la mañana y agenda el recordatorio de valoración de las 20:30. Si no recibe coordenadas, puede intentar obtener la ubicación mediante Scriptable cuando se ejecuta manualmente.

#### `configurar_transporte.js`
Guarda la preferencia de transporte en `ropa_diaria_config.json`. La opción `autobús` incrementa la precaución ante el viento por la posible exposición durante esperas o desplazamientos a pie.

#### `ver_outfit_hoy.js`
Renderiza una ficha HTML con el resumen del día: temperaturas, sensación térmica, rachas, prendas recomendadas, accesorios, condiciones por franja y consejos.

#### `valorar_outfit.js`
Actualiza el perfil personal con un sistema de reglas simple. No utiliza inteligencia artificial ni modelos de aprendizaje automático.

| Valoración | Efecto |
|---|---|
| He pasado frío | Incrementa el ajuste térmico (+0.8, máximo +4 °C). |
| He pasado calor | Reduce el ajuste térmico (-0.8, mínimo -4 °C). |
| El viento me ha molestado | Aumenta la sensibilidad al viento (+1, máximo nivel 3). |
| Me he mojado | Aumenta la precaución ante lluvia (+1, máximo nivel 3). |
| Todo perfecto | Reduce gradualmente los ajustes acumulados. |

#### `historial_ropa.js`
Muestra las últimas 30 recomendaciones y el estado del perfil aprendido. El historial conserva hasta 90 registros diarios.

## Flujo diario

| Momento | Acción | Resultado |
|---|---|---|
| 07:30 | Atajos obtiene la ubicación y ejecuta `Ropa diaria`. | Se generan y guardan los datos del día. |
| 07:30 | Scriptable consulta Open-Meteo y aplica reglas. | Se calcula el outfit recomendado. |
| 07:30 | Se programa la notificación. | El usuario recibe un resumen. |
| 07:30 | Se agenda el recordatorio. | Se prepara la valoración de las 20:30. |
| Al tocar la notificación | Se abre `Ver outfit hoy`. | Ficha visual detallada. |
| 20:30 | El usuario ejecuta `Valorar outfit`. | Se ajusta el perfil personal. |
| Bajo demanda | Se ejecuta `Historial ropa`. | Consulta de registros anteriores. |

## Instalación

### Requisitos previos

- iPhone con iOS compatible con Atajos y Scriptable.
- [Scriptable](https://scriptable.app/) instalado.
- App **Atajos** de Apple.
- Permisos de ubicación (Atajos o Scriptable, según el flujo).
- Permisos de notificaciones para Scriptable.
- Conexión a Internet para consultar Open-Meteo.

### 1. Instalar scripts en Scriptable

1. Abre Scriptable.
2. Crea o actualiza el script `Ropa diaria` con el contenido de `ropa_diaria.js`.
3. Crea el script `Configurar transporte` con `configurar_transporte.js`.
4. Crea el script `Ver outfit hoy` con `ver_outfit_hoy.js`.
5. Crea o conserva `Valorar outfit` y `Historial ropa` con sus archivos correspondientes.
6. Ejecuta **Configurar transporte** una vez, con el iPhone desbloqueado, y selecciona la preferencia inicial.

> **Importante:** los nombres de los scripts deben coincidir exactamente con los indicados, ya que las notificaciones y enlaces internos los localizan por nombre.

### 2. Configurar la automatización en Atajos

Crea una automatización personal de tipo **Hora del día** a las **07:30**, con repetición diaria, y añade las siguientes acciones:

1. **Obtener ubicación actual**.
2. **Obtener detalles de ubicaciones** → entrada: ubicación actual → detalle: **Latitud**.
3. **Obtener detalles de ubicaciones** → entrada: ubicación actual → detalle: **Longitud**.
4. **Texto** → construir `[Latitud]|[Longitud]` usando variables mágicas.
5. **Scriptable → Run Script**:
   - Script: `Ropa diaria`
   - Parameter: texto del paso anterior
   - **Run In App**: desactivado
   - **Show When Run**: desactivado

Desactiva la confirmación previa a la ejecución si iOS lo permite.

### 3. Validación inicial

1. Ejecuta la automatización manualmente con el iPhone desbloqueado.
2. Concede los permisos solicitados.
3. Comprueba que se recibe la notificación.
4. Realiza una prueba temporal con el iPhone bloqueado.
5. Si el resultado es correcto, restaura el horario a las 07:30.

> **Nota operativa:** la ejecución con pantalla bloqueada depende del comportamiento de iOS, los permisos y la configuración del dispositivo. Debe validarse en el equipo real antes de darla por operativa.

## Datos meteorológicos y reglas

### Fuente de datos

El sistema consulta la API de Open-Meteo (`/v1/forecast`) con zona horaria automática y unidades de viento en km/h.

| Variable | Uso |
|---|---|
| Temperatura horaria | Contexto por franja. |
| Sensación térmica horaria | Selección de capas. |
| Temperatura máx./mín. | Resumen térmico diario. |
| Sensación térmica máx./mín. | Respaldo ante datos horarios incompletos. |
| Humedad relativa | Detección de bochorno/humedad. |
| Probabilidad de precipitación | Evaluación de riesgo de lluvia. |
| Precipitación | Protección y calzado. |
| Código meteorológico | Identificación de fenómenos. |
| Velocidad del viento | Contexto de exposición. |
| Rachas de viento | Selección de cortavientos/protección exterior. |
| Índice UV | Recomendación de protección solar. |

### Reglas de vestimenta (orientativas)

| Sensación térmica de referencia | Recomendación base |
|---|---|
| ≤ -2 °C | Térmica/manga larga + capa intermedia gruesa + abrigo de invierno. |
| -2 °C a 3 °C | Manga larga + jersey/sudadera cálida + abrigo de invierno. |
| 3 °C a 7 °C | Camiseta + capa intermedia media + abrigo/chaqueta de invierno. |
| 7 °C a 11 °C | Camiseta + sudadera/jersey + chaqueta de abrigo. |
| 11 °C a 15 °C | Camiseta + capa intermedia ligera + chaqueta ligera. |
| 15 °C a 19 °C | Camiseta + sudadera fina opcional + cortavientos/chaqueta fina. |
| 19 °C a 23 °C | Camiseta + chaqueta fina opcional a primera hora. |
| > 23 °C | Camiseta ligera y transpirable, sin capa intermedia. |

**Ajustes adicionales:**

- Rachas fuertes pueden forzar una capa exterior más cortavientos.
- La lluvia activa recomendación de impermeable y calzado cerrado.
- La amplitud térmica favorece el uso de capas fáciles de quitar.
- El índice UV elevado activa recomendación de gafas/protección solar.
- El transporte en autobús incrementa la precaución ante exposición al viento.

## Privacidad y almacenamiento

Los datos se almacenan localmente en el directorio de documentos de Scriptable:

| Archivo | Propósito |
|---|---|
| `ropa_diaria_config.json` | Preferencia de transporte y metadatos de configuración. |
| `ropa_diaria_profile.json` | Perfil aprendido (ajustes térmicos, viento, lluvia). |
| `ropa_diaria_history.json` | Historial de recomendaciones y valoraciones. |

- No se utiliza servidor propio ni base de datos externa.
- Las coordenadas se redondean a 3 decimales antes de consultarse en Open-Meteo.
- El historial no almacena la coordenada GPS exacta; utiliza una etiqueta genérica de ubicación.
- El historial conserva hasta 90 registros diarios; la vista de historial muestra los 30 más recientes.

## Limitaciones

- Las recomendaciones se basan en reglas generales, no en el armario real del usuario.
- La adaptación personal es heurística; no constituye un sistema de machine learning.
- La previsión meteorológica puede diferir de las condiciones reales.
- La ubicación se evalúa en el momento de la automatización, no de forma continua.
- La ejecución con iPhone bloqueado depende de iOS y debe validarse en cada dispositivo.
- Las acciones interactivas (`Ver outfit hoy`, `Valorar outfit`, `Configurar transporte`) pueden requerir desbloquear el dispositivo.

## Roadmap

- [ ] Catálogo personal de prendas para recomendaciones personalizadas.
- [ ] Selección rápida de transporte desde notificación o widget.
- [ ] Configuración de franjas horarias desde interfaz.
- [ ] Visualización de tendencias de temperatura y valoraciones.
- [ ] Reglas basadas en tiempo real de exposición al aire libre.
- [ ] Valoración por franja horaria en lugar de valoración diaria única.

## Versiones

Las versiones anteriores están disponibles en [GitHub Releases](https://github.com/achrafestudios-lab/ponte-capas/releases):

| Versión | Descripción | Enlace |
|---|---|---|
| v3.0.0 | Automatización sin interacción, configuración de transporte, ficha visual desde notificación. | [Release](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v3.0.0) |
| v2.0.0 | Pantalla visual, historial local y aprendizaje por valoraciones. | [Release](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v2.0.0) |
| v1.0.0 | Recomendación básica por clima con notificación local. | [Release](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v1.0.0) |

## Referencias

- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
- [Scriptable Documentation](https://docs.scriptable.app/)
- [Apple Shortcuts User Guide](https://support.apple.com/es-es/guide/shortcuts/welcome/ios)

---

<sub>Estado del proyecto: **v3.0** — preparado para instalación y prueba. Se recomienda validar la ejecución automática con el iPhone bloqueado antes de su uso diario.</sub>