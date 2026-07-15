# language: es

Característica: Autenticación de Usuarios y Multitenancy (Multitenencia)
  Como usuario de la plataforma Elite Coaching (Entrenador, Cliente o Super-Administrador)
  Quiero iniciar sesión de forma segura y ser redirigido a mi base de datos/interfaz correspondiente
  Para poder gestionar mi información o la de mis clientes sin cruzamiento de datos.

  Antecedentes:
    Dado que el sistema tiene una base de datos maestra "master.db"
    Y existen las bases de datos de inquilinos en "database/tenants/trainer_<nickname>.db"

  Escenario: Inicio de sesión exitoso de un Entrenador
    Cuando envío una solicitud POST a "/api/auth" con el email "carlos.gomez@example.com" y la contraseña "123456"
    Entonces el servidor responde con un código de estado 200
    Y la respuesta contiene un token JWT válido
    Y el token JWT contiene el rol "trainer" y el ID del entrenador
    Y las siguientes peticiones del entrenador se dirigen a la base de datos "trainer_carlos.gomez.db"

  Escenario: Inicio de sesión fallido por contraseña incorrecta
    Cuando envío una solicitud POST a "/api/auth" con el email "carlos.gomez@example.com" y la contraseña "incorrecta"
    Entonces el servidor responde con un código de estado 401 y un mensaje de error "Credenciales inválidas"
    Y en el frontend se muestra un modal de alerta premium con el mensaje de error

  Escenario: Registro de un nuevo entrenador por el Administrador
    Dado que estoy autenticado como Super-Administrador
    Cuando envío una solicitud POST a "/api/admin/trainers" con los datos:
      | name         | Carlos Gomez             |
      | nickname     | carlos.gomez             |
      | email        | carlos.gomez@example.com |
      | theme_color  | #080c14                  |
    Entonces el servidor crea el registro en la base de datos maestra
    Y se inicializa automáticamente la base de datos de inquilino "trainer_carlos.gomez.db"
    Y se copian automáticamente el catálogo de ejercicios y la biblioteca de alimentos desde "trainer_admin.db"

  Escenario: Restablecimiento de contraseña de un entrenador
    Dado que el Administrador accede a la consola de administración
    Cuando envía una solicitud POST a "/api/admin/reset_password" con la clave secreta del administrador y el email del entrenador "carlos.gomez@example.com"
    Entonces la contraseña del entrenador se restablece a la contraseña por defecto
    Y el entrenador puede iniciar sesión con la nueva contraseña

# =============================================================================

Característica: Gestión de Clientes por parte del Entrenador
  Como Entrenador autenticado en la plataforma
  Quiero registrar, listar, editar y eliminar clientes
  Para mantener al día mi lista de asesorados y sus accesos.

  Antecedentes:
    Dado que he iniciado sesión como el entrenador "carlos.gomez"
    Y estoy en el Portal del Entrenador en "http://localhost:8080/trainer/"

  Escenario: Visualización inicial del dashboard del Entrenador
    Al cargar el portal del entrenador
    Entonces no se autoselecciona ningún cliente por defecto
    Y se muestra una tarjeta de bienvenida limpia indicando que seleccione un cliente de la barra lateral

  Escenario: Registro exitoso de un nuevo cliente
    Cuando abro el modal de "Nuevo Cliente"
    Y completo el formulario con los siguientes datos:
      | Nombre           | Carlos                      |
      | Apellido         | Gomez                       |
      | Email            | carlos.gomez@example.com    |
      | Teléfono         | 3205554433                  |
      | Fecha Nacimiento | 1994-08-20                  |
      | Estatura (cm)    | 180.0                       |
      | Grupo Sanguíneo  | O-                          |
      | Horario          | Lunes a Viernes (Noche)     |
      | Alergias         | Gluten                      |
      | Medicamentos     | Ninguno                     |
    Y presiono el botón "Guardar"
    Entonces el backend procesa la solicitud mediante "POST /api/clients"
    Y el cliente se crea exitosamente en la base de datos del entrenador
    Y el formulario del modal se limpia automáticamente usando reset()

  Escenario: Eliminación de un cliente existente
    Dado que selecciono al cliente "carlos.gomez" de la barra lateral
    Cuando hago clic en "Eliminar Acceso" en la pestaña de configuración
    Y confirmo la acción en el diálogo de seguridad
    Entonces se envía una solicitud DELETE a "/api/clients"
    Y el cliente se elimina de la base de datos del entrenador
    Y la interfaz actualiza la barra lateral removiendo al cliente

