# Guía Tutorial: Plataforma de Asesoramiento Fitness Personalizado

Este archivo explica el funcionamiento de cada componente del sistema y los pasos detallados para configurar, sembrar datos, ejecutar y probar la aplicación web localmente.

---

## 1. Estructura del Proyecto

El proyecto está organizado de la siguiente manera:
- `database/`: Directorio que contiene el almacenamiento de datos.
  - [schema.sql](file:///c:/Users/sonic/OneDrive/Escritorio/PR/database/schema.sql): Declaraciones DDL de creación de tablas.
  - `fitness.db`: Archivo de base de datos SQLite persistente (autogenerado).
- `web/`: Archivos del frontend.
  - `shared/`: Archivos CSS compartidos.
    - [style.css](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/shared/style.css): Hoja de estilos con diseño *dark glassmorphism*.
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
   *Esto leerá el archivo `database/schema.sql` y creará las tablas necesarias en `database/fitness.db`.*

2. **Cargar los Datos Históricos del Excel de Brayan**:
   ```bash
   python scripts/parse_and_seed.py
   ```
   *Este script lee el archivo `Brayan Guerrero (1).xlsx`, calcula las métricas antropométricas iniciales e inserta a Brayan Guerrero como el Cliente ID 1.*

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

## 5. Cómo Navegar e Interactuar con la Plataforma

Abre tu navegador de internet favorito e introduce las siguientes URLs:

### A. Portal del Entrenador: [http://localhost:8080/trainer/](http://localhost:8080/trainer/)
- **Visualización**: Verás una barra lateral con los clientes (Brayan, Maria y Carlos). Al hacer clic en uno, se cargará su perfil.
- **Gráficas**: En la pestaña "Trazabilidad Diaria", interactúa con los gráficos que cruzan la actividad de pasos, el peso diario, y la relación sueño vs. apego a la dieta.
- **Modelo 3D Interactivo**: En el panel inferior verás el maniquí virtual 3D que gira continuamente. Al cambiar la evaluación en la lista desplegable de fechas, el modelo cambiará su grosor corporal (cintura, pecho, etc.) de forma proporcional a los datos antropométricos registrados.
- **Registrar Nuevas Evaluaciones**: Haz clic en el botón "Nueva Evaluación" en la pestaña "Ficha Antropométrica" para añadir un registro de pliegues (adipometría) y circunferencias. Verás cómo se actualizan instantáneamente los KPIs de FFMI y Porcentaje de Grasa Faulkner.

### B. Portal del Cliente (Brayan): [http://localhost:8080/client/?userId=1](http://localhost:8080/client/?userId=1)
- **Registro de Hoy**: En la barra izquierda, rellena tu peso, pasos dados y calidad de sueño. Al hacer clic en "Guardar Registro Diario", se añadirá a la base de datos y actualizará los gráficos.
- **Botón de Hidratación**: Haz clic en los botones de vaso o botella de agua. Verás cómo incrementa tu hidratación en la base de datos en tiempo real.
- **Rutina**: En "Mi Rutina Activa", marca los ejercicios completados en el gimnasio y haz clic en "Ver Técnica" para ver el video instructivo propio.

---

## 6. Pruebas de Funcionamiento Automatizadas

Para validar que el backend procesa correctamente las operaciones aritméticas y que los endpoints REST de lectura/escritura responden a la perfección, ejecuta la suite de prueba:
```bash
python scripts/test_server.py
```
*Este comando levantará temporalmente el servidor, registrará un nuevo cliente de prueba (Carlos Gomez), le insertará una valoración antropométrica, validará que el porcentaje de grasa por Faulkner coincida matemáticamente con las fórmulas teóricas, insertará un log diario y apagará el servidor de forma segura.*
