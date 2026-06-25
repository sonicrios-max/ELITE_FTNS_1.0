# Guía Tutorial: Plataforma de Asesoramiento Fitness Personalizado

Este archivo explica el funcionamiento de cada componente del sistema y los pasos detallados para configurar, sembrar datos, ejecutar y probar la aplicación web localmente.

---

## 1. Estructura del Proyecto

El proyecto está organizado de la siguiente manera:
- `database/`: Directorio que contiene el almacenamiento de datos.
  - [schema.sql](file:///c:/Users/sonic/OneDrive/Escritorio/PR/database/schema.sql): Declaraciones DDL de creación de tablas.
  - `master.db`: Base de datos maestra de inicio de sesión de entrenadores (autogenerada).
  - `tenants/`: Directorio con las bases de datos SQLite individuales de cada entrenador, ej. `trainer_admin.db`, `trainer_carlos.gomez.db`, etc. (autogenerados).
- `web/`: Archivos del frontend.
  - `shared/`: Archivos CSS compartidos.
    - [style.css](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/shared/style.css): Hoja de estilos con diseño *dark glassmorphism* y reglas fijas de z-index de modales.
  - `trainer/`: Portal de administración del Entrenador.
    - [index.html](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/trainer/index.html)
    - [trainer.js](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/trainer/trainer.js)
  - `client/`: Portal de bitácora diaria del Cliente.
    - [client.html](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/client/client.html)
    - [client.js](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/client/client.js)
- `android/`: Prototipo de aplicación móvil en Android Studio.
  - [MainActivity.kt](file:///c:/Users/sonic/OneDrive/Escritorio/PR/android/app/src/main/java/com/fitness/customcoaching/MainActivity.kt): Vistas en Jetpack Compose.
- `scripts/`: Scripts de utilidad y administración de datos.
  - [init_db.py](file:///c:/Users/sonic/OneDrive/Escritorio/PR/scripts/init_db.py): Inicializa las tablas SQLite.
  - [parse_and_seed.py](file:///c:/Users/sonic/OneDrive/Escritorio/PR/scripts/parse_and_seed.py): Extrae las valoraciones del Excel de Brayan Guerrero.
  - [seed_details.py](file:///c:/Users/sonic/OneDrive/Escritorio/PR/scripts/seed_details.py): Siembra el catálogo de ejercicios, rutinas, dietas y logs diarios.
  - [test_server.py](file:///c:/Users/sonic/OneDrive/Escritorio/PR/scripts/test_server.py): Suite de pruebas automatizadas de integración.
- [server.py](file:///c:/Users/sonic/OneDrive/Escritorio/PR/server.py): Servidor HTTP local y API REST de backend.

---

## 2. Requisitos Previos

Asegúrate de tener instalado en tu computadora:
1. **Python 3.10+**
2. La librería `openpyxl` (necesaria para leer datos del archivo Excel). Puedes instalarla abriendo una terminal y ejecutando:
   ```bash
   pip install openpyxl
   ```

---

## 3. Pasos para la Inicialización del Sistema

Si deseas reiniciar la base de datos o inicializarla desde cero, sigue estos comandos desde la carpeta raíz del proyecto (`c:\Users\sonic\OneDrive\Escritorio\PR`):

1. **Crear y Limpiar la Base de Datos**:
   ```bash
   python scripts/init_db.py
   ```
   *Esto leerá el archivo `database/schema.sql` y creará las tablas necesarias en `database/master.db` y carpetas de inquilinos.*

2. **Cargar los Datos Históricos del Excel de Brayan**:
   ```bash
   python scripts/parse_and_seed.py
   ```
   *Este script lee el archivo `Brayan Guerrero (1).xlsx`, calcula las métricas antropométricas iniciales e inserta a Brayan Guerrero como el Cliente ID 1 en la base de datos del administrador.*

3. **Cargar Programas de Entrenamiento, Nutrición y Logs Diarios**:
   ```bash
   python scripts/seed_details.py
   ```
   *Crea a Maria Perez como la Cliente ID 2, añade la biblioteca de ejercicios con videos, asigna rutinas (empuje/tracción), planes de comida y siembra 14 días de historial diario.*

---

## 4. Ejecución del Servidor Local

Una vez sembrados los datos, inicia la plataforma ejecutando el backend en la carpeta raíz:
```bash
python server.py
```
El servidor se iniciará en el puerto `8080`. Mantén esta consola abierta mientras utilices la plataforma.

---

## 5. Credenciales de Acceso

Los usuarios generados en la base de datos para pruebas son los siguientes (todos comparten la misma contraseña por defecto):
- **Brayan Guerrero**: Nickname `brayan.guerrero` / Contraseña `123456`
- **Maria Perez**: Nickname `maria.perez` / Contraseña `123456`
- **Carlos Gomez**: Nickname `carlos.gomez` / Contraseña `123456`

---

## 6. Cómo Navegar e Interactuar con la Plataforma

Abre tu navegador de internet favorito e introduce las siguientes URLs:

### A. Portal del Entrenador: [http://localhost:8080/trainer/](http://localhost:8080/trainer/)
- **Visualización**: Al entrar, verás una pantalla de bienvenida limpia. Selecciona un cliente de la barra lateral izquierda para cargar su ficha antropométrica, gráficos, rutinas y trazabilidad diaria.
- **Gráficas**: En la pestaña "Trazabilidad Diaria", interactúa con los gráficos de pasos, peso y sueño vs. apego a la dieta.
- **Detalle Diario del Calendario**: Haz clic sobre cualquier día registrado en el calendario mensual para abrir una ventana emergente premium. Esta ventana muestra el peso, actividad, hidratación, notas y los **checklists de ejercicios y comidas completados** por el cliente de manera limpia.
- **Cambiar Rutina**: En la pestaña de "Rutina", haz clic en **"Cambiar Rutina"** para abrir el buscador interactivo. Puedes buscar plantillas globales de entrenamiento escribiendo en el cuadro de búsqueda para filtrar la lista instantáneamente. Selecciona una tarjeta de rutina y presiona **"Guardar Cambios"**; el sistema reemplazará automáticamente la rutina activa del cliente por la seleccionada.
- **Modelo 3D Interactivo**: En el panel inferior de la ficha del cliente verás el maniquí virtual 3D que gira continuamente. Al cambiar la evaluación en la lista desplegable de fechas, el modelo cambiará su grosor corporal (cintura, pecho, etc.) proporcionalmente.
- **Registrar Nuevas Evaluaciones**: Haz clic en "Nueva Evaluación" en la pestaña "Ficha Antropométrica" para añadir registros físicos. Verás cómo se actualizan instantáneamente los KPIs de FFMI y Porcentaje de Grasa Faulkner.

### B. Portal del Cliente (Brayan): [http://localhost:8080/client/?userId=1](http://localhost:8080/client/?userId=1)
- **Registro de Hoy**: Rellena tu peso, pasos dados y sueño en la barra lateral. Los sliders de calidad de sueño y apego a la dieta se actualizan numéricamente en vivo al deslizarlos. Al hacer clic en "Guardar Registro Diario", se añadirá a la base de datos y actualizará los gráficos.
- **Botón de Hidratación**: Haz clic en los botones de vaso o botella de agua para incrementar tu hidratación en tiempo real.
- **Rutina y Alimentación con Checklists**: En "Mi Rutina Activa" y "Nutrición Fit", marca los ejercicios completados en el gimnasio y los alimentos consumidos a través de los checkboxes interactivos. El estado de cumplimiento se guarda y sincroniza síncronamente al backend al instante. Haz clic en "Ver Técnica" en cualquier ejercicio para ver su video instructivo.

---

## 7. Pruebas de Funcionamiento Automatizadas

Para validar que el backend procesa correctamente las operaciones aritméticas y que los endpoints REST de lectura/escritura responden a la perfección, ejecuta la suite de prueba:
```bash
python scripts/test_server.py
```
*Este comando levantará temporalmente el servidor, registrará un nuevo cliente de prueba (Carlos Gomez), le insertará una valoración antropométrica, validará que el porcentaje de grasa por Faulkner coincida matemáticamente con las fórmulas teóricas, insertará un log diario y apagará el servidor de forma segura.*

---

## 8. Cómo Probar la Aplicación en tu Teléfono Android

Existen dos opciones para probar la aplicación en tu celular:

### Opción A: Probar la versión PWA (Instalación instantánea sin código)
Esta es la opción recomendada para entrenadores y clientes debido a que no requiere configurar entornos de compilación y se instala directamente desde el navegador de tu celular en segundos.

1. **Asegura la Conexión de Red**:
   - Tu teléfono celular y tu computadora **deben estar conectados a la misma red Wi-Fi**.

2. **Inicia el Servidor en tu PC**:
   - Asegúrate de que el servidor está corriendo en tu computadora ejecutando:
     ```bash
     python server.py
     ```

3. **Obtén la IP Local de tu Computadora**:
   - Tu dirección IPv4 local actual es: **`192.168.1.23`**
   - *(En el futuro, si tu red cambia, puedes consultar esta IP ejecutando `ipconfig` en la terminal de Windows).*

4. **Accede desde el Celular**:
   - Abre **Google Chrome** en tu celular Android.
   - Navega a la dirección del Portal del Cliente (Brayan) o el Panel Maestro:
     - **Panel Maestro de Acceso**: `http://192.168.1.23:8080/`
     - **Acceso Directo Cliente (Brayan)**: `http://192.168.1.23:8080/client/?userId=1`

5. **Instala la PWA en tu Teléfono**:
   - Cuando cargue la página, presiona el botón de **los tres puntos verticales** arriba a la derecha de Google Chrome.
   - Selecciona la opción **"Instalar aplicación"** o **"Agregar a la pantalla de inicio"**.
   - ¡Listo! Ahora aparecerá el icono premium de **Elite Coaching** en la pantalla de inicio de tu celular, y al abrirlo se ejecutará a pantalla completa como una aplicación móvil real.

---

### Opción B: Probar el Prototipo Nativo (Android Studio / Jetpack Compose)
Si deseas ejecutar la app móvil nativa en Kotlin/Jetpack Compose, sigue estos pasos:

1. **Abre el Proyecto**:
   - Inicia **Android Studio** en tu PC.
   - Selecciona **Open** y abre la carpeta `android/` del proyecto.

2. **Conecta tu Dispositivo**:
   - **Teléfono Físico**: Activa las *Opciones de Desarrollador* en los ajustes de tu teléfono, activa *Depuración USB* y conéctalo por cable a tu PC.
   - **Emulador**: Si no tienes un teléfono físico a la mano, puedes crear un dispositivo virtual en Android Studio a través del *Device Manager*.

3. **Compilar y Correr**:
   - Haz clic en el botón verde **Run (Reproducir)** en la barra superior de Android Studio.
   - Selecciona tu dispositivo de la lista. La aplicación se compilará y se instalará automáticamente en tu celular.

