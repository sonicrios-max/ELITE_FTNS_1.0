# Changelog - Elite Fitness v2.0.11

Este changelog detalla el registro de mejoras, corrección de bugs y optimizaciones en el backend y frontend implementados para la versión 2.0.11 de la plataforma.

---

## 🚀 Nuevas Funcionalidades (Features)

*   **KPI de Adherencia Objetivo (Frecuencia de Registro)**:
    *   **Backend (`server.py`)**: Se modificó la consulta para calcular el score de adherencia en base a la cantidad de días con registros diarios (`daily_logs`) completados en los últimos 30 días, normalizado en una escala de 0 a 10: `(log_count / 30.0) * 10.0`.
    *   **Panel del Entrenador (`trainer.js`)**: El badge en la barra lateral de asesorados ahora muestra la frecuencia real en el formato de días acumulados: `Alta Adherencia (27/30 d)`.

*   **Portal Maestro Simplificado e Informativo (`index.html`)**:
    *   Se rediseñó la página de inicio para separar el flujo de inicio de sesión de las tablas informativas de la comunidad.
    *   **Logins Directos**: Dos formularios directos e independientes uno al lado del otro (Acceso Entrenador y Acceso Cliente). El login de cliente no requiere selector de base de datos ya que el backend realiza un escaneo multitenant dinámico de forma transparente.
    *   **Tablas de Actividad Minimalistas**: Se muestran los entrenadores y los clientes (agrupados por su entrenador) mostrando **únicamente su nombre y su indicador de presencia activa en línea** (círculo verde WebSocket pulsante o círculo gris offline), eliminando información redundante o confidencial.

---

## 🛠️ Correcciones de Errores (Bug Fixes)

*   **Autodetector de Base de Datos para Clientes (Multitenant Auto-discovery)**:
    *   El endpoint `/api/auth` ahora escanea dinámicamente todas las bases de datos de entrenadores disponibles si no se provee la cabecera `X-Trainer-Id`. Esto permite iniciar sesión como cliente directamente sin necesidad de seleccionar un coach en un selector.

*   **Fallo de Ejecución en Portal Maestro (JS Crash Fix)**:
    *   Se corrigió una llave de cierre faltante en el script de `index.html` que bloqueaba la carga de la página (quedando colgado en "Cargando...").