# =============================================================================

Característica: Módulo de Entrenamiento, Asignación de Rutinas y Workout Locking
  Como Entrenador y Cliente
  Queremos gestionar y ejecutar rutinas de entrenamiento de forma precisa
  Para registrar el progreso diario sin solapamiento de días.

  Antecedentes:
    Dado que el entrenador "carlos.gomez" tiene configurada una rutina "Fuerza Empuje/Tirón"

  Escenario: Cambio atómico de rutina de un cliente por el entrenador
    Dado que el cliente "brayan.guerrero" tiene asignada la rutina "Hipertrofia Pierna"
    Cuando el entrenador hace clic en "Cambiar Rutina"
    Y busca la rutina "Fuerza Empuje/Tirón" en el buscador interactivo "routineSearchInput"
    Y selecciona la tarjeta de la rutina y presiona "Guardar Cambios"
    Entonces el backend realiza una transacción atómica mediante "POST /api/routines/assign"
    Y se desasigna la rutina anterior del cliente
    Y se asocia la nueva rutina "Fuerza Empuje/Tirón" de forma exitosa

  Escenario: Selección y bloqueo del día de entrenamiento activo (Workout Locking)
    Dado que el cliente "brayan.guerrero" inicia sesión en su portal "http://localhost:8080/client/?userId=1"
    Y navega a la pestaña "Entrenamiento"
    Cuando selecciona el día "Lunes: Empuje" en el panel de control superior
    Entonces la tarjeta "Lunes: Empuje" se destaca visualmente con borde verde y el badge "[Activo Hoy]"
    Y los checkboxes de los ejercicios del día "Lunes: Empuje" se desbloquean
    Y las tarjetas de los demás días de la rutina se vuelven de solo lectura con checkboxes bloqueados
    Y esta selección de día activo se guarda de forma persistente en el localStorage del navegador

  Escenario: Registro en tiempo real de ejercicio completado
    Dado que el cliente tiene desbloqueada la tarjeta "Lunes: Empuje"
    Cuando marca el checkbox de completado para el ejercicio "Press Banca - 4x8"
    Entonces el cliente envía una actualización en tiempo real al backend
    Y el backend registra el ejercicio en la columna "completed_exercises" en la tabla "daily_logs"
    Y se mantiene el estado del checkbox si el cliente refresca la página

  Escenario: Reinicio automático del día activo de entrenamiento al cambiar de día (transición de fecha)
    Dado que el cliente "brayan.guerrero" seleccionó el día "Lunes: Empuje" el día lunes
    Y completó todos los checkboxes de los ejercicios del día lunes
    Y el servidor registró exitosamente los ejercicios completados en el log de ese día
    Cuando el sistema detecta que la fecha actual ha cambiado al martes (siguiente día)
    Entonces el estado del día lunes se mantiene guardado de forma persistente e inalterable en el log del día anterior
    Y el sistema reinicia de forma automática el día de entrenamiento activo para el día martes
    Y selecciona automáticamente "Día de Descanso" como valor predeterminado para el nuevo día
    Y mantiene bloqueados todos los checkboxes de entrenamiento de la rutina
    Y el cliente no requiere marcar manualmente el martes como día de descanso
    Y la rutina se mantendrá en reposo hasta que el cliente seleccione explícitamente el día a trabajar el martes

