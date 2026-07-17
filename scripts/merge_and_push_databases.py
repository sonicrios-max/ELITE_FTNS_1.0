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
LOCAL_TEMPLATE_DB = os.path.join(BASE_DIR, "seed_data", "tenants", "trainer_admin.db")

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
    
    # 1. Verificar base de datos plantilla local
    if not os.path.exists(LOCAL_TEMPLATE_DB):
        print(f"Error: La base de datos plantilla local no existe en: {LOCAL_TEMPLATE_DB}")
        return
        
    print(f"Leyendo catálogo de alimentos desde plantilla local: {LOCAL_TEMPLATE_DB}")
    conn_template = sqlite3.connect(LOCAL_TEMPLATE_DB)
    cursor_template = conn_template.cursor()
    try:
        cursor_template.execute("SELECT name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g, custom_data FROM food_library")
        usda_foods = cursor_template.fetchall()
        print(f"Catálogo local cargado correctamente: {len(usda_foods)} alimentos encontrados.")
    except Exception as e:
        print(f"Error al leer catálogo local: {e}")
        conn_template.close()
        return
    conn_template.close()

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

        # 3. Mezclar alimentos en las bases de datos de producción extraídas
        tenants_dir = os.path.join(extract_dir, "tenants")
        if not os.path.exists(tenants_dir):
            print("\nError: No se encontró la carpeta 'tenants' en el respaldo descargado.")
            return

        db_files = [f for f in os.listdir(tenants_dir) if f.endswith(".db")]
        if not db_files:
            print("\nError: No se encontraron archivos de base de datos de inquilinos en el respaldo.")
            return

        print(f"\nIniciando mezcla de alimentos en {len(db_files)} bases de datos de producción:")
        for db_file in db_files:
            db_path = os.path.join(tenants_dir, db_file)
            print(f"  -> Procesando {db_file}...")
            
            conn_prod = sqlite3.connect(db_path)
            cursor_prod = conn_prod.cursor()
            
            try:
                # Verificar/Crear tabla y columnas
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
                
                # Migración de columnas por si acaso
                cursor_prod.execute("PRAGMA table_info(food_library)")
                columns = [row[1] for row in cursor_prod.fetchall()]
                if "name_en" not in columns:
                    cursor_prod.execute("ALTER TABLE food_library ADD COLUMN name_en TEXT")
                    conn_prod.commit()
                if "category" not in columns:
                    cursor_prod.execute("ALTER TABLE food_library ADD COLUMN category TEXT")
                    conn_prod.commit()

                # Insertar o ignorar alimentos de la plantilla
                cursor_prod.executemany("""
                    INSERT OR IGNORE INTO food_library (name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g, custom_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, usda_foods)
                conn_prod.commit()
                
                # Comprobar número total de alimentos resultantes
                cursor_prod.execute("SELECT COUNT(*) FROM food_library")
                total_foods = cursor_prod.fetchone()[0]
                print(f"     Listo. Alimentos totales en base de datos: {total_foods}")
                
            except Exception as e:
                print(f"     [!] Error mezclando datos en {db_file}: {e}")
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
