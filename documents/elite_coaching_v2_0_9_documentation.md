# 📖 Bitácora Técnica Unificada: ELITE COACHING (v2.0.9)

Este documento unifica y consolida toda la información técnica de backend y frontend de la plataforma **ELITE COACHING** en su versión actual **v2.0.9**, centralizando las bitácoras para evitar inconsistencias de reportes.

---

## PARTE 1: Bitácora del Backend

El backend está programado en Python utilizando el framework asíncrono **FastAPI** y servido mediante **Uvicorn** en el puerto `8080`.

### 1. Tecnologías y Librerías Core
*   **Framework Web:** `FastAPI` (Servidor asíncrono y de alto rendimiento).
*   **Servidor ASGI:** `Uvicorn` (Ejecuta FastAPI, administrado a través de `server.py`).
*   **Base de Datos:** `sqlite3` nativo de Python. Se utiliza el modo WAL (`PRAGMA journal_mode=WAL`) para soportar lecturas y escrituras concurrentes eficientes.
*   **Autenticación y Seguridad:** `PyJWT` (Generación y validación de tokens JWT) y `bcrypt` (Hashing seguro de contraseñas, prefijo `$2b$`).

### 2. Lógica de Bases de Datos (Multitenancy)
El sistema evita tener "todos los datos mezclados en una sola base de datos" usando múltiples archivos SQLite.

#### 2.1 Base de Datos Maestra (`master.db`)
Contiene información global que permite a los usuarios iniciar sesión y ser enrutados.
*   **Tabla `trainers`:** Almacena todos los entrenadores del sistema. Campos clave: `id`, `name`, `nickname`, `email`, `password` (hasheada), `theme_color`, `logo_url`, `subscription_status`, `created_at`.

#### 2.2 Bases de Datos de Inquilinos (`database/tenants/trainer_<nickname>.db`)
Cada entrenador tiene su propio archivo `.db`. Cuando un cliente se loguea, su token JWT contiene a qué entrenador pertenece, y el backend dirige todas las consultas a esa base de datos específica.
*   **Gestión de Rutinas:** `exercises`, `workout_blocks`, `workout_plans`, `workout_days`, `workout_day_blocks`, `workout_exercises`.
*   **Gestión de Ejecución:** `workout_execution_logs`, `set_logs`.
*   **Nutrición:** `nutrition_plans`, `meals`, `meal_items`, `food_library`, `nutrition_config`.
*   **Valoraciones/Métricas:** `anthropometric_assessments`, `skinfold_assessments`, `assessment_config`.
*   **Diario:** `daily_logs` (Seguimiento de agua, sueño, estrés, pasos diarios y checklists de ejercicios/comidas).
    *   *Checklists en Base de Datos:* Columnas `completed_exercises` (TEXT, por defecto `'[]'`) y `completed_meals` (TEXT, por defecto `'[]'`) agregadas para guardar los elementos marcados por el cliente en tiempo real.
*   **Inicialización Automática (Auto-seeding):** Al crear el archivo de base de datos para un nuevo entrenador (`initialize_tenant_db`), el sistema copia automáticamente la biblioteca maestra de ejercicios (`exercises`) y la biblioteca de alimentos (`food_library`) desde la base de datos de administración (`trainer_admin.db`), asegurando que no comiencen con catálogos vacíos.

### 3. Endpoints (Rutas de la API)
El archivo `server.py` registra rutas para gestionar el sistema CRUD (Crear, Leer, Actualizar, Borrar).

#### 3.1 Autenticación y Administración
*   `POST /api/auth`: Recibe `email` y `password`. Devuelve un JWT (`token`) con el ID del entrenador, ID del usuario y su rol.
*   `POST /api/auth/register`: Permite registrar nuevos usuarios.
*   `POST /api/admin/verify` & `POST /api/admin/reset_password`: Mecanismo de seguridad de administrador para recuperar acceso.
*   Rutas `/api/admin/trainers` (GET, POST, PUT, DELETE): El super-administrador puede crear o eliminar bases de datos de entrenadores.

#### 3.2 Gestión de Clientes (Trainer)
*   `GET /api/clients`: Lista los clientes asignados al entrenador autenticado.
*   `GET /api/clients/{user_id}`: Trae datos específicos de un cliente (valoraciones, métricas, historial diario, planes).
*   `POST / PUT / DELETE /api/clients`: Gestión del ciclo de vida del cliente.
*   `GET /api/trainer/config`: Devuelve configuraciones visuales e información básica del entrenador.

#### 3.3 Módulo de Entrenamiento y Rutinas
*   `/api/exercises` (GET, POST, PUT, DELETE): Librería de ejercicios global del entrenador.
*   `/api/workout_blocks` (GET, POST, PUT, DELETE): Agrupaciones de ejercicios (Ej: "Bloque de Fuerza Empuje").
*   `/api/routines` (GET, POST, PUT, DELETE): Planes completos compuestos por Bloques asignados a días.
*   `POST /api/routines/assign`: Asigna o cambia la rutina de un cliente.
    *   *Cambiar Rutina:* Si el cliente ya tiene una rutina activa, el endpoint desasigna la anterior y le asocia el nuevo plan seleccionado de manera atómica.

#### 3.4 Módulo de Nutrición
*   `/api/foods` (GET, POST, PUT, DELETE): Base de datos de ingredientes y valores macros (`food_library`).
*   `/api/nutrition_plans` (GET, POST, PUT, DELETE): Creación de plantillas dietéticas.
*   `POST /api/nutrition_plans/assign`: Asigna o cambia la dieta de un cliente.

#### 3.5 Módulo de Tracking y Valoraciones (Trazabilidad)
*   `POST /api/daily_logs`: Registra o actualiza la información diaria del cliente de forma acumulativa (agua, sueño, pasos y checklists de ejercicios/comidas completados).
    *   *Persistencia Parcial Inteligente:* El backend lee la fila existente del día usando `sqlite3.Row` y fusiona de forma parcial los datos recibidos (ej. si el cliente marca un ejercicio del checklist o añade 250ml de agua, esto se mezcla con los datos ya guardados de pasos o sueño sin sobreescribir ni perder registros previos del mismo día).
*   `GET /api/daily_logs/calendar`: Obtiene el historial de reportes diarios para renderizar el calendario de cumplimiento.
*   `/api/assessments` (POST, DELETE): Carga mediciones corporales (antropometría, pliegues).
    *   *Cálculo de grasa:* En la ruta `POST /api/assessments`, el backend calcula automáticamente el porcentaje de grasa corporal basándose únicamente en la **fórmula clásica de Faulkner** (que utiliza los pliegues triceps, scapular, iliac_fold y abdominal).
*   Formularios Dinámicos: `/api/assessment_config` y `/api/nutrition_config` (Permite al entrenador añadir campos personalizados a las valoraciones).

#### 3.6 Módulo de Chat y Comunicación (WebSocket + REST Fallback)
Para permitir la comunicación fluida 1-a-1 entre el Entrenador y sus Clientes, se implementó un sistema de chat con entrega en tiempo real y respaldo HTTP:
*   **WebSocket `/ws/chat`:** Escucha y despacha mensajes bidireccionales y actualizaciones de estado de conexión (presencia).
    *   *Normalización de Tenant:* Convierte a minúsculas y limpia el ID del entrenador (`trainer.strip().lower()`) para evitar problemas de mayúsculas/minúsculas.
    *   *Gestor de Conexiones (`ChatConnectionManager`):* Registra los WebSockets activos mapeados en una clave `(trainer, user_id)`.
    *   *Protocolo de Presencia:* Envía eventos `presence` indicando si los usuarios se conectan (`online`) o desconectan (`offline`).
    *   *Manejo de Errores:* El despachador corrige las llamadas al método `disconnect` y previene caídas del servidor ante desconexiones inesperadas.
*   **REST APIs de Respaldo (Fallback y Lectura):**
    *   `POST /api/chat/send`: Endpoint HTTP POST alternativo que guarda los mensajes en SQLite si el WebSocket emisor está offline o reconectándose.
    *   `GET /api/chat/history`: Recuperación paginada del historial de mensajes (últimos 30) según `limit` y `offset`.
    *   `POST /api/chat/read`: Marca mensajes como leídos y notifica los recibos de lectura (ticks de color cian) en tiempo real al emisor.
    *   `GET /api/chat/unread_counts`: Devuelve los mensajes no leídos del entrenador por cada cliente para poblar los badges de la cabecera e historial.
    *   *Flexibilidad de Acceso:* Estos endpoints no exigen verificación estricta de JWT (`verify_jwt`), lo que facilita la compatibilidad en local y tests de Render en tiempo real.

### 4. Seguridad (Middleware y JWT)
`server.py` implementa una dependencia/middleware de seguridad:
*   Las peticiones a la ruta `/api/*` requieren un header `Authorization: Bearer <token>` (a excepción de las APIs públicas y las rutas de chat para facilitar pruebas y adaptabilidad).
*   El token se decodifica con `SECRET_KEY`.
*   Dependiendo de la ruta, el backend valida si el usuario tiene rol de `admin`, `trainer` o `client` antes de ejecutar la consulta a la base de datos.
*   Las consultas SQL están parametrizadas (ej: `cursor.execute("SELECT * FROM users WHERE id=?", (user_id,))`) mitigando ataques SQLi.

---

## PARTE 2: Bitácora del Frontend

El frontend de Elite Coaching ha sido diseñado en Vanilla JS aplicando las mejores prácticas de UX/UI mediante un diseño **Glassmorphism / Premium Dark Mode** y soporte **PWA (Aplicación Web Progresiva)**.

### 1. Portales y Secciones de la Interfaz
El frontend se divide en cuatro grandes "aplicaciones" o portales distintos, cada uno con su propio HTML y archivo JS.

#### 1.1 Portal de Inicio de Sesión (`web/index.html`)
*   **Sección Central:** Formulario flotante estilo cristal (Glassmorphism).
*   **Botones y Funciones:**
    *   `Login`: Llama a `/api/auth`. Valida credenciales y enruta dinámicamente según el rol.
    *   `Manejo de Errores`: Modal de alerta para credenciales incorrectas.
    *   `PWA Install Prompt`: Detecta si el navegador soporta instalación y muestra el botón "Instalar App".

