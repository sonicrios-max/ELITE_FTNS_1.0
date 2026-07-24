import os
import json
import sqlite3
import urllib.request
import urllib.parse
import zipfile
import shutil
import tempfile

# Configuration
PASSCODE = "dev123"
BASE_URL = "https://elite-fitness-coaching.onrender.com"
DOWNLOAD_URL = f"{BASE_URL}/api/admin/download_backup?passcode={PASSCODE}"
UPLOAD_URL = f"{BASE_URL}/api/admin/restore_backup?passcode={PASSCODE}"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_TEMPLATE_DB = os.path.join(BASE_DIR, "seed_data", "tenants", "trainer_admin") + ".db"
JSON_PATH = os.path.join(BASE_DIR, "database", "ejercicios_procesados.json")

# Base exercises to preserve references
BASE_EXERCISES = [
    (1, "Flexiones de Pecho (Push-Ups)", "Apoya las manos a la altura de los hombros, baja con el cuerpo alineado apretando el abdomen y empuja hacia arriba.", "Fullbody", "Pecho", "Tríceps, Hombros", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-pushups-in-a-park-23233-large.mp4", ""),
    (2, "Sentadillas Libres (Squats)", "Coloca los pies al ancho de los hombros, baja la cadera manteniendo la espalda recta e intentando romper el paralelo.", "Fullbody", "Cuádriceps", "Glúteos, Isquiotibiales", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-young-woman-doing-squats-in-front-of-a-mirror-42792-large.mp4", ""),
    (3, "Fondos en Paralelas (Dips)", "Sujétate de las barras paralelas, baja de forma controlada flexionando los codos hasta 90 grados y vuelve a subir.", "Fullbody", "Tríceps", "Pecho, Hombros", "Barras paralelas", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-tricep-dips-on-gym-bars-33423-large.mp4", ""),
    (4, "Dominadas Pronas (Pull-Ups)", "Cuélgate de la barra fija con agarre prono (palmas al frente) y sube hasta que tu barbilla pase la barra.", "Fullbody", "Dorsales", "Bíceps, Trapecios", "Barra fija", "https://assets.mixkit.co/videos/preview/mixkit-athletic-man-doing-pull-ups-at-the-gym-40292-large.mp4", ""),
    (5, "Plancha Abdominal Isometrica (Plank)", "Apoya los antebrazos y puntas de pie, mantén la cadera neutra alineando hombros, espalda y piernas sin arquear la zona lumbar.", "Fullbody", "Abdominales", "Zona Core", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-plank-exercise-on-mat-34241-large.mp4", ""),
    (6, "Elevación de Piernas Colgado (Leg Raises)", "Cuélgate de la barra y eleva las piernas rectas hasta formar un ángulo de 90 grados con el torso.", "Fullbody", "Abdominales", "Flexores de Cadera", "Barra fija", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-leg-raises-on-pull-up-bar-40293-large.mp4", ""),
    (7, "Peso Muerto (Deadlift)", "Levantamiento básico con barra manteniendo la espalda neutra y activando cadena posterior.", "Fullbody", "Isquiotibiales", "Glúteos, Espalda Baja", "Barra", "", ""),
    (8, "Press de Hombros (Shoulder Press)", "Empuje vertical de hombros por encima de la cabeza.", "Fullbody", "Hombros", "Tríceps", "Mancuernas", "", ""),
    (9, "Curl de Bíceps (Biceps Curl)", "Flexión de codos para aislar el bíceps.", "Fullbody", "Bíceps", "Antebrazos", "Mancuernas", "", "")
]

def normalize_muscle(m):
    if not m:
        return "General"
    m = m.strip()
    m_lower = m.lower()
    if "bicep" in m_lower or "bceps" in m_lower or "b\u00edceps" in m_lower:
        return "Bíceps"
    if "tricep" in m_lower or "trceps" in m_lower or "tr\u00edceps" in m_lower:
        return "Tríceps"
    if "glute" in m_lower or "glteos" in m_lower or "gl\u00fateos" in m_lower:
        return "Glúteos"
    if "quadricep" in m_lower or "cudriceps" in m_lower or "cu\u00e1driceps" in m_lower or "cuadriceps" in m_lower:
        return "Cuádriceps"
    if "isquio" in m_lower or "femorales" in m_lower or "hamstring" in m_lower:
        return "Isquiotibiales"
    if "gemelo" in m_lower or "pantorrilla" in m_lower or "calves" in m_lower:
        return "Gemelos"
    if "antebrazo" in m_lower or "forearm" in m_lower:
        return "Antebrazos"
    if "pecho" in m_lower or "chest" in m_lower or "pectoral" in m_lower:
        return "Pecho"
    if "abdomen" in m_lower or "abdominal" in m_lower:
        return "Abdominales"
    if "dorsal" in m_lower or "lat" in m_lower:
        return "Dorsales"
    if "trapecio" in m_lower or "trap" in m_lower:
        return "Trapecios"
    if "espalda baja" in m_lower or "lower back" in m_lower:
        return "Espalda Baja"
    if "espalda media" in m_lower or "middle back" in m_lower:
        return "Espalda Media"
    if "espalda alta" in m_lower or "upper back" in m_lower:
        return "Espalda Alta"
    if "core" in m_lower:
        return "Zona Core"
    if "oblicuo" in m_lower or "oblique" in m_lower:
        return "Oblicuos"
    if "cuello" in m_lower or "neck" in m_lower:
        return "Cuello"
    if "hombro" in m_lower or "shoulder" in m_lower:
        return "Hombros"
    if "adductor" in m_lower or "aductor" in m_lower:
        return "Aductores"
    if "abductor" in m_lower or "abductor" in m_lower:
        return "Abductores"
    return m

def normalize_muscles_string(m_str):
    if not m_str:
        return ""
    parts = [normalize_muscle(x) for x in m_str.split(",") if x.strip()]
    return ", ".join(parts)

def encode_multipart_formdata(fields, files):
    boundary = b'----WebKitFormBoundary7MA4YWxkTrZu0gW'
    CRLF = b'\r\n'
    L = []
    for key, value in fields.items():
        L.append(b'--' + boundary)
        L.append(f'Content-Disposition: form-data; name="{key}"'.encode('utf-8'))
        L.append(b'')
        L.append(value.encode('utf-8'))
    for key, filename, value in files:
        L.append(b'--' + boundary)
        L.append(f'Content-Disposition: form-data; name="{key}"; filename="{filename}"'.encode('utf-8'))
        L.append(b'Content-Type: application/zip')
        L.append(b'')
        L.append(value)
    L.append(b'--' + boundary + b'--')
    L.append(b'')
    body = CRLF.join(L)
    content_type = b'multipart/form-data; boundary=' + boundary
    return content_type, body

def main():
    print("=== PROCESO DE INTEGRACIÓN Y MEZCLA DE BASE DE DATOS (RENDER) ===")
    
    # 1. Verificar base de datos plantilla local y archivo JSON
    if not os.path.exists(LOCAL_TEMPLATE_DB):
        print(f"Error: La base de datos plantilla local no existe en: {LOCAL_TEMPLATE_DB}")
        return
    if not os.path.exists(JSON_PATH):
        print(f"Error: El archivo de ejercicios JSON no existe en: {JSON_PATH}")
        return
        
    print(f"Leyendo catálogo de alimentos desde plantilla local: {LOCAL_TEMPLATE_DB}")
    conn_template = sqlite3.connect(LOCAL_TEMPLATE_DB)
    cursor_template = conn_template.cursor()
    try:
        cursor_template.execute("SELECT name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g, custom_data FROM food_library")
        usda_foods = cursor_template.fetchall()
        print(f"Catálogo de alimentos cargado: {len(usda_foods)} ítems.")
    except Exception as e:
        print(f"Error al leer catálogo de alimentos local: {e}")
        conn_template.close()
        return
    conn_template.close()

    print(f"Cargando biblioteca de ejercicios desde {JSON_PATH}...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        exercises_data = json.load(f)
    print(f"Catálogo de ejercicios cargado: {len(exercises_data)} items.")

    # 2. Descargar respaldo de producción desde Render
    print(f"\nDescargando respaldo actual de producción desde Render...")
    print(f"URL: {DOWNLOAD_URL}")
    
    req = urllib.request.Request(
        DOWNLOAD_URL,
        headers={"User-Agent": "Mozilla/5.0"}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            zip_content = response.read()
            print(f"Descarga finalizada. Tamaño recibido: {len(zip_content)} bytes.")
    except Exception as e:
        print(f"Error al descargar respaldo de Render: {e}")
        return

    # Crear directorios temporales de trabajo
    temp_dir = tempfile.mkdtemp()
    prod_zip_path = os.path.join(temp_dir, "prod_backup.zip")
    extract_dir = os.path.join(temp_dir, "extracted")
    os.makedirs(extract_dir, exist_ok=True)
    
    try:
        # Guardar archivo descargado
        with open(prod_zip_path, "wb") as f:
            f.write(zip_content)
            
        # Extraer archivos
        print(f"Extraiendo archivos de base de datos en directorio temporal...")
        with zipfile.ZipFile(prod_zip_path, "r") as zip_ref:
            zip_ref.extractall(extract_dir)
            
        print("Archivos extraídos exitosamente:")
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                print(f"  - {os.path.relpath(os.path.join(root, file), extract_dir)}")

        # 3. Mezclar alimentos y sembrar ejercicios en cada base de datos
        tenants_dir = os.path.join(extract_dir, "tenants")
        if not os.path.exists(tenants_dir):
            print("\nError: No se encontró la carpeta 'tenants' en el respaldo descargado.")
            return

        db_files = [f for f in os.listdir(tenants_dir) if f.endswith(".db")]
        if not db_files:
            print("\nError: No se encontraron archivos de base de datos de inquilinos en el respaldo.")
            return

        print(f"\nIniciando mezcla y siembra en {len(db_files)} bases de datos de producción:")
        for db_file in db_files:
            db_path = os.path.join(tenants_dir, db_file)
            print(f"  -> Procesando {db_file}...")
            
            conn_prod = sqlite3.connect(db_path)
            cursor_prod = conn_prod.cursor()
            
            try:
                # 3a. Mezclar Alimentos
                cursor_prod.execute("""
                    CREATE TABLE IF NOT EXISTS food_library (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        name_en TEXT,
                        category TEXT,
                        weight_g REAL NOT NULL DEFAULT 100,
                        calories_kcal INTEGER NOT NULL DEFAULT 0,
                        protein_g REAL NOT NULL DEFAULT 0,
                        carbs_g REAL NOT NULL DEFAULT 0,
                        fat_g REAL NOT NULL DEFAULT 0,
                        custom_data TEXT
                    )
                """)
                conn_prod.commit()
                
                cursor_prod.execute("PRAGMA table_info(food_library)")
                columns = [row[1] for row in cursor_prod.fetchall()]
                if "name_en" not in columns:
                    cursor_prod.execute("ALTER TABLE food_library ADD COLUMN name_en TEXT")
                if "category" not in columns:
                    cursor_prod.execute("ALTER TABLE food_library ADD COLUMN category TEXT")
                conn_prod.commit()

                cursor_prod.executemany("""
                    INSERT OR IGNORE INTO food_library (name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g, custom_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, usda_foods)
                conn_prod.commit()
                
                # 3b. Sembrar Ejercicios (Con codificación limpia y normalización)
                cursor_prod.execute("""
                    CREATE TABLE IF NOT EXISTS exercises (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        description TEXT,
                        routine_class TEXT DEFAULT 'Fullbody',
                        primary_muscle TEXT NOT NULL,
                        secondary_muscles TEXT,
                        equipment TEXT,
                        video_url TEXT,
                        image_url TEXT
                    )
                """)
                
                cursor_prod.execute("DELETE FROM exercises")
                cursor_prod.execute("DELETE FROM sqlite_sequence WHERE name='exercises'")
                conn_prod.commit()
                
                # Insertar base
                for ex in BASE_EXERCISES:
                    cursor_prod.execute("""
                        INSERT INTO exercises (id, name, description, routine_class, primary_muscle, secondary_muscles, equipment, video_url, image_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, ex)
                
                # Insertar del JSON
                next_id = 10
                insert_ex_data = []
                for item in exercises_data:
                    name = item.get("nombre_es", "").strip()
                    desc = f"Nombre en inglés: {item.get('nombre_en')}. Nivel: {item.get('nivel_dificultad', 'Intermedio')}."
                    routine_class = "Fullbody"
                    primary = normalize_muscle(item.get("musculo_principal"))
                    secondaries = normalize_muscles_string(item.get("musculos_secundarios"))
                    equipment = item.get("equipo", "Peso corporal")
                    
                    insert_ex_data.append((
                        next_id,
                        name,
                        desc,
                        routine_class,
                        primary,
                        secondaries,
                        equipment,
                        "",
                        ""
                    ))
                    next_id += 1
                    
                cursor_prod.executemany("""
                    INSERT INTO exercises (id, name, description, routine_class, primary_muscle, secondary_muscles, equipment, video_url, image_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, insert_ex_data)
                conn_prod.commit()
                
                # Reportar estado
                cursor_prod.execute("SELECT COUNT(*) FROM food_library")
                total_foods = cursor_prod.fetchone()[0]
                cursor_prod.execute("SELECT COUNT(*) FROM exercises")
                total_exs = cursor_prod.fetchone()[0]
                print(f"     Listo. {db_file} -> Alimentos: {total_foods}, Ejercicios: {total_exs}")
                
            except Exception as e:
                print(f"     [!] Error mezclando datos en {db_file}: {e}")
                conn_prod.rollback()
            finally:
                conn_prod.close()

        # 4. Comprimir las bases de datos mezcladas en un nuevo archivo ZIP
        merged_zip_path = os.path.join(temp_dir, "merged_backup.zip")
        print(f"\nEmpaquetando bases de datos mezcladas en nuevo ZIP...")
        
        with zipfile.ZipFile(merged_zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # master.db
            master_path = os.path.join(extract_dir, "master.db")
            if os.path.exists(master_path):
                zip_file.write(master_path, "master.db")
            # tenants/
            for db_file in db_files:
                db_path = os.path.join(tenants_dir, db_file)
                zip_file.write(db_path, os.path.join("tenants", db_file))

        print("Empaquetado completado de forma correcta.")

        # 5. Subir el ZIP mezclado de regreso a Render
        print(f"\nSubiendo respaldo mezclado de regreso a Render...")
        print(f"URL: {UPLOAD_URL}")
        
        with open(merged_zip_path, "rb") as zip_f:
            merged_zip_bytes = zip_f.read()
            
        content_type, body = encode_multipart_formdata({}, [("file", "elite_fitness_backup.zip", merged_zip_bytes)])
        
        req_upload = urllib.request.Request(
            UPLOAD_URL,
            data=body,
            headers={
                "Content-Type": content_type,
                "User-Agent": "Mozilla/5.0"
            },
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req_upload) as response_upload:
                upload_res_data = response_upload.read().decode('utf-8')
                upload_res = json.loads(upload_res_data)
                
                if upload_res.get("success"):
                    print("\n[SUCCESS] ¡Respaldo mezclado restaurado exitosamente en el servidor de Render!")
                    print(f"Mensaje del servidor: {upload_res.get('message', 'Sin mensaje')}")
                else:
                    print(f"\nError reportado por el servidor al restaurar: {upload_res.get('error')}")
        except Exception as e:
            print(f"\nError en la comunicación HTTP al subir el respaldo: {e}")
            
    finally:
        # Limpiar directorio temporal
        print("\nLimpiando archivos temporales locales...")
        shutil.rmtree(temp_dir, ignore_errors=True)
        print("Proceso finalizado.")

if __name__ == "__main__":
    main()
