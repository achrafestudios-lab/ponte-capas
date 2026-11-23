# PonteCapas (Ropa diaria)

Asistente personal de recomendaciones de vestimenta según el tiempo para iPhone.

> **Versión actual:** 3.0 · **Plataforma:** iPhone (iOS) · Atajos · Scriptable · **Servicio meteorológico:** Open-Meteo  
> **Releases anteriores:** [v1.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v1.0.0) · [v2.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v2.0.0) · [v3.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v3.0.0)

## 1. Descripción del proyecto

Ropa diaria es una automatización para iPhone que consulta la previsión meteorológica de la ubicación actual y transforma esos datos en una recomendación práctica de vestimenta.

El objetivo es ayudar a elegir la ropa adecuada para toda la jornada, evitando pasar frío por la mañana o calor cuando suben las temperaturas. Para ello, el sistema tiene en cuenta la temperatura, la sensación térmica, el viento, las rachas, la lluvia, la humedad y el índice UV.

La recomendación está pensada especialmente para tres momentos habituales:

| Momento | Hora de referencia | Situación |
|---|---|---|
| Salida de casa | 07:50 | Desplazamiento inicial |
| Descanso | 11:10–11:40 | Tiempo al aire libre |
| Salida del centro | 14:20 | Regreso a casa |

Las horas son configurables en el código. La previsión horaria se consulta por horas, por lo que cada franja utiliza el dato horario más cercano.

## 2. Objetivos

- Obtener la ubicación actual del iPhone, sin depender de una ciudad fija.
- Consultar automáticamente la previsión del día.
- Recomendar prendas concretas y combinables por capas.
- Adaptar las recomendaciones al transporte habitual: coche o autobús.
- Mostrar una notificación diaria con un resumen del outfit.
- Permitir abrir una ficha visual con más detalles.
- Guardar las recomendaciones y las valoraciones del usuario.
- Ajustar progresivamente algunas reglas a partir de las valoraciones personales.
- Mantener los datos del historial y del perfil en el almacenamiento local de Scriptable.

## 3. Tecnologías utilizadas

| Tecnología | Función |
|---|---|
| Atajos de Apple | Inicia el proceso diariamente a las 07:30 y obtiene la ubicación. |
| Scriptable | Ejecuta los scripts JavaScript, consulta la API, guarda los datos y programa notificaciones. |
| JavaScript | Implementa las reglas de recomendación, el historial y las valoraciones. |
| Open-Meteo API | Proporciona los datos meteorológicos. |
| JSON | Almacena la configuración, el perfil personal y el historial. |
| HTML y CSS | Construyen las fichas visuales que se muestran mediante WebView. |

No necesita un servidor propio ni una base de datos externa. La consulta meteorológica requiere conexión a Internet.

## 4. Arquitectura y scripts

El proyecto está dividido en cinco scripts independientes que se guardan en la biblioteca de Scriptable.

| Script | Responsabilidad | Cómo se ejecuta |
|---|---|---|
| `ropa_diaria.js` | Consulta el tiempo, calcula el outfit, guarda el informe y programa notificaciones. | Automáticamente desde Atajos a las 07:30. |
| `configurar_transporte.js` | Permite elegir coche o autobús y guardar la preferencia. | Manualmente cuando se quiera cambiar. |
| `ver_outfit_hoy.js` | Presenta la recomendación guardada en una ficha visual. | Al tocar la notificación de la mañana o ejecutarlo manualmente. |
| `valorar_outfit.js` | Registra cómo se ha encontrado el usuario y modifica el perfil personal. | Al abrir el recordatorio de las 20:30. |
| `historial_ropa.js` | Muestra las últimas recomendaciones y el estado del perfil aprendido. | Manualmente cuando se quiera consultar. |

### 4.1. `ropa_diaria.js`

Es el motor principal. Está diseñado para ejecutarse sin mostrar preguntas ni abrir una interfaz durante el cálculo.

Recibe desde Atajos las coordenadas en formato de texto:

```text
latitud|longitud
```

Por ejemplo, Atajos construye ese texto usando las variables de latitud y longitud obtenidas de la ubicación actual. Si el script se ejecuta manualmente y no recibe coordenadas, intenta obtener la ubicación mediante los permisos de localización de Scriptable.

Después realiza estas operaciones:

1. Lee la preferencia de transporte y el perfil personal.
2. Consulta la previsión de Open-Meteo.
3. Extrae los datos correspondientes a las tres franjas horarias.
4. Aplica las reglas de vestimenta.
5. Guarda el informe del día.
6. Programa una notificación con un resumen y un enlace para abrir `Ver outfit hoy`.
7. Programa un recordatorio para valorar el outfit a las 20:30.

Si se produce un error, intenta programar una notificación indicando que no se pudo actualizar la recomendación.

### 4.2. `configurar_transporte.js`

Permite seleccionar una de estas opciones:

- **Coche**: opción predeterminada si todavía no existe configuración.
- **Autobús**: aumenta la precaución frente al viento porque puede ser necesario esperar o caminar al aire libre.

La elección se guarda en `ropa_diaria_config.json`. No se pregunta el transporte durante la ejecución automática de las 07:30.

### 4.3. `ver_outfit_hoy.js`

Lee el informe guardado del día y muestra una página HTML adaptada a la pantalla del iPhone. Incluye:

- Temperaturas mínima y máxima.
- Sensación térmica estimada en las franjas consideradas.
- Rachas máximas de viento.
- Capa base, capa intermedia y capa exterior.
- Pantalón y calzado.
- Accesorios recomendados.
- Condiciones meteorológicas de cada franja.
- Consejos adicionales.

La ficha visual requiere abrir Scriptable y puede pedir desbloquear el iPhone.

### 4.4. `valorar_outfit.js`

Permite registrar una valoración al final del día:

| Valoración | Ajuste que realiza |
|---|---|
| He pasado frío | Aumenta el ajuste térmico hasta un límite de +4 °C. |
| He pasado calor | Reduce el ajuste térmico hasta un límite de -4 °C. |
| El viento me ha molestado | Aumenta un nivel la sensibilidad al viento, hasta nivel 3. |
| Me he mojado | Aumenta un nivel la precaución ante la lluvia, hasta nivel 3. |
| Todo perfecto | Reduce gradualmente los ajustes acumulados. |

El script actualiza el perfil y guarda la valoración en el registro del día. Evita aplicar dos veces una valoración al mismo informe.

Este mecanismo no es inteligencia artificial ni aprendizaje automático. Es un sistema sencillo de reglas y parámetros que se ajustan con las respuestas del usuario.

### 4.5. `historial_ropa.js`

Muestra las últimas 30 recomendaciones guardadas y un resumen del perfil personal. El historial puede conservar hasta 90 registros diarios.

## 5. Datos meteorológicos y reglas

El motor consulta la API de previsión de Open-Meteo (`/v1/forecast`) con zona horaria automática y unidades de viento en km/h.

### Variables consultadas

| Variable | Uso en el sistema |
|---|---|
| Temperatura horaria | Contextualizar las franjas del día. |
| Sensación térmica horaria | Elegir las capas de abrigo. |
| Temperatura máxima y mínima | Resumir la amplitud térmica del día. |
| Sensación térmica máxima y mínima | Completar la valoración térmica si falta algún dato horario. |
| Humedad relativa | Detectar condiciones cálidas y húmedas. |
| Probabilidad de precipitación | Valorar el riesgo de lluvia. |
| Precipitación | Recomendar protección y calzado adecuado. |
| Código meteorológico | Identificar lluvia, nieve, niebla, tormentas y otros estados. |
| Velocidad del viento | Complementar el análisis del viento. |
| Rachas de viento | Decidir si conviene una prenda cortavientos. |
| Índice UV | Recomendar gafas de sol y protección solar cuando corresponde. |

### Reglas principales de vestimenta

El motor selecciona las prendas superiores según la sensación térmica más baja entre las franjas analizadas. Como orientación, las reglas actuales son:

| Sensación térmica de referencia | Recomendación general |
|---|---|
| Hasta -2 °C | Camiseta térmica o manga larga, capa intermedia gruesa y abrigo de invierno. |
| De -2 a 3 °C | Manga larga, jersey o sudadera cálida y abrigo de invierno. |
| De 3 a 7 °C | Camiseta, capa intermedia de grosor medio y abrigo o chaqueta de invierno. |
| De 7 a 11 °C | Camiseta, sudadera o jersey y chaqueta de abrigo. |
| De 11 a 15 °C | Camiseta, capa intermedia ligera y chaqueta ligera. |
| De 15 a 19 °C | Camiseta, sudadera fina opcional y cortavientos o chaqueta fina. |
| De 19 a 23 °C | Camiseta y, como mucho, una chaqueta fina opcional a primera hora. |
| Más de 23 °C | Camiseta ligera y transpirable, sin capa intermedia. |