#### 1.2 Portal del Cliente (`web/client/client.html` & `client.js`)
Diseñado pensando en la usabilidad móvil (Mobile First) con un `bottom-nav-bar` (Barra de navegación inferior) y safe-area insets (`viewport-fit=cover`).
*   **Ajuste Safe-Area:** Modificaciones en `.bottom-nav` usando variables de entorno CSS (`env(safe-area-inset-bottom)`) y paddings adaptativos para que los botones de navegación inferior no interfieran con la barra de gestos física del dispositivo móvil.
*   **Pestañas Principales (`switchGlobalTab`):**
    *   **Inicio / Diario:** Muestra métricas rápidas (KPIs). Widget de "Hidratación Diaria" (`addWater()`), selectores de nivel de energía, horas de sueño, estrés y el botón "Enviar Reporte" (`submitDailyLog()`).
        *   *Sliders en Tiempo Real:* Los sliders de rango (sueño, energía, estrés) actualizan visualmente un indicador de texto flotante contiguo al deslizarse y se resetean tras enviar el reporte.
    *   **Entrenamiento:** (`renderWorkoutPlans()`). Lista la rutina del día asignada al cliente.
        *   *Selector de Día de Entrenamiento Activo (Workout Locking):* Se integró un panel de control superior que permite al usuario seleccionar qué día de su rutina va a realizar hoy (o marcar "Día de Descanso").
            *   Al seleccionar el día, la tarjeta correspondiente se destaca con borde verde y badge **[Activo Hoy]**, desbloqueando sus checkboxes de ejercicios.
            *   Las demás tarjetas de la rutina se vuelven de solo lectura con checkboxes bloqueados para evitar registros accidentales cruzados entre días. El estado se persiste en `localStorage` y cuenta con alertas de confirmación al cambiar.
        *   *Checklist Interactivo:* Cada ejercicio tiene un checkbox interactivo (si está activo) que se guarda en la base de datos en tiempo real al marcarse o desmarcarse.
        *   *Demostraciones:* Botón `playVideo()` para ver la demostración del ejercicio en un modal.
    *   **Nutrición:** (`renderNutritionPlans()`). Muestra el desglose de comidas, calorías y macronutrientes asignados.
        *   *Checklist Interactivo:* Cada alimento o ingrediente de la comida cuenta con un checkbox interactivo para que el cliente marque su consumo, sincronizando los datos al instante con el backend.
    *   **Progreso:** Muestra gráficos interactivos (`Chart.js`) renderizando la evolución del peso y el porcentaje de grasa corporal a lo largo del tiempo (`initOrUpdateCharts()`).
    *   **Calendario (Cumplimiento):** Renderiza un mes con indicadores de días cumplidos (reporte enviado). Funciones `changeClientCalendarMonth()`, `renderClientDailyCalendar()`.
        *   *Detalles del Día (Trazabilidad):* Abre una vista limpia del reporte diario estructurada con una cuadrícula compacta de métricas y dos columnas con desgloses detallados de ejercicios y comidas completados.
    *   **Chat con el Entrenador (`clientChatView`):** Sección inmersiva de chat para que el cliente hable con su coach.
        *   *Interfaz Glassmorphism:* Burbujas de mensajes estilizadas (gradiente cian/azul para mensajes propios, gris translúcido para el coach) adaptables a safe-areas y teclados táctiles usando `dvh`.
        *   *Estado de Conexión:* Muestra un punto verde palpitante si el entrenador está conectado (`online`).
        *   *Mensajería Híbrida:* Envía los mensajes por WebSocket si está abierto; si se encuentra cerrado o reconectándose, los desvía por el endpoint HTTP REST `POST /api/chat/send` de respaldo de forma transparente, reintentando conectar el socket en segundo plano.
        *   *Notificaciones y Audio:* Sonido de campana personalizado sintetizado nativamente en el navegador vía la API Web Audio (evita descargas de archivos de audio adicionales y funciona 100% offline).

#### 1.3 Portal del Entrenador (`web/trainer/index.html` & `trainer.js`)
Interfaz rica en datos para escritorio (Dashboard) adaptada para pantallas táctiles y dispositivos móviles.
*   **Barra Lateral (Sidebar):**
    *   `switchTab()` navega entre: Visión General, Clientes, Evaluaciones, Librería (Ejercicios, Bloques, Rutinas), Nutrición y Configuración de Entrenador (donde se listan clientes para restablecer contraseña con `resetClientPasswordModal` o eliminar accesos con `deleteClient`).