# =============================================================================

Característica: Módulo de Nutrición y Buscador Predictivo de Alimentos
  Como Entrenador y Cliente
  Queremos planificar y registrar comidas usando herramientas inteligentes
  Para asegurar el cumplimiento de los macronutrientes del día.

  Escenario: Búsqueda predictiva, títulos visibles y bloqueo de campos autocalculados al crear una dieta
    Dado que el entrenador está editando la sección de dietas de un cliente
    Entonces la interfaz muestra los títulos de columna "Alimento", "Peso (g)", "Calorías (kcal)", "Proteínas (g)", "Carbohidratos (g)" y "Grasas (g)" de forma visible sobre las cajas de entrada
    Cuando el entrenador escribe "Pollo" en la caja de texto "Alimento"
    Entonces se despliega el menú personalizado ".food-suggestions-dropdown" con scrollbar propia
    Y el entrenador navega por las sugerencias usando las teclas de flechas arriba/abajo
    Y presiona Enter para seleccionar "Pechuga de Pollo"
    Entonces los campos de "Calorías (kcal)", "Proteínas (g)", "Carbohidratos (g)" y "Grasas (g)" se bloquean automáticamente como de solo lectura
    Cuando el entrenador cambia la cantidad de gramos de 100g a 200g en el campo de "Peso (g)"
    Entonces los valores de calorías y macronutrientes se auto-escalan proporcionalmente en tiempo real en la pantalla
    Y el entrenador no tiene la posibilidad de editar manualmente los valores auto-calculados de calorías o macronutrientes

  Escenario: Registro e ingesta de comidas por el cliente
    Dado que el cliente inicia sesión en su portal y navega a la pestaña "Nutrición"
    Y ve el desglose de su "Desayuno: Huevos con tostadas"
    Cuando marca el checkbox del ingrediente "2 Rebanadas de Pan Integral"
    Entonces la interfaz sincroniza el estado instantáneamente con el backend
    Y el ingrediente se agrega a la columna "completed_meals" de la base de datos de inquilino para la fecha actual

# =============================================================================

Característica: Valoraciones Físicas y Cálculos Automáticos de KPIs
  Como Entrenador
  Quiero registrar mediciones corporales y ver las métricas calculadas automáticamente
  Para analizar el progreso del cliente con exactitud científica.

  Escenario: Registro de nueva evaluación y cálculo de grasa corporal con fórmula de Faulkner
    Dado que el entrenador selecciona al cliente "carlos.gomez"
    Y navega a la sección "Ficha Antropométrica"
    Cuando hace clic en "Nueva Evaluación"
    Y registra los siguientes pliegues y medidas:
      | peso_kg    | 80.0  |
      | estatura   | 180.0 |
      | triceps    | 12.0  |
      | escapular  | 14.0  |
      | iliac      | 15.0  |
      | abdominal  | 18.0  |
    Y guarda la evaluación
    Entonces el backend recibe los datos mediante "POST /api/assessments"
    Y calcula el Porcentaje de Grasa Corporal usando la fórmula clásica de Faulkner: (12.0 + 14.0 + 15.0 + 18.0) * 0.153 + 5.783
    Y calcula el Índice de Masa Corporal (IMC): 80.0 / (1.80)^2
    Y guarda ambos valores calculados en la base de datos
    Y los KPIs del dashboard (Grado de grasa y FFMI) se actualizan inmediatamente

# =============================================================================