Además:

- Las rachas de viento fuertes pueden sustituir la prenda exterior por una opción más cortavientos.
- Si se espera lluvia, se recomienda chubasquero o chaqueta impermeable.
- Con frío se recomiendan pantalones largos de tejido más grueso y, si procede, bufanda o guantes.
- Con calor se priorizan pantalones y zapatillas ligeras y transpirables.
- Con lluvia se prioriza calzado cerrado que no cale.
- Con índice UV elevado se recomiendan gafas de sol y protección solar.
- Si existe mucha diferencia térmica entre las franjas, se aconsejan capas fáciles de quitar.

Los valores son umbrales iniciales y deben ajustarse con el uso y las valoraciones personales. La recomendación es orientativa: no conoce el armario real del usuario ni el aislamiento exacto de cada prenda.

## 6. Flujo diario

| Hora aproximada | Acción |
|---|---|
| 07:30 | La automatización de Atajos obtiene la ubicación y ejecuta `Ropa diaria`. |
| 07:30 | Scriptable consulta Open-Meteo y calcula la recomendación. |
| 07:30 | Se guarda el informe y se programa la notificación de la mañana. |
| 07:30 | Se programa un recordatorio para las 20:30. |
| Al tocar la notificación | Se abre `Ver outfit hoy` para consultar el detalle. |
| 20:30 | Llega el recordatorio para ejecutar `Valorar outfit`. |
| Cuando se quiera | Se puede ejecutar `Historial ropa` para consultar los registros. |

La notificación de la mañana contiene un resumen del outfit. La ficha completa se abre al tocarla.

## 7. Instalación

### Requisitos

- iPhone con iOS y las aplicaciones Atajos y Scriptable instaladas.
- Permisos de ubicación para Atajos o Scriptable, según el método de ejecución.
- Permiso de notificaciones para Scriptable.
- Conexión a Internet para consultar Open-Meteo.

### 7.1. Instalar los scripts en Scriptable

1. Abre Scriptable.
2. Conserva una copia de la versión anterior si deseas poder volver atrás.
3. Abre el script existente `Ropa diaria` y sustituye su contenido por el archivo `ropa_diaria.js` de la V3.
4. Crea un script llamado exactamente `Configurar transporte` y pega `configurar_transporte.js`.
5. Crea un script llamado exactamente `Ver outfit hoy` y pega `ver_outfit_hoy.js`.
6. Conserva `Valorar outfit` e `Historial ropa` de la V2. Si no están instalados, créalos usando los archivos incluidos en el paquete V3.
7. Ejecuta una vez `Configurar transporte` con el iPhone desbloqueado y selecciona coche o autobús.

**Importante:** los nombres deben coincidir con los que se indican, porque los enlaces de las notificaciones buscan los scripts por su nombre.

### 7.2. Configurar Atajos para las 07:30

Crea o edita una automatización personal de tipo **Hora del día**, con repetición diaria a las 07:30.

Dentro de la automatización, añade las acciones en este orden:

1. **Obtener ubicación actual**.
2. **Obtener detalles de ubicaciones**: selecciona la ubicación del paso anterior y extrae **Latitud**.
3. **Obtener detalles de ubicaciones**: selecciona la misma ubicación y extrae **Longitud**.
4. **Texto**: construye el texto con la variable de latitud, el carácter `|` y la variable de longitud. El resultado debe tener este formato: `[Latitud]|[Longitud]`.
5. **Scriptable → Run Script**: selecciona `Ropa diaria` y pasa el resultado del paso Texto en el campo **Parameter**.

En la acción de Scriptable, deja vacíos los campos que no se utilizan (Texts, URLs, Images y Files) y desactiva **Run In App** y **Show When Run** si esas opciones aparecen en tu versión.

Configura la automatización para ejecutarse sin pedir confirmación, cuando iOS ofrezca esa opción. Concede los permisos que solicite durante una primera ejecución manual.

### 7.3. Primera prueba

Antes de confiar en el horario diario:

1. Ejecuta la automatización manualmente con el iPhone desbloqueado.
2. Comprueba que se obtiene la ubicación, se consulta el tiempo y llega la notificación.
3. Cambia temporalmente la hora de la automatización a unos minutos más tarde.
4. Bloquea el iPhone y espera la ejecución.
5. Comprueba si llega la notificación sin abrir Scriptable.
6. Si funciona, restaura el horario a las 07:30.

## 8. Ejecución con el iPhone bloqueado: limitación importante

La V3 elimina las ventanas `Alert` y `WebView` del flujo automático de las 07:30. La ubicación se obtiene en Atajos y se pasa como parámetro al script. Esto reduce la necesidad de interacción durante la ejecución programada.

Sin embargo, no se puede garantizar únicamente por el código que Scriptable vaya a ejecutarse en segundo plano en todos los iPhone o versiones de iOS. El resultado depende de iOS, de los permisos, de las opciones disponibles en Atajos y de cómo se ejecute la acción de Scriptable en el dispositivo.

Por eso, la prueba con el teléfono bloqueado descrita en el apartado anterior es obligatoria antes de considerar la automatización terminada.

Las funciones `Ver outfit hoy`, `Configurar transporte` y `Valorar outfit` sí muestran interfaces interactivas. Para utilizarlas puede ser necesario abrir Scriptable y desbloquear el iPhone.

## 9. Archivos de datos y privacidad

Scriptable guarda los datos en su directorio local de documentos. La V3 utiliza estos archivos JSON:

| Archivo | Contenido |
|---|---|
| `ropa_diaria_config.json` | Preferencia de transporte y fecha de modificación. |
| `ropa_diaria_profile.json` | Ajustes térmicos, sensibilidad al viento y precaución frente a la lluvia. |
| `ropa_diaria_history.json` | Recomendaciones diarias y valoraciones. |

La V3 reutiliza los archivos de perfil e historial de la V2, por lo que no es necesario borrarlos al actualizar.

Las coordenadas se reciben desde Atajos y se redondean a tres decimales al construir la consulta a Open-Meteo. El historial no almacena la coordenada GPS exacta; guarda la etiqueta genérica `Ubicacion GPS`.

El historial conserva como máximo 90 registros diarios. La pantalla de historial muestra los 30 más recientes.

## 10. Limitaciones conocidas y posibles mejoras

### Limitaciones actuales

- Las recomendaciones se basan en reglas generales, no en un catálogo de prendas que el usuario tenga realmente.
- La adaptación personal es un ajuste heurístico; no es un modelo de inteligencia artificial.
- El transporte se configura manualmente y se mantiene hasta que el usuario lo cambie.
- La ubicación se consulta en el momento de la automatización de las 07:30; no sigue al usuario durante el día.
- La previsión puede cambiar y no garantiza que las condiciones reales coincidan exactamente.
- La ejecución con el dispositivo bloqueado debe verificarse en el iPhone real.
- Consultar la ficha visual y registrar valoraciones requiere interacción.

### Mejoras futuras

- Crear un catálogo personal de prendas para recomendar solo ropa disponible.
- Añadir selección de transporte directamente desde una notificación o widget compatible.
- Permitir ajustar las horas de salida y descanso desde una pantalla de configuración.
- Añadir gráficos de evolución de temperatura y valoraciones.
- Mejorar las reglas con más información sobre la duración de los desplazamientos y el tiempo real que se pasa al aire libre.
- Añadir una opción para indicar si se ha pasado frío o calor en una franja concreta, en vez de valorar todo el día de una sola vez.

## 11. Versiones anteriores

Las versiones anteriores están disponibles como releases con ZIP adjunto:

- [v1.0.0 - Recomendación básica por clima](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v1.0.0)
- [v2.0.0 - Pantalla visual, historial y aprendizaje](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v2.0.0)
- [v3.0.0 - Automatización sin interacción](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v3.0.0)

## 12. Referencias

- [Open-Meteo — Forecast API](https://open-meteo.com/en/docs)
- [Scriptable — Documentación](https://docs.scriptable.app/)
- [Apple — Manual de Atajos](https://support.apple.com/es-es/guide/shortcuts/welcome/ios)

---

Estado del proyecto: versión 3.0 preparada para instalar y probar. La ejecución automática con el iPhone bloqueado debe validarse en el dispositivo antes de darla por operativa.