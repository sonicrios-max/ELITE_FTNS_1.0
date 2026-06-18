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
