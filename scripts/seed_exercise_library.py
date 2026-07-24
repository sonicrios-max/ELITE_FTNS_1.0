import os
import json
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

def seed_db(db_path, exercises_data):
    print(f"Procesando base de datos: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Crear tabla si no existe
        cursor.execute("""
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
        
        # 2. Limpiar todos los ejercicios existentes para asegurar codificación correcta y evitar duplicados
        cursor.execute("DELETE FROM exercises")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='exercises'")
        conn.commit()
        
        # 3. Insertar ejercicios base (IDs 1 al 9)
        for ex in BASE_EXERCISES:
            cursor.execute("""
                INSERT INTO exercises (id, name, description, routine_class, primary_muscle, secondary_muscles, equipment, video_url, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, ex)
            
        # 4. Insertar los 2918 ejercicios del JSON a partir del ID 10
        next_id = 10
        insert_data = []
        for item in exercises_data:
            name = item.get("nombre_es", "").strip()
            desc = f"Nombre en inglés: {item.get('nombre_en')}. Nivel: {item.get('nivel_dificultad', 'Intermedio')}."
            routine_class = "Fullbody"
            primary = normalize_muscle(item.get("musculo_principal"))
            secondaries = normalize_muscles_string(item.get("musculos_secundarios"))
            equipment = item.get("equipo", "Peso corporal")
            
            insert_data.append((
                next_id,
                name,
                desc,
                routine_class,
                primary,
                secondaries,
                equipment,
                "",  # video_url
                ""   # image_url
            ))
            next_id += 1
            
        cursor.executemany("""
            INSERT INTO exercises (id, name, description, routine_class, primary_muscle, secondary_muscles, equipment, video_url, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, insert_data)
        
        conn.commit()
        cursor.execute("SELECT COUNT(*) FROM exercises")
        total = cursor.fetchone()[0]
        print(f"  -> Sembrados correctamente: {total} ejercicios.")
        
    except Exception as e:
        print(f"  -> [ERROR]: {e}")
        conn.rollback()
    finally:
        conn.close()

def main():
    if not os.path.exists(JSON_PATH):
        print(f"Error: No se encontró el archivo JSON en {JSON_PATH}")
        return
        
    print(f"Cargando biblioteca de ejercicios desde {JSON_PATH}...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        exercises_data = json.load(f)
        
    print(f"Archivo cargado. Total de ejercicios a sembrar: {len(exercises_data)} (+9 base).")
    
    # Encontrar todas las bases de datos
    db_paths = []
    
    # 1. Directorio local
    local_dir = os.path.join(BASE_DIR, "database", "tenants")
    if os.path.exists(local_dir):
        for f in os.listdir(local_dir):
            if f.endswith(".db"):
                db_paths.append(os.path.join(local_dir, f))
                
    # 2. Directorio plantilla
    seed_dir = os.path.join(BASE_DIR, "seed_data", "tenants")
    if os.path.exists(seed_dir):
        for f in os.listdir(seed_dir):
            if f.endswith(".db"):
                db_paths.append(os.path.join(seed_dir, f))
                
    # Procesar
    for path in db_paths:
        seed_db(path, exercises_data)
        
    print("\nProceso de siembra finalizado con éxito.")

if __name__ == "__main__":
    main()
