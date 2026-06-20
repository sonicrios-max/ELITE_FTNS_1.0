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

## 7. Fórmulas Matemáticas Personalizadas e Indicadores Dinámicos
* **Propósito**: Dar libertad a los entrenadores para crear sus propios indicadores (KPIs) usando las variables personalizadas de sus fichas antropométricas.
* **Implementación**: 
  * Permitir al entrenador definir fórmulas con sintaxis simple (ej. `(Pecho - Cintura) / Altura`).
  * El sistema evaluará estas fórmulas dinámicamente usando eval seguro (o un parser matemático) para generar gráficas de progreso personalizadas.
  * **Advertencias de Dependencia**: Si el entrenador intenta ocultar/eliminar un campo de la ficha base (ej. Peso) que está siendo utilizado en un indicador (ej. BMI o Fórmula Personalizada), el sistema lanzará una advertencia previniendo la ruptura de la lógica.