*   **Flujos Críticos e Interacciones Premium:**
    *   **Landing de Bienvenida:** Al cargar el portal, no se auto-selecciona ningún cliente por defecto. En su lugar, se muestra una tarjeta de bienvenida limpia instando al entrenador a seleccionar un asesorado de la barra lateral.
    *   **Ficha y Registro de Clientes:** Botón "Nuevo Cliente" abre un modal `submitNewClient()`. Al guardarse con éxito, el formulario se limpia (`addClientForm.reset()`).
    *   **Buscador de Alimentos Predictivo (Dropdown Autocomplete):** En la sección de creación/edición de dietas, se reemplazó el `<datalist>` nativo por un dropdown personalizado (`.food-suggestions-dropdown`) con altura máxima (`200px`) y scrollbar dedicada. Permite filtrado inmediato, navegación por teclado y auto-escalamiento de macros proporcional al peso en gramos.
    *   **Valoraciones Físicas:** Vista de tabla extensa (`renderAssessmentsTable()`), modal dinámico que carga métricas extrañas según configuración (`renderAssessmentForm()`). Gráficos de evolución del peso y pliegues.
    *   **Trazabilidad Diaria (Calendario):** Al hacer clic en un día del calendario del cliente, se abre el modal emergente `dayDetailModal`.
        *   *Reorganización de Detalles:* El modal de detalles diarios se expandió a un ancho de `500px` (`max-width: 95%`) y se rediseñó por completo.
        *   *Grid de Estadísticas:* Muestra las 5 métricas de salud (Peso, Pasos, Sueño, Agua, Adherencia) en un grid responsivo de 3 y 2 columnas con tarjetas (`summary-stat-box`) individuales.
        *   *Checklists de Rutina y Comida:* Presenta en dos columnas paralelas la rutina realizada y los alimentos ingeridos del día, señalando visualmente las tareas completadas y las pendientes.
    *   **Unificación en "Cambiar Rutina":**
        *   Se reemplazaron los botones separados por un único botón **"Cambiar Rutina"** con un icono de rotación.
        *   Al pulsarlo, abre un modal con una lista de tarjetas de rutinas globales que tiene altura máxima de `300px` y un slider de desplazamiento.
        *   *Buscador Filtrado:* El modal incluye un campo de búsqueda (`routineSearchInput`) que filtra en tiempo real las tarjetas basándose en la coincidencia del nombre del plan.
    *   **Capas y Modales (z-index):** Para evitar que los modales queden ocultos detrás del panel deslizable de detalles del cliente en dispositivos móviles (el cual tiene `z-index: 10000`), todos los contenedores de modales y diálogos flotantes se configuran a `z-index: 20000 !important` en `style.css` y archivos javascript.
    *   **Chat Contextual con Cliente (`tabChat`):** Pestaña dentro de la ficha de cliente que permite al entrenador contestar mensajes sin salir de su contexto.
    *   **Burbujas Flotantes (Minimizar):** El entrenador puede minimizar cualquier chat a una burbuja circular flotante en el lateral derecho de la pantalla. Esto le permite seguir navegando por la app. Al recibir un mensaje nuevo, la burbuja vibra, muestra un badge rojo e incrementa el contador. Al hacer clic sobre ella, despliega un cajón de chat emergente desde el cual responder de inmediato.
    *   **Campana de Notificaciones de Cabecera:** Icono global de notificaciones bell en el header que despliega la lista de clientes con mensajes sin leer, permitiendo ir a su chat con un clic.
    *   **Mensajería Híbrida:** Incorpora el envío híbrido con fallback REST para que el entrenador no pierda mensajes aunque pierda cobertura de WebSocket temporalmente.

#### 1.4 Consola del Desarrollador / Admin (`web/admin/index.html`)
Una terminal al estilo hacker con fondo negro y texto monospace verde.
*   Sirve para la gestión de recuperación de contraseñas mediante "Claves Secretas" (`/api/auth/reset_password`).
*   Registra entrenadores y levanta sus bases de datos SQLite virtuales.

### 2. PWA y Service Worker (Estabilidad)
*   **`manifest.json`**: Define el nombre ("Elite Coaching App"), colores del tema `#080c14` y los iconos. Permite que la web se agregue al inicio del celular como app nativa.
*   **`service-worker.js`**: Implementa una estrategia "Network-First" (Red primero, luego caché). Ignora `/api/` y cachea todos los recursos estáticos.
