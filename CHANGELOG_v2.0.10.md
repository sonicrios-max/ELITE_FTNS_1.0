# Changelog - Elite Fitness v2.0.10

Este changelog detalla el registro de mejoras, corrección de bugs y optimizaciones en el backend y frontend implementados para la versión 2.0.10 de la plataforma, que es el **primer commit después de la migración**.

---

## 🚀 Nuevas Funcionalidades (Features)

*   **Persistencia de Estado al Recargar (F5)**:
    *   **Entrenador**: Se almacena en `localStorage` la vista global activa (`showGlobalView`), el cliente seleccionado (`activeUserId`) y la sub-pestaña activa del cliente (`switchTab`). Al refrescar la página, el entrenador continúa exactamente donde estaba sin perder el contexto.
    *   **Cliente**: Se almacena en `localStorage` la pestaña de navegación activa, manteniendo la vista (como "Progreso") tras recargar.
    *   **Login**: El `jwtToken` de sesión se guarda en `localStorage` al autenticarse con éxito, previniendo cierres de sesión accidentales al refrescar la pantalla.

*   **Zona Horaria Local de Colombia (`America/Bogota`)**:
    *   Se configuró el servidor FastAPI para utilizar de forma nativa la zona horaria colombiana (UTC-5) para los logs y los mensajes del chat.
    *   Se añadió la biblioteca `tzdata` a `requirements.txt` para garantizar la compatibilidad del motor de zonas horarias en sistemas Windows.

*   **Quitar/Corregir Agua en el Rastreador de Hidratación**:
    *   Se agregaron botones de decremento (`-250 ml` y `-500 ml`) en el panel de cliente.
    *   La lógica de negocio se actualizó para permitir correcciones y evitar que la hidratación baje a valores negativos (se bloquea en un límite inferior de `0 ml`).

*   **Burbuja de Chat Movible (Draggable Drawer)**:
    *   La cabecera del chat flotante del entrenador ahora tiene eventos de arrastre (`mousemove` y `touchmove`), lo que permite mover libremente la ventana de chat para evitar que se superponga con otros botones.

*   **Acceso Rápido al Chat en Móvil (FAB Rediseñado)**:
    *   Se rediseñó el botón flotante inferior derecho (`+`) en móviles. Ahora funciona como un lanzador de chat directo con el cliente seleccionado.
    *   Incluye un indicador dinámico en rojo que muestra la suma total de mensajes de chat no leídos de forma síncrona con el header.

*   **Filtrado por Fecha en Gráficas de Progreso**:
    *   Se incorporó un selector dropdown encima de los gráficos de peso y pasos diarios del cliente.
    *   El cliente puede filtrar su historial para visualizar datos de: *Últimos 7 días*, *Últimos 30 días*, *Últimos 3 meses* o *Todos los registros*.

---

## 🛠️ Correcciones de Errores (Bug Fixes)

*   **Visibilidad de Contraseñas al Crear/Resetear Clientes**:
    *   Se agregaron iconos de visibilidad (ojo) para alternar dinámicamente entre texto plano y puntos de seguridad en los campos de contraseña de creación de clientes y de restablecimiento.

*   **Corrección de Tipos en Configuración de Valoraciones/Nutrición**:
    *   Se corrigieron las sentencias SQLite `UPDATE` en `server.py` correspondientes a `handle_update_assessment_config` y `handle_update_nutrition_config`. Ahora guardan correctamente el campo `field_type`, permitiendo a los entrenadores cambiar y restringir tipos de datos (Número/Texto) para campos personalizados sin pérdida de restricciones.

*   **Diferenciación Visual en Secciones del Entrenador**:
    *   Se cambiaron las etiquetas de navegación del panel superior y del cliente para evitar ambigüedades:
        *   `Clientes` $\rightarrow$ `Mis Asesorados`
        *   `Valoraciones` $\rightarrow$ `Campos de Valoración`
        *   `Entrenamiento` $\rightarrow$ `Biblioteca de Rutinas`
        *   `Nutrición` $\rightarrow$ `Biblioteca de Alimentos`
        *   Pestaña local `Rutina` $\rightarrow$ `Rutina Asignada`
        *   Pestaña local `Nutrición Fit` $\rightarrow$ `Dieta Asignada`
