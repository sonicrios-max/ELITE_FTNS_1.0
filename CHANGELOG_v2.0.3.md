# Changelog - Elite Fitness v2.0.3

Este changelog detalla el registro de mejoras, corrección de bugs y optimizaciones en el backend y frontend implementados para la versión 2.0.3 de la plataforma.

---

## 🚀 Nuevas Funcionalidades (Features)

* **Checklists de Trazabilidad en Tiempo Real (Rutina y Nutrición)**:
  - Se añadieron *checkboxes* interactivos al lado de cada ejercicio y alimento en el Portal del Cliente.
  - Los progresos del cliente se guardan instantáneamente en el backend (vía `daily_logs` en las columnas `completed_exercises` y `completed_meals`).
  - El entrenador puede ver exactamente qué ejercicios y comidas completó el cliente en cada día seleccionado del calendario de trazabilidad.

* **Buscador y Unificación de Selección de Rutina ("Cambiar Rutina")**:
  - Se unificaron los botones de asignar y desasignar plan en una única interfaz llamada **"Cambiar Rutina"** en la pestaña del cliente.
  - El nuevo modal implementa una barra de búsqueda que filtra dinámicamente las rutinas del entrenador por título en tiempo real.
  - Las rutinas disponibles se visualizan en un listado responsivo con scroll independiente mediante tarjetas interactivas clickables que muestran el número de días y la descripción del plan.
  - Al guardar los cambios, el sistema desasigna automáticamente la rutina previa del cliente si existía y le vincula la nueva rutina.

* **Copia por Defecto para Nuevos Entrenadores (Multi-Tenant)**:
  - Al registrar un nuevo entrenador, el sistema copia de forma automática el catálogo de ejercicios globales (`exercises`) y la biblioteca de alimentos (`food_library`) desde la base de datos de administración (`trainer_admin.db`), asegurando que todos inicien con un catálogo inicial rico y no una base de datos vacía.

---

## 🛠️ Correcciones de Errores (Bug Fixes)

* **Fix en Visibilidad de Modales en Móviles (z-index)**:
  - Se corrigió el bug por el cual las ventanas emergentes de asignación y edición en el portal del entrenador no aparecían en móvil. Esto ocurría porque el panel deslizable de la ficha del cliente tiene un `z-index: 10000`, tapando a los modales (que tenían un `z-index: 1000` / `2000`).
  - Se actualizaron los modales del HTML y los generados por JavaScript en [trainer.js](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/trainer/trainer.js) a un `z-index` de `20000`.
  - Se agregó una regla en [style.css](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/shared/style.css) para forzar globalmente un `z-index: 20000 !important` a todos los modales para evitar problemas de capas.

* **Fix de Modales Vacíos en Calendario de Trazabilidad**:
  - Se resolvió el conflicto de duplicación de IDs en el DOM (`dayDetailDate` y `dayDetailContent`) eliminando el bloque fijo inferior (`dayDetailPanel`) y redirigiendo la inyección de datos de trazabilidad diaria únicamente a la ventana emergente (`dayDetailModal`). Ahora el modal muestra correctamente la información y checklists del día al pulsar sobre el calendario.

* **Persistencia Parcial de Logs Diarios**:
  - Se actualizó el endpoint de logs diarios en el backend para realizar un *merge* correcto mediante consultas personalizadas en SQLite (`sqlite3.Row`), evitando que campos parciales borren datos de registros de checklist o peso del mismo día.

---

## 🎨 Optimizaciones de UI / UX

* **Actualización en Tiempo Real de Sliders**:
  - Los sliders de Calidad del Sueño y Adherencia a la Dieta en el Portal del Cliente ahora muestran su valor numérico en pantalla en tiempo real cuando el usuario los desliza.
* **Landing Page Limpia de Clientes**:
  - Al iniciar sesión como entrenador, no se selecciona automáticamente el primer cliente para evitar que se deslice la ficha de cliente de forma intrusiva en móvil. Se muestra una tarjeta de bienvenida hasta que el entrenador seleccione explícitamente a su asesorado.