Característica: Registro Diario de Hábitos y Persistencia Parcial Inteligente
  Como Cliente
  Quiero reportar mis hábitos diarios (agua, sueño, pasos y checklists)
  Para mantener mi historial de adherencia actualizado sin perder información previa.

  Escenario: Actualización incremental de hábitos con persistencia parcial inteligente
    Dado que el cliente ya reportó "6000 pasos" y "7 horas de sueño" para la fecha actual
    Cuando el cliente añade "250ml de agua" mediante el widget de hidratación
    Y hace clic en "Enviar Reporte" en su portal diario
    Entonces el backend ejecuta la ruta "POST /api/daily_logs"
    Y lee los datos previos del día utilizando sqlite3.Row
    Y fusiona de manera parcial el nuevo registro de agua con los pasos y sueño ya guardados
    Entonces no se sobreescriben ni se pierden los datos anteriores de pasos o sueño para ese día

  Escenario: Interacción de sliders en tiempo real
    Dado que el cliente está en la pestaña "Inicio/Diario"
    Cuando desliza el rango de "Horas de Sueño" de 6 a 8
    Entonces se actualiza inmediatamente un indicador de texto contiguo mostrando "8 horas"
    Y tras presionar "Enviar Reporte" exitosamente, el indicador y el slider se restablecen a sus valores iniciales

# =============================================================================

Característica: Calendarios de Cumplimiento y Visualización de Detalles Diarios
  Como Entrenador y Cliente
  Queremos visualizar el historial de adherencia mensual en un calendario
  Para auditar los días cumplidos y analizar las estadísticas específicas.

  Escenario: Visualización detallada de un día en el Portal del Entrenador
    Dado que el entrenador visualiza el calendario mensual del cliente
    Cuando hace clic sobre un día que tiene reportes registrados
    Entonces se abre el modal emergente premium "dayDetailModal" con un ancho de 500px (max-width: 95%) y z-index de 20000
    Y el modal despliega las 5 métricas de salud (Peso, Pasos, Sueño, Agua, Adherencia) organizadas en una cuadrícula responsiva de tarjetas independientes
    Y presenta en dos columnas paralelas:
      | Columna Izquierda | Rutina realizada con ejercicios completados/pendientes |
      | Columna Derecha   | Comidas del día indicando alimentos consumidos/pendientes |

# =============================================================================

Característica: Chat Híbrido, Presencia en Tiempo Real y Notificaciones
  Como Entrenador y Cliente
  Queremos chatear en tiempo real y tener un canal de comunicación estable
  Para asegurar que los mensajes lleguen incluso bajo inestabilidad de red.

  Escenario: Envío de mensaje en tiempo real por WebSocket
    Dado que el entrenador y el cliente tienen la conexión WebSocket activa
    Cuando el cliente escribe "Hola Coach" y presiona enviar
    Entonces el mensaje se transmite por el WebSocket "/ws/chat"
    Y el entrenador recibe el mensaje al instante en su pestaña de chat contextual
    Y se reproduce una notificación sonora (campana) sintetizada nativamente en su navegador mediante la API Web Audio

  Escenario: Envío híbrido de mensaje con Fallback HTTP REST ante desconexión
    Dado que el WebSocket del cliente se encuentra cerrado o reconectándose en segundo plano
    Cuando el cliente envía un mensaje "Actualización de mi peso"
    Entonces la interfaz detecta la desconexión
    Y desvía de forma transparente el mensaje a través del endpoint HTTP de respaldo "POST /api/chat/send"
    Y el mensaje se guarda exitosamente en la base de datos SQLite
    Y el WebSocket intenta reconectarse automáticamente en segundo plano

  Escenario: Marcado de lectura y confirmación visual (Doble Tick Cian)
    Dado que el cliente tiene un mensaje no leído del entrenador
    Cuando el cliente abre la sección de chat
    Entonces se realiza una llamada HTTP POST a "/api/chat/read"
    Y se marca el mensaje como leído en la base de datos
    Y el entrenador recibe una notificación de lectura en tiempo real
    Y el estado del mensaje cambia a doble tick color cian en la pantalla del entrenador

  Escenario: Minimizado de chat a burbuja flotante y alertas en el Portal del Entrenador
    Dado que el entrenador tiene abierto el chat con un cliente
    Cuando hace clic en el botón de minimizar
    Entonces la ventana de chat se reduce a una burbuja flotante en el lateral derecho de la pantalla
    Y el entrenador continúa navegando en la pestaña "Ficha Antropométrica"
    Cuando el cliente envía un mensaje nuevo
    Entonces la burbuja flotante vibra, muestra un badge rojo e incrementa el contador de mensajes no leídos
    Y la campana global del header muestra la alerta de nuevo mensaje
    Cuando el entrenador hace clic sobre la burbuja flotante
    Entonces se despliega de inmediato el cajón de chat emergente para responder

