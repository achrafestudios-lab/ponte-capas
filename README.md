# PonteCapas

Automatización para iPhone que recomienda qué ropa ponerte según el tiempo de tu ubicación.

Usa **Atajos** + **Scriptable** y consulta [Open-Meteo](https://open-meteo.com/) para las franjas del día: **07:50**, **11:10–11:40** y **14:20**.

## Qué hace

- Calcula un outfit por capas según temperatura, sensación térmica, viento, lluvia, humedad y UV.
- Adapta la recomendación a tu transporte (**coche** o **autobús**) y a tu preferencia térmica (**friolero**, **normal** o **caluroso**).
- Envía una notificación diaria con el resumen del outfit.
- Al tocar la notificación, abre una ficha visual con el detalle.
- Guarda historial y valoraciones en local para ajustar futuras recomendaciones.
- Permite consultar historial y estadísticas de 7, 30 o 90 días.

## Scripts

| Script en Scriptable | Función |
|---|---|
| `Ropa diaria` | Genera la recomendación diaria y programa notificaciones. |
| `Configurar transporte` | Guarda transporte y preferencia térmica. |
| `Ver outfit hoy` | Muestra la ficha visual del día. |
| `Valorar outfit` | Registra frío, calor, viento, lluvia o perfecto. |
| `Historial ropa` | Muestra historial y estadísticas por periodo. |

> Los nombres deben ser **exactos**, porque las notificaciones abren los scripts por nombre.

## Instalación paso a paso

### 1. Requisitos

- iPhone con **Atajos** y **Scriptable** instalados.
- Conexión a Internet.
- Permisos de **ubicación** para Atajos.
- Permisos de **notificaciones** para Scriptable.

### 2. Instalar los scripts en Scriptable

1. Copia los archivos `.js` del proyecto.
2. En Scriptable, crea/actualiza estos scripts con el nombre exacto:
   - `Ropa diaria` ← `ropa_diaria.js`
   - `Configurar transporte` ← `configurar_transporte.js`
   - `Ver outfit hoy` ← `ver_outfit_hoy.js`
   - `Valorar outfit` ← `valorar_outfit.js`
   - `Historial ropa` ← `historial_ropa.js`
3. Comprueba que los 5 scripts aparecen en Scriptable.

### 3. Configurar preferencias

1. Abre Scriptable con el iPhone desbloqueado.
2. Ejecuta **Configurar transporte**.
3. Elige **Coche** o **Autobús**.
4. Elige tu preferencia térmica: **friolero**, **normal** o **caluroso**.
5. La configuración queda guardada hasta que la cambies.

### 4. Crear la automatización de las 07:30 en Atajos

1. Abre **Atajos** → **Automatización** → crea una automatización personal de **Hora del día**.
2. Configura:
   - Hora: **07:30**
   - Repetir: **Cada día**
3. Añade las acciones en este orden:

| Orden | Acción | Configuración |
|---|---|---|
| 1 | **Obtener ubicación actual** | No escribas una ciudad fija. |
| 2 | **Obtener detalles de ubicaciones** | Entrada: ubicación actual. Detalle: **Latitud**. |
| 3 | **Obtener detalles de ubicaciones** | Entrada: la misma ubicación actual. Detalle: **Longitud**. |
| 4 | **Texto** | Escribe: `Latitud|Longitud` usando las variables mágicas de los pasos 2 y 3. |
| 5 | **Scriptable → Run Script** | Script: `Ropa diaria`. Parameter: el **Texto** del paso 4. |

4. En la acción **Run Script**, revisa:
   - **Parameter**: salida del Texto (`Latitud|Longitud`).
   - **Texts / URLs / Images / Files**: vacíos.
   - **Run In App**: **desactivado**.
   - **Show When Run / Mostrar al ejecutar**: **desactivado**.
5. Desactiva la confirmación previa si iOS lo permite.
6. Si aparece en Privacidad, activa **Permitir ejecución con el dispositivo bloqueado**.
7. Guarda la automatización.

### 5. Hacer la prueba obligatoria

#### Prueba A: iPhone desbloqueado

1. Ejecuta la automatización manualmente con el iPhone desbloqueado.
2. Acepta los permisos si iOS los pide.
3. Comprueba que llega la notificación con el resumen del outfit.
4. Toca la notificación y verifica que abre **Ver outfit hoy**.

#### Prueba B: iPhone bloqueado

1. Cambia temporalmente la hora de la automatización a dentro de 2–3 minutos.
2. Bloquea el iPhone y espera sin tocarlo.
3. Comprueba si llega la notificación.
4. Si funciona, vuelve a poner la automatización a las **07:30**.

> **Importante:** la ejecución con pantalla bloqueada depende de iOS, permisos y configuración del dispositivo. No la des por operativa hasta superar la prueba bloqueada.

## Uso diario

- **07:30**: Atajos ejecuta `Ropa diaria` y recibes la notificación.
- **Al tocar la notificación**: se abre `Ver outfit hoy`.
- **20:30**: el script programa un recordatorio para valorar el outfit. No necesitas otra automatización.
- **Cuando quieras**: usa `Configurar transporte` o `Historial ropa`.

## Privacidad

- No usa servidor propio.
- Las coordenadas se redondean a 3 decimales antes de consultar Open-Meteo.
- El historial, perfil y configuración se guardan localmente en Scriptable.
- El historial conserva hasta 365 registros diarios.

## Versiones

Versión actual en el repo: **v4.0**. Versiones anteriores en [GitHub Releases](https://github.com/achrafestudios-lab/ponte-capas/releases):

- [v4.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v4.0.0)
- [v3.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v3.0.0)
- [v2.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v2.0.0)
- [v1.0.0](https://github.com/achrafestudios-lab/ponte-capas/releases/tag/v1.0.0)