# 🚀 Guía de Migración del Proyecto: ELITE COACHING (v2.0.10)

Este documento centraliza toda la información técnica, arquitectónica y operativa del proyecto **ELITE COACHING** en su versión **v2.0.10**. Su objetivo es permitirte migrar todo tu entorno de desarrollo a un nuevo dispositivo de forma 100% transparente y sin fricciones, asegurando que tanto tú como tu instancia de **Antigravity** en el nuevo equipo retomen el trabajo sin inconsistencias.

---

## 📋 Ficha Técnica y Tecnologías Core
*   **Backend:** Python 3 + `FastAPI` (servidor asíncrono ASGI).
*   **Servidor de Desarrollo:** `Uvicorn` ejecutándose en el puerto `8080` (administrado por `server.py`).
*   **Base de Datos (Multitenancy SQLite):**
    *   `database/master.db`: Contiene los credenciales globales de los entrenadores para su redirección y login.
    *   `database/tenants/trainer_<nickname>.db`: Un archivo SQLite independiente por cada entrenador (inquilino) que aísla por completo la información de sus clientes, rutinas, dietas, valoraciones físicas y diarios de cumplimiento.
    *   `PRAGMA journal_mode=WAL;`: Activado para soportar lecturas y escrituras concurrentes de alta velocidad.
*   **Autenticación:** JWT (`PyJWT`) firmado digitalmente y contraseñas hasheadas en base de datos mediante `bcrypt` (prefijo `$2b$`).
*   **Frontend:** HTML5, CSS3 vanilla (con diseño **Glassmorphism / Premium Dark Mode** y soporte responsivo móvil/escritorio) y lógica puramente en Vanilla Javascript.
*   **Mensajería y Chat en Tiempo Real:** WebSocket (`/ws/chat`) híbrido con presencia interactiva y fallback automático a endpoints REST HTTP (`POST /api/chat/send`, `GET /api/chat/history`).

---

## 🌟 Resumen de Características de la Versión v2.0.10
Estas son las adiciones más recientes integradas en el proyecto y que están completamente operativas:
1.  **Edición de Logs Diarios desde Calendario del Coach:** El entrenador ahora puede modificar de forma directa los valores de agua, pasos, sueño, peso, porcentaje de grasa y checklists del día del cliente seleccionándolo desde el calendario de cumplimiento (trazabilidad).
2.  **Valoración Dinámica del Cliente:** Las valoraciones físicas en la ficha del cliente se renderizan y guardan dinámicamente con base en los campos configurados por el entrenador en la configuración personalizada (`assessment_config`), con acordeones de colapso en el frontend para optimizar el espacio.
3.  **Visualización Multicoach:** El portal principal permite consultar los datos de todos los clientes asignados bajo diferentes coaches y realizar el ruteo de inicio de sesión de forma dinámica.
4.  **Caché-Busting v2.0.10:** Actualización de todas las referencias de recursos estáticos en HTML a `?v=2.0.10` para forzar la recarga del navegador y evitar versiones cacheadas obsoletas.
5.  **Service Worker PWA:** Estrategia *Network-First* en `web/service-worker.js` con soporte offline y caché local para recursos críticos.

---

## 📂 Estructura de Directorios Clave
Asegúrate de que tras extraer el ZIP todos estos elementos existan en la raíz de tu workspace:
*   [server.py](file:///c:/Users/sonic/OneDrive/Escritorio/PR/server.py): Servidor principal FastAPI que define el middleware, autenticación, WebSockets y todos los endpoints de la API.
*   [database/](file:///c:/Users/sonic/OneDrive/Escritorio/PR/database/): Directorio de base de datos.
    *   `master.db` y `fitness.db`.
    *   `tenants/`: Bases de datos individuales por inquilino (`trainer_admin.db`, `trainer_coach_azul.db`, `trainer_coach_rojo.db`).
*   [web/](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/): Código del cliente.
    *   `index.html`: Portal maestro de login.
    *   `client/client.html` y `client.js`: Portal móvil-first para los clientes.
    *   `trainer/index.html` y `trainer.js`: Panel administrativo (dashboard) del entrenador.
    *   `admin/index.html`: Terminal para superadministradores.
    *   `shared/style.css`: Estilos globales unificados (Glassmorphism / Premium Dark Mode).
*   [documents/](file:///c:/Users/sonic/OneDrive/Escritorio/PR/documents/): Especificaciones de arquitectura (`.tex`), bitácoras de cambios y esta guía.
*   [scripts/](file:///c:/Users/sonic/OneDrive/Escritorio/PR/scripts/): Herramientas para formatear bases de datos, contraseñas y realizar pruebas de concurrencia (`seed_consistent_data.py`, `stress_test.py`, `init_db.py`).
*   [requirements.txt](file:///c:/Users/sonic/OneDrive/Escritorio/PR/requirements.txt): Lista de dependencias del entorno de Python.

---

## ⚡ Guía Paso a Paso para la Instalación en el Nuevo Dispositivo
1.  **Copiar y Descomprimir:** Descarga el archivo de migración `migration_v2.0.10.zip` en tu nuevo equipo y extráelo en tu carpeta de desarrollo favorita (por ejemplo, `C:\PR` o equivalente).
2.  **Configurar Git:** Abre una terminal en la carpeta y asocia tu cuenta de GitHub realizando:
    ```bash
    git init
    git remote add origin https://github.com/tu-usuario/tu-repositorio.git
    git fetch
    git checkout main
    ```
    *Nota: Tu árbol de código ya estará limpio y al día, listo para asociarse.*
3.  **Instalar Python y Dependencias:**
    Crea un entorno virtual e instala las librerías necesarias ejecutando:
    ```bash
    python -m venv venv
    .\venv\Scripts\activate
    pip install -r requirements.txt
    ```
4.  **Iniciar Servidor Local:**
    Ejecuta el servidor FastAPI con:
    ```bash
    python server.py
    ```
    El backend estará disponible en `http://localhost:8080` y servirá el frontend de forma automática.
5.  **Despliegue a Render:**
    El archivo [render.yaml](file:///c:/Users/sonic/OneDrive/Escritorio/PR/render.yaml) ya está configurado. Al subir tus cambios a GitHub (`git push`), Render iniciará el despliegue automático del servicio utilizando la especificación de WebSockets definida en `requirements.txt`.

---

## 🧠 Antigravity Context Boost
> [!TIP]
> **¿Cómo pasarle el contexto a Antigravity en tu nuevo dispositivo?**
> Abre una nueva conversación con Antigravity en el otro equipo y envíale exactamente el siguiente texto como primer mensaje. Esto le dará superpoderes de entendimiento inmediato sobre todo el proyecto:

```text
INSTRUCCIÓN DE CONTEXTO DE DESARROLLO (CARGA INICIAL)
Hola Antigravity. Estamos trabajando en el proyecto de Elite Coaching (v2.0.10). Para retomar el desarrollo con total fluidez, lee atentamente los siguientes puntos clave sobre nuestro sistema:

1. ARQUITECTURA GENERAL:
- Servidor: backend en Python con FastAPI (server.py), puerto 8080.
- Frontend: Vanilla JS, HTML y CSS (shared/style.css) con diseño Glassmorphism y PWA.
- Bases de Datos (Multi-tenancy): SQLite.
  * database/master.db administra el mapeo de logins globales de entrenadores.
  * database/tenants/trainer_<nickname>.db guarda los datos independientes de cada entrenador (ejercicios, comidas, valoraciones de clientes, historial de trazabilidad).
  * Modo WAL activo en SQLite para transacciones concurrentes.

2. COMPONENTES Y LÓGICAS IMPORTANTES:
- Trazabilidad y Diario: daily_logs guarda pasos, agua, sueño y dos listas en formato JSON (completed_exercises y completed_meals). Se realiza un merge inteligente al guardar.
- Modales en Móviles: Todos los contenedores de modales usan z-index: 20000 !important para quedar encima del panel deslizante de detalles del cliente (z-index 10000).
- Chat 1-a-1: Implementado en WebSocket (/ws/chat) con normalización de tenant. Si la conexión de socket falla, el cliente y el coach desvían el envío automáticamente al endpoint REST POST /api/chat/send e intentan reconectar el WebSocket de fondo de forma transparente.
- Notificaciones de Cabecera: El portal del entrenador contiene una campana de notificaciones interactiva que cuenta los mensajes no leídos y redirige al chat específico del cliente.

3. HISTORIAL DE CAMBIOS HASTA v2.0.10:
- Edición directa de logs diarios desde la vista de calendario en el panel del Coach.
- Formulario de Valoraciones Dinámicas que lee de la base de datos de configuraciones (assessment_config).
- Corrección de bugs de colisión de modales en móvil y duplicación de IDs en calendar-detail.
- Adición de Websockets al archivo de dependencias de Python y Render.yaml para compatibilidad online.

NUESTRO OBJETIVO HOY:
He migrado a este nuevo dispositivo. Mis archivos de base de datos sqlite locales en database/ están al día y listos. Por favor, confirma que comprendes esta estructura y dime qué archivos deseas inspeccionar para comenzar a trabajar.
```