# =============================================================================

Característica: Instalación PWA y Service Worker Offline
  Como Cliente
  Quiero que la plataforma funcione como una aplicación nativa en mi celular
  Para acceder rápidamente y poder usarla sin conexión a internet estable.

  Escenario: Indicación de instalación PWA en el Portal de Login
    Dado que el navegador del usuario soporta PWA
    Cuando el usuario ingresa a la página de login "http://localhost:8080/"
    Entonces el navegador detecta el archivo "manifest.json"
    Y la interfaz muestra el botón "Instalar App"
    Cuando el usuario hace clic en "Instalar App"
    Entonces se despliega el diálogo nativo del sistema para agregar Elite Coaching a la pantalla de inicio

  Escenario: Cacheo de recursos estáticos mediante Service Worker
    Dado que el Service Worker se ha registrado exitosamente en el navegador
    Cuando el usuario navega a través de las páginas y archivos estáticos (.html, .js, .css, imágenes)
    Entonces el Service Worker intercepta las peticiones y las almacena en la caché local usando la estrategia Network-First
    Y si el usuario se queda sin conexión a internet, puede seguir visualizando la interfaz y los datos cacheados
    Y las peticiones dirigidas a la API "/api/" no se almacenan en caché para garantizar datos frescos del backend

# =============================================================================

Característica: Biblioteca de Recetas y Agrupación Visual de Ingredientes
  Como Entrenador y Cliente
  Queremos crear recetas reutilizables y verlas agrupadas de manera premium en los planes de nutrición
  Para optimizar el tiempo de diseño y mejorar la lectura de la dieta.

  Escenario: Crear una receta en la biblioteca
    Dado que el entrenador se encuentra en la pestaña "Nutrición"
    Y hace clic en "Nueva Receta"
    Cuando introduce el nombre "Panqueques de Proteína"
    Y añade los ingredientes "Avena" (50g) y "Huevo" (100g)
    Y guarda la receta
    Entonces el backend registra la receta a través de "POST /api/recipes"
    Y la biblioteca de recetas se actualiza mostrando la nueva receta y sus macronutrientes totales

  Escenario: Agregar una receta y escalar sus porciones en un plan de nutrición
    Dado que el entrenador abre el creador de planes de alimentación
    Y hace clic en "+ Receta" en la sección de "Desayuno"
    Cuando selecciona "Panqueques de Proteína" con un multiplicador de "2.0"
    Entonces todos los ingredientes de la receta se cargan de manera agrupada bajo un contenedor visual ".recipe-group-container"
    Y los gramos de cada ingrediente se multiplican automáticamente por 2.0 (ej. Avena 100g)
    Y se recalcula y muestra la suma total de macronutrientes acumulados en el plan de alimentación en tiempo real

  Escenario: Visualización y checklist agrupado de recetas para el cliente
    Dado que el entrenador asigna el plan de alimentación con la receta agrupada al cliente
    Cuando el cliente ingresa a su portal y navega a la sección de "Nutrición"
    Entonces visualiza los ingredientes agrupados bajo una tarjeta premium ".client-recipe-card"
    Y muestra el nombre de la receta y sus macronutrientes consolidados
    Cuando el cliente marca el checkbox principal de la receta
    Entonces todos los checkboxes internos de sus ingredientes se seleccionan de forma sincronizada
    Y se actualiza el diario del cliente guardando el estado en la base de datos

