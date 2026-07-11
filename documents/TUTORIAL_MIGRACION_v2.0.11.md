# Guía Tutorial de Verificación: Migración v2.0.11

Esta guía detalla los pasos prácticos para levantar la plataforma localmente y probar de forma manual las nuevas funcionalidades agregadas en esta versión (v2.0.11) en cualquier dispositivo.

---

## 🛠️ Paso 1: Levantar el Servidor Local y Sembrar Datos

Abre una terminal en el directorio raíz del proyecto y ejecuta los siguientes comandos:

1. **Asegurar dependencias e inicializar base de datos:**
   ```bash
   pip install -r requirements.txt
   python scripts/init_db.py
   ```
2. **Cargar los datos de prueba (Excel de Brayan y semillas de rutinas/comidas):**
   ```bash
   python scripts/parse_and_seed.py
   python scripts/seed_details.py
   ```
3. **Ejecutar el backend:**
   ```bash
   python server.py
   ```
   *El servidor quedará corriendo en `http://localhost:8080`.*

---

## 🏃 Paso 2: Probar el Bloqueo Automático por Cambio de Fecha (Workout Locking)

1. Abre tu navegador e ingresa al **Portal del Cliente** usando la cuenta de Brayan:
   [http://localhost:8080/client/?userId=1](http://localhost:8080/client/?userId=1)
2. Navega a la pestaña de **Entrenamiento**.
3. Selecciona un día de entrenamiento activo, por ejemplo: **"Lunes: Empuje"** haciendo clic en *"Entrenar Hoy"*.
   * Verás que la tarjeta del lunes se pinta con borde verde y badge **[Activo Hoy]**.
   * Los checkboxes del lunes quedan desbloqueados. Marca algunos para simular progreso.
4. **Simular transición de fecha:**
   * Abre la Consola de Desarrollador del navegador (presiona `F12` y ve a la pestaña *Console*).
   * Para simular que es mañana, cambiaremos temporalmente el formato de fecha que lee el navegador redefiniendo el método `toISOString` de las fechas:
     ```javascript
     Date.prototype.toISOString = function() {
         return "2026-07-12T18:00:00.000Z"; // Forzar fecha al día siguiente (martes)
     };
     ```
   * Ahora, recarga la página o cambia de pestaña y regresa a "Entrenamiento".
   * **Comportamiento esperado:** 
     * El sistema detecta que es un nuevo día y que no hay registro activo guardado para el martes `2026-07-12`.
     * Automáticamente se selecciona el **"Día de Descanso"** (verás el mensaje de recuperación en el header superior).
     * Los checkboxes del día lunes (y todos los demás) quedan bloqueados (en solo lectura) para evitar registros cruzados accidentales.
     * Si vuelves a simular la fecha del lunes (`2026-07-11`), verás que el lunes vuelve a cargarse como activo con los checkboxes que habías marcado intactos.

---

## 🥗 Paso 3: Probar la Biblioteca de Alimentos (Títulos y Campos de Solo Lectura)

1. Abre tu navegador e ingresa al **Portal del Entrenador**:
   [http://localhost:8080/trainer/](http://localhost:8080/trainer/)
2. En la barra lateral, haz clic en **Clientes** y selecciona un cliente (por ejemplo, Carlos Gomez o Brayan Guerrero).
3. Dirígete a la pestaña **Nutrición** y haz clic en **"Nuevo Plan"** (o edita uno existente).
4. **Comportamiento esperado 1 (Títulos de Columnas):**
   * Encima de la lista de ingredientes, verás una cabecera alineada con textos claros: **"Alimento"**, **"Peso (g)"**, **"Calorías (kcal)"**, **"Proteínas (g)"**, **"Carbohidratos (g)"** y **"Grasas (g)"**.
5. **Comportamiento esperado 2 (Bloqueo de Macros Auto-calculados):**
   * En la caja de texto "Alimento", escribe `"Arroz"` y selecciona **"Arroz Blanco"** del menú desplegable de autocompletado.
   * Al seleccionarlo, verás que los campos de Calorías, Proteínas, Carbohidratos y Grasas se rellenan automáticamente, se sombrean en color gris translúcido, y el cursor cambia indicando que **no se pueden editar**.
   * Escribe un peso diferente en la columna "Peso (g)" (por ejemplo, cambia de `100` a `250`). Verás que los macros se auto-escalan proporcionalmente al instante, pero siguen bloqueados sin permitir que el entrenador altere manualmente el cálculo nutricional base del alimento.
   * Borra el nombre del alimento. Verás que las celdas de macros vuelven a ser editables para que puedas configurarlas a mano si estuvieras creando un ingrediente personalizado fuera de la biblioteca.
