# Ideas de Mejora para la Base de Datos

Estas ideas fueron propuestas para mejorar la inteligencia, automatización y coherencia de los datos del sistema de fitness. Se guardan aquí para futura referencia y no se implementarán en esta fase.

---

## 1. Cálculo Automático del Gasto Metabólico Basal (BMR)
* **Propósito**: Calcular automáticamente las calorías quemadas en reposo.
* **Fórmula sugerida (Katch-McArdle)**:
  $$BMR = 370 + (21.6 \times lean\_mass\_kg)$$
* **Implementación**: Crear un trigger en SQLite o calcular en el servidor cuando se registre una valoración antropométrica con grasa/masa magra.

## 2. Estimación del 1RM (1-Repetition Maximum) en Fuerza
* **Propósito**: Medir la progresión de la fuerza del usuario a lo largo del tiempo de manera estandarizada.
* **Fórmula sugerida (Epley)**:
  $$1RM = weight\_kg \times \left(1 + \frac{reps\_completed}{30}\right)$$
* **Implementación**: Añadir un campo calculado en una vista de SQLite o calcular al registrar un set en `set_logs`.

## 3. Automatización y Validación RPE $\leftrightarrow$ RIR
* **Propósito**: Reducir fricción al registrar entrenamientos y evitar incongruencias físicas.
* **Lógica**: 
  $$RIR = 10 - RPE$$
* **Implementación**: El frontend o el backend debe autocompletar una de las dos variables a partir de la otra y lanzar advertencias si no coinciden.

## 4. Volumen Total de Entrenamiento (Tonnage)
* **Propósito**: Evaluar la sobrecarga progresiva a nivel semanal y por sesión.
* **Lógica**:
  $$Volumen = Sets \times Reps \times Weight$$
* **Implementación**: Generar reportes semanales sumando el volumen en `set_logs`.

## 5. Score de Adherencia Nutricional Real
* **Propósito**: Medición objetiva en lugar de la escala subjetiva (1-10) del usuario.
* **Lógica**:
  $$Adherencia = 100 - \left(\frac{|Calorias\_Consumidas - Calorias\_Meta|}{Calorias\_Meta} \times 100\right)$$
* **Implementación**: Comparar la suma de calorías de `meal_items` de un día contra el `target_calories` de la fecha correspondiente.

## 6. Persistencia de Base de Datos en la Nube (Render + SQLite Efímero)
* **Problema**: En el plan gratuito de Render, los contenedores son **efímeros**. Cada vez que el servidor entra en suspensión por inactividad (después de 15 minutos) o se realiza un despliegue, el archivo de base de datos local `fitness.db` se borra y se restablece al estado del Git.
* **Soluciones propuestas**:
  * **Opción A (Sencilla)**: Crear un **Persistent Volume** (disco duro persistente) en Render (con un costo aproximado de $1 USD al mes) y montar la carpeta `/database` para mantener el archivo `fitness.db` a salvo de reinicios.
  * **Opción B (Escalable)**: Migrar el backend (`server.py`) para utilizar una base de datos PostgreSQL en la nube gratuita (como **Supabase** o **Neon**), eliminando la dependencia de SQLite local.
* **Mantener Servidor Activo (Keep-awake)**: Utilizar servicios gratuitos como **UptimeRobot** o **cron-job.org** para enviar un ping HTTP cada 10-12 minutos a la URL de Render, evitando que entre en modo de suspensión y eliminando la demora de 30 segundos de arranque inicial.

## 7. Fórmulas Matemáticas Personalizadas e Indicadores Dinámicos (Biblioteca de KPIs)
* **Propósito**: Permitir a los entrenadores definir indicadores personalizados (KPIs) utilizando fórmulas matemáticas basadas en datos históricos.
* **Biblioteca de KPIs**:
  * Ubicada en la barra de navegación del coach al lado de la "Biblioteca de Alimentos" y de "Alimentos".
  * **Diseño del Panel**: Agrupar los catálogos ("Alimentos", "Ejercicios", "Rutinas", "KPIs") en un menú desplegable de "Bibliotecas" en la cabecera para evitar la sobrecarga visual.
* **Orígenes de Datos**:
  * **Fichas Antropométricas**: Peso, pliegues cutáneos (tríceps, abdominal, etc.) y circunferencias (cintura, pecho, etc.).
  * **Reportes Diarios**: Pasos, horas de sueño, consumo de agua, RPE, etc.
* **Operaciones y Agregaciones Temporales**:
  * Sintaxis simple de fórmulas aritméticas: `+`, `-`, `*`, `/`, `()`.
  * Funciones temporales configurables:
    * *Valor Actual*: Último dato registrado en la fecha seleccionada.
    * *Promedio*: Media histórica calculada sobre un número `N` de registros seleccionados.
    * *Total*: Suma acumulada de la variable elegida a lo largo de un período de tiempo.
* **Validación de Dependencias**: Si se intenta ocultar o eliminar un campo base de la ficha antropométrica o reporte diario que esté en uso en alguna fórmula de la biblioteca, el sistema alertará del bloqueo para evitar fallos matemáticos.

## 8. Ajuste de Breakpoints para Modo Horizontal (Landscape) en Dispositivos Muy Anchos
* **Problema**: El modo horizontal (landscape) se adaptó al cambiar el breakpoint CSS/JS a `1024px`, lo que funciona perfecto en dispositivos como el iPhone 15 Pro Max o iPhone 12. Sin embargo, en dispositivos inusualmente anchos o largos como el Motorola Edge 50 Fusion, el ancho de pantalla horizontal supera los `1024px`, causando que la aplicación revierta al diseño web (escritorio) en lugar de mostrar la app móvil.
* **Solución Propuesta**: 
  * Investigar y posiblemente aumentar el breakpoint principal para móviles a `1200px` o superior si se detectan este tipo de resoluciones en móviles.
  * Implementar el uso directo de media queries combinadas con la orientación física, ej: `@media (max-width: 1200px) and (orientation: landscape), (max-width: 1024px)` para forzar explícitamente el layout móvil basándose en la orientación.

## 9. Implementaciones Realizadas (Versión v2.0.3)
* **Checklists de Trazabilidad Diaria en Base de Datos**:
  - **Estructura**: Se implementaron y migraron las columnas `completed_exercises` (TEXT) y `completed_meals` (TEXT) en la tabla `daily_logs` para almacenar de forma serializada (en formato JSON) los IDs de ejercicios y alimentos completados diariamente por el cliente.
  - **Lógica**: Se desarrolló en `server.py` la persistencia parcial mediante el uso de `sqlite3.Row`, permitiendo combinar el estado de checklists con registros previos sin sobreescrituras accidentales de datos de peso u horas de sueño del mismo día.
* **Fix Global de Capas (Z-Index en Modales)**:
  - **Resolución**: Se determinó que el panel deslizable lateral de la ficha de cliente en móviles (`.main-content.mobile-open`) usa un `z-index: 10000`. Todos los modales del entrenador (añadir cliente, editar perfil, cambiar rutina, etc.) fueron ajustados globalmente en `style.css` y archivos de javascript a un `z-index: 20000 !important` para asegurar que siempre floten por encima en pantallas móviles.
* **Unificación de Modales de Trazabilidad**:
  - Se eliminó el bloque duplicado `dayDetailPanel` del HTML para evitar colisiones de IDs y asegurar que la trazabilidad diaria se despliegue de manera única en el modal emergente `dayDetailModal`.

