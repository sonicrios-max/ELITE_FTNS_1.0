# Changelog - Elite Fitness v2.0.2

## 🚀 Nuevas Funcionalidades (Features)
* **Edición de Valoraciones Físicas:** Se integró completamente la funcionalidad para "Editar Valoraciones" antropométricas directamente desde la interfaz del entrenador, incluyendo su respectivo modal UI y la ruta en la API (`PUT /api/assessments`).
* **Vista de Detalles Diarios (Calendario):** Se agregó una función interactiva en el calendario de rutinas del cliente. Ahora, al hacer clic sobre cualquier día registrado, se despliega una ventana flotante limpia que muestra el Peso, Actividad, Descanso, Hidratación y Cumplimiento Dietético exacto de ese día.

## 🛠️ Correcciones de Errores (Bug Fixes)
* **Fix Eliminar Valoración:** Se corrigió el error del botón de "Eliminar Valoración", vinculando de manera correcta el ID de la tabla para que la acción se refleje exitosamente en la base de datos sin errores de interfaz.
* **Fix Visualización de Rutinas Asignadas:** Se reparó la falla en la comunicación (payload) donde las rutinas de fuerza y bloques asignados a un cliente no aparecían en su perfil. Ahora la data se carga, mapea y renderiza al instante en la vista de *Rutina Asignada*.

## 🎨 Optimizaciones de UI / UX y Diseño Responsivo
* **Soporte Landscape (Modo Horizontal en Móviles):** Se ajustaron los *breakpoints* globales del diseño (CSS y JavaScript) de `768px` a `1024px`. Esto asegura que al voltear un teléfono móvil o usar pantallas pequeñas horizontales, el sistema mantenga la experiencia de App Móvil (con la botonera inferior de navegación) en lugar de forzar el modo escritorio.
* **Reestructuración de Indicadores (KPIs):** Los bloques de indicadores (Masa Libre de Grasa, Grasa Corporal, etc.) ya no consumen la pantalla completa de forma errática. Fueron acoplados en una cuadrícula (grid) organizada y unificada debajo de la información base del cliente en el Dashboard del entrenador.
* **Tablas de Datos Ultra-Compactas:** Se rediseñaron drásticamente las tablas de "Librería de Ejercicios", "Rutinas", "Dieta" y "Alimentos".
    * Inserción de *Scroll horizontal* nativo (`overflow-x: auto`) para que no rompan los bordes en pantallas chicas.
    * Reducción de relleno de celdas (`padding: 4px`), tamaños de fuente a `11px`, e íconos más pequeños.
    * Los títulos principales (`h2` a `h3`) y los márgenes de las tarjetas fueron comprimidos drásticamente, permitiendo visualizar muchos más datos sin requerir *scroll* excesivo.
