import json
import bcrypt
import jwt
import sqlite3
import os
import urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo
import shutil

COLOMBIA_TZ = ZoneInfo("America/Bogota")

def get_colombia_now():
    return datetime.now(COLOMBIA_TZ)


from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 8080))
SECRET_KEY = os.environ.get("JWT_SECRET", "super-secret-key-1234")

def verify_password(plain_password, hashed_password):
    if not hashed_password.startswith("$2b$"):
        return plain_password == hashed_password
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict):
    return jwt.encode(data, SECRET_KEY, algorithm="HS256")


# For production/PaaS hosting with persistent volumes (like Render or Railway),
# we can define a PERSISTENT_DIR env var pointing to the mounted disk directory.
PERSISTENT_DIR = os.environ.get("PERSISTENT_DIR", os.path.join(BASE_DIR, "database"))
os.makedirs(PERSISTENT_DIR, exist_ok=True)
MASTER_DB_PATH = os.path.join(PERSISTENT_DIR, "master.db")
TENANTS_DIR = os.path.join(PERSISTENT_DIR, "tenants")
os.makedirs(TENANTS_DIR, exist_ok=True)

# ----- AUTO-SEED LOGIC -----
import shutil
SEED_DIR = os.path.join(BASE_DIR, "seed_data")
SEEDED_FLAG = os.path.join(PERSISTENT_DIR, ".seeded")

if os.path.exists(SEED_DIR) and not os.path.exists(SEEDED_FLAG):
    print("Found seed_data. Forcing overwrite of PERSISTENT_DIR to import local data...")
    try:
        if os.path.exists(os.path.join(SEED_DIR, "master.db")):
            shutil.copy(os.path.join(SEED_DIR, "master.db"), MASTER_DB_PATH)
        if os.path.exists(os.path.join(SEED_DIR, "tenants")):
            # copytree with dirs_exist_ok=True will overwrite existing files
            shutil.copytree(os.path.join(SEED_DIR, "tenants"), TENANTS_DIR, dirs_exist_ok=True)
        
        # Create a flag file so it doesn't run again on next restart
        with open(SEEDED_FLAG, "w") as f:
            f.write("seeded")
            
        print("Database FORCE SEED completed successfully.")
    except Exception as e:
        print(f"Error seeding database: {e}")
# ---------------------------

def init_master_db():
    print(f"Initializing master database at: {MASTER_DB_PATH}")
    conn = sqlite3.connect(MASTER_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trainers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            nickname TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            theme_color TEXT DEFAULT '#f3ca4c',
            logo_url TEXT,
            subscription_status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # Seed default trainer
    cursor.execute("SELECT id FROM trainers WHERE nickname = 'admin'")
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO trainers (name, nickname, email, password, theme_color)
            VALUES ('Elite Coach Admin', 'admin', 'admin@elitecoach.local', '{get_password_hash("admin")}', '#f3ca4c')
        """)
        print("Master DB: Seeded default trainer 'admin' / 'admin'.")
    conn.commit()
    conn.close()

def initialize_tenant_db(trainer_nickname):
    tenant_db_path = os.path.join(TENANTS_DIR, f"trainer_{trainer_nickname}.db")
    schema_path = os.path.join(BASE_DIR, "database", "schema.sql")
    print(f"Initializing tenant database for '{trainer_nickname}' at: {tenant_db_path}")
    
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
        
    conn = sqlite3.connect(tenant_db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()
    try:
        cursor.executescript(schema_sql)
        conn.commit()
        
        # System User (ID 0) for templates
        cursor.execute("SELECT id FROM users WHERE id = 0")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO users (id, first_name, last_name, email, height_cm, nickname, password)
                VALUES (0, 'Sistema', 'Plantillas', 'sistema@elitecoach.local', 0, 'sistema', '{get_password_hash("123456")}')
            """)
            conn.commit()
            
        # Seed default exercises
        cursor.execute("SELECT id FROM exercises")
        if not cursor.fetchone():
            copied = False
            if trainer_nickname != 'admin':
                admin_db_path = os.path.join(TENANTS_DIR, "trainer_admin.db")
                if os.path.exists(admin_db_path):
                    try:
                        admin_conn = sqlite3.connect(admin_db_path)
                        admin_cursor = admin_conn.cursor()
                        admin_cursor.execute("SELECT name, description, routine_class, primary_muscle, secondary_muscles, equipment, video_url, image_url FROM exercises")
                        admin_exercises = admin_cursor.fetchall()
                        admin_conn.close()
                        
                        if admin_exercises:
                            cursor.executemany("""
                                INSERT INTO exercises (name, description, routine_class, primary_muscle, secondary_muscles, equipment, video_url, image_url)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """, admin_exercises)
                            conn.commit()
                            copied = True
                            print(f"Copied exercises from admin to tenant database '{trainer_nickname}'.")
                    except Exception as ex:
                        print(f"Error copying exercises from admin to tenant '{trainer_nickname}': {ex}")

            if not copied:
                cursor.execute("""
                    INSERT INTO exercises (id, name, description, routine_class, primary_muscle, equipment)
                    VALUES 
                    (1, 'Flexiones de Pecho (Pushups)', 'Ejercicio de empuje básico para pectoral y tríceps.', 'Fullbody', 'Pectoral', 'Ninguno'),
                    (2, 'Sentadillas Libres (Squats)', 'Ejercicio básico de empuje de pierna enfocado en cuádriceps.', 'Fullbody', 'Cuádriceps', 'Ninguno')
                """)
                conn.commit()

        # Copy foods from admin as well
        if trainer_nickname != 'admin':
            admin_db_path = os.path.join(TENANTS_DIR, "trainer_admin.db")
            if os.path.exists(admin_db_path):
                try:
                    admin_conn = sqlite3.connect(admin_db_path)
                    admin_cursor = admin_conn.cursor()
                    admin_cursor.execute("SELECT name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, custom_data FROM food_library")
                    admin_foods = admin_cursor.fetchall()
                    admin_conn.close()
                    
                    if admin_foods:
                        # Clear default foods to copy admin foods cleanly
                        cursor.execute("DELETE FROM food_library")
                        cursor.executemany("""
                            INSERT OR IGNORE INTO food_library (name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, custom_data)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, admin_foods)
                        conn.commit()
                        print(f"Copied food library from admin to tenant database '{trainer_nickname}'.")
                except Exception as ex:
                    print(f"Error copying foods from admin to tenant '{trainer_nickname}': {ex}")
            
        print(f"Tenant database '{trainer_nickname}' initialized successfully.")
    except Exception as e:
        print(f"Error initializing tenant database for '{trainer_nickname}': {e}")
    finally:
        conn.close()
        
    # Ensure it's migrated and seeded with configurations
    check_and_migrate_db(tenant_db_path)

def get_tenant_db_path(trainer_nickname):
    if not trainer_nickname:
        trainer_nickname = "admin"
        
    # Clean nickname
    clean_nick = "".join(c for c in trainer_nickname if c.isalnum() or c in ("_", "-")).lower()
    if not clean_nick:
        clean_nick = "admin"
        
    tenant_db_path = os.path.join(TENANTS_DIR, f"trainer_{clean_nick}.db")
    if not os.path.exists(tenant_db_path):
        initialize_tenant_db(clean_nick)
        
    return tenant_db_path

def check_and_migrate_db(db_path):
    print(f"Checking database migration at: {db_path}")
    if not os.path.exists(db_path):
        print("Database file does not exist yet.")
        return
        
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]
        
        migrated = False
        if "nickname" not in columns:
            print("Migration: Adding column 'nickname' to 'users' table...")
            cursor.execute("ALTER TABLE users ADD COLUMN nickname TEXT")
            migrated = True
        if "password" not in columns:
            print("Migration: Adding column 'password' to 'users' table...")
            cursor.execute("ALTER TABLE users ADD COLUMN password TEXT")
            migrated = True
            
        if migrated:
            conn.commit()
            print("Migration successful. Seeding default credentials...")
            
            cursor.execute("SELECT id, email, nickname FROM users")
            users = cursor.fetchall()
            for u_id, email, nick in users:
                new_nick = email.split('@')[0].lower()
                new_pass = get_password_hash("123456")
                
                cursor.execute("SELECT id FROM users WHERE nickname = ? AND id != ?", (new_nick, u_id))
                if cursor.fetchone():
                    new_nick = f"{new_nick}_{u_id}"
                
                cursor.execute("UPDATE users SET nickname = ?, password = ? WHERE id = ?", (new_nick, new_pass, u_id))
                print(f"  -> User ID {u_id} updated: nickname='{new_nick}', password='{new_pass}'")
            conn.commit()
            print("Default credentials seeded.")
            
        cursor.execute("SELECT id FROM users WHERE id = 0")
        if not cursor.fetchone():
            print("Migration: Creating System User (ID 0) for Global Templates...")
            cursor.execute("""
                INSERT INTO users (id, first_name, last_name, email, height_cm, nickname, password)
                VALUES (0, 'Sistema', 'Plantillas', 'sistema@elitecoach.local', 0, 'sistema', '{get_password_hash("123456")}')
            """)
            conn.commit()

        # Migration: Add custom_data to anthropometric_assessments
        cursor.execute("PRAGMA table_info(anthropometric_assessments)")
        anthro_columns = [row[1] for row in cursor.fetchall()]
        if "custom_data" not in anthro_columns:
            print("Migration: Adding column 'custom_data' to 'anthropometric_assessments' table...")
            cursor.execute("ALTER TABLE anthropometric_assessments ADD COLUMN custom_data TEXT")
            conn.commit()

        # Migration: Create assessment_config table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS assessment_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                field_name TEXT NOT NULL,
                field_type TEXT NOT NULL DEFAULT 'number',
                unit TEXT,
                is_default BOOLEAN DEFAULT 0,
                db_column TEXT,
                is_active BOOLEAN DEFAULT 1,
                order_index INTEGER DEFAULT 0
            )
        ''')
        conn.commit()

        # Seed default assessment configs if empty
        cursor.execute("SELECT id FROM assessment_config")
        if not cursor.fetchone():
            print("Migration: Seeding default assessment configurations...")
            defaults = [
                ('Peso', 'number', 'kg', 1, 'weight_kg', 10),
                ('Estatura', 'number', 'cm', 1, 'height_cm', 20),
                ('Grasa Corporal', 'number', '%', 1, 'body_fat_percentage', 30),
                ('Masa Magra', 'number', 'kg', 1, 'lean_mass_kg', 40),
                ('Pecho', 'number', 'cm', 1, 'chest', 50),
                ('Abdomen', 'number', 'cm', 1, 'abdomen', 60),
                ('Bíceps Derecho', 'number', 'cm', 1, 'right_bicep', 70),
                ('Bíceps Izquierdo', 'number', 'cm', 1, 'left_bicep', 80),
                ('Muslo Derecho', 'number', 'cm', 1, 'right_thigh', 90),
                ('Muslo Izquierdo', 'number', 'cm', 1, 'left_thigh', 100),
            ]
            cursor.executemany('''
                INSERT INTO assessment_config (field_name, field_type, unit, is_default, db_column, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', defaults)
            conn.commit()

        # Migration: Add custom_data to meal_items
        cursor.execute("PRAGMA table_info(meal_items)")
        meal_item_columns = [row[1] for row in cursor.fetchall()]
        if "custom_data" not in meal_item_columns:
            print("Migration: Adding column 'custom_data' to 'meal_items' table...")
            cursor.execute("ALTER TABLE meal_items ADD COLUMN custom_data TEXT")
            conn.commit()

        # Migration: Create nutrition_config table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS nutrition_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                field_name TEXT NOT NULL,
                field_type TEXT NOT NULL DEFAULT 'number',
                unit TEXT,
                is_default BOOLEAN DEFAULT 0,
                db_column TEXT,
                is_active BOOLEAN DEFAULT 1,
                order_index INTEGER DEFAULT 0
            )
        ''')
        conn.commit()

        # Seed default nutrition configs if empty
        cursor.execute("SELECT id FROM nutrition_config")
        if not cursor.fetchone():
            print("Migration: Seeding default nutrition configurations...")
            nut_defaults = [
                ('Peso', 'number', 'g', 1, 'weight_g', 10),
                ('Calorías', 'number', 'kcal', 1, 'calories_kcal', 20),
                ('Proteínas', 'number', 'g', 1, 'protein_g', 30),
                ('Carbohidratos', 'number', 'g', 1, 'carbs_g', 40),
                ('Grasas', 'number', 'g', 1, 'fat_g', 50),
            ]
            cursor.executemany('''
                INSERT INTO nutrition_config (field_name, field_type, unit, is_default, db_column, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', nut_defaults)
            conn.commit()
            
        # Migration: Create food_library table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS food_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                weight_g REAL NOT NULL DEFAULT 100,
                calories_kcal INTEGER NOT NULL DEFAULT 0,
                protein_g REAL NOT NULL DEFAULT 0,
                carbs_g REAL NOT NULL DEFAULT 0,
                fat_g REAL NOT NULL DEFAULT 0,
                custom_data TEXT
            )
        ''')
        conn.commit()

        # Seed default foods if empty
        cursor.execute("SELECT id FROM food_library")
        if not cursor.fetchone():
            print("Migration: Seeding default food library...")
            food_defaults = [
                ("Pechuga de Pollo", 100.0, 165, 31.0, 0.0, 3.6),
                ("Arroz Blanco", 100.0, 130, 2.7, 28.0, 0.3),
                ("Avena en Hojuelas", 100.0, 389, 16.9, 66.3, 6.9),
                ("Huevo Entero", 100.0, 155, 13.0, 1.1, 11.0),
                ("Filete de Salmón", 100.0, 208, 20.0, 0.0, 13.0)
            ]
            cursor.executemany('''
                INSERT INTO food_library (name, weight_g, calories_kcal, protein_g, carbs_g, fat_g)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', food_defaults)
            conn.commit()
            
        # Migration: Add completed_exercises and completed_meals to daily_logs
        cursor.execute("PRAGMA table_info(daily_logs)")
        daily_log_columns = [row[1] for row in cursor.fetchall()]
        if "completed_exercises" not in daily_log_columns:
            print("Migration: Adding column 'completed_exercises' to 'daily_logs' table...")
            cursor.execute("ALTER TABLE daily_logs ADD COLUMN completed_exercises TEXT DEFAULT '[]'")
            conn.commit()
        if "completed_meals" not in daily_log_columns:
            print("Migration: Adding column 'completed_meals' to 'daily_logs' table...")
            cursor.execute("ALTER TABLE daily_logs ADD COLUMN completed_meals TEXT DEFAULT '[]'")
            conn.commit()
            
        # Migration: Create chat_messages table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        
        # Migration: Create index on sender_id/receiver_id
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_participants ON chat_messages(sender_id, receiver_id)")
        conn.commit()
            
    except Exception as e:
        print("Error during migration:", e)
    finally:
        conn.close()

def migrate_existing_db_to_admin_tenant():
    admin_tenant_path = os.path.join(TENANTS_DIR, "trainer_admin.db")
    if not os.path.exists(admin_tenant_path):
        old_db_path = os.path.join(PERSISTENT_DIR, "fitness.db")
        if os.path.exists(old_db_path) and os.path.getsize(old_db_path) > 0:
            import shutil
            try:
                shutil.copy(old_db_path, admin_tenant_path)
                print(f"Migration: Copied existing fitness.db to admin tenant database at {admin_tenant_path}")
            except Exception as e:
                print(f"Migration error: {e}")
        else:
            initialize_tenant_db("admin")
            
    check_and_migrate_db(admin_tenant_path)
    for file in os.listdir(TENANTS_DIR):
        if file.startswith("trainer_") and file.endswith(".db"):
            check_and_migrate_db(os.path.join(TENANTS_DIR, file))

class MockWfile:
    def __init__(self):
        self.data = b""
    def write(self, data):
        self.data += data

class FitnessHTTPRequestHandler(object):
    def __init__(self, request: Request, trainer_id: str = None):
        self.request = request
        self.headers = request.headers
        self._trainer_id = trainer_id
        self.wfile = MockWfile()
        self._status_code = 200
        self._content_type = "application/json; charset=utf-8"

    def verify_jwt(self):
        auth_header = self.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            self.send_error_response(401, "Unauthorized: Missing token")
            return False
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            return True
        except jwt.ExpiredSignatureError:
            self.send_error_response(401, "Unauthorized: Token expired")
            return False
        except jwt.InvalidTokenError:
            self.send_error_response(401, "Unauthorized: Invalid token")
            return False

    def get_request_trainer(self):
        if self._trainer_id:
            return self._trainer_id
        t = self.headers.get("X-Trainer-Id")
        if t:
            return t.strip().lower()
        t_param = self.request.query_params.get("trainer")
        if t_param:
            return t_param.strip().lower()
        return "admin"

    def get_db_connection(self):
        trainer = self.get_request_trainer()
        db_path = get_tenant_db_path(trainer)
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def serve_local_file(self, full_path, content_type):
        self._status_code = 200
        self._content_type = content_type
        with open(full_path, 'rb') as f:
            self.wfile.write(f.read())

    def send_json_response(self, status_code, body):
        self._status_code = status_code
        self._content_type = "application/json; charset=utf-8"
        json_bytes = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.wfile.write(json_bytes)

    def send_error_response(self, status_code, message):
        self.send_json_response(status_code, {"success": False, "error": message})

    # --- API Handlers ---
    
    def handle_auth(self, data):
        auth_type = data.get("type") # "trainer" or "client"
        nickname = data.get("nickname", "").strip().lower()
        password = data.get("password", "").strip()
        
        if auth_type == "trainer":
            conn = sqlite3.connect(MASTER_DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, theme_color, password FROM trainers WHERE LOWER(nickname) = ?", (nickname,))
            row = cursor.fetchone()
            if row and not verify_password(password, row[3]):
                row = None
            conn.close()
            
            if row:
                token = create_access_token({"sub": nickname, "type": "trainer"})
                self.send_json_response(200, {
                    "success": True, 
                    "type": "trainer",
                    "nickname": nickname,
                    "name": row[1],
                    "themeColor": row[2],
                    "token": token
                })
            else:
                self.send_json_response(200, {
                    "success": False, 
                    "error": "Nombre de usuario o contraseña incorrectos para el Entrenador."
                })
        elif auth_type == "client":
            if not nickname or not password:
                self.send_json_response(200, {
                    "success": False,
                    "error": "Por favor ingresa usuario y contraseña."
                })
                return
            
            trainer_header = self.get_request_trainer()
            matched_row = None
            matched_trainer = None
            
            # 1. Try using the request's trainer (defaults to admin if none specified)
            if trainer_header:
                db_path = get_tenant_db_path(trainer_header)
                if os.path.exists(db_path):
                    try:
                        conn = sqlite3.connect(db_path)
                        cursor = conn.cursor()
                        cursor.execute("SELECT id, first_name, last_name, password FROM users WHERE LOWER(nickname) = ?", (nickname,))
                        row = cursor.fetchone()
                        if row and verify_password(password, row[3]):
                            matched_row = row
                            matched_trainer = trainer_header
                        conn.close()
                    except Exception:
                        pass
            
            # 2. If not found or not matched, scan all available tenant databases to locate client
            if not matched_row:
                try:
                    conn_master = sqlite3.connect(MASTER_DB_PATH)
                    cursor_master = conn_master.cursor()
                    cursor_master.execute("SELECT nickname FROM trainers ORDER BY id ASC")
                    trainers_list = [r[0] for r in cursor_master.fetchall()]
                    conn_master.close()
                except Exception:
                    trainers_list = []
                
                if "admin" not in trainers_list:
                    trainers_list.append("admin")
                
                for t in trainers_list:
                    # Skip if we already checked it
                    if t == trainer_header:
                        continue
                    db_path = get_tenant_db_path(t)
                    if os.path.exists(db_path):
                        try:
                            t_conn = sqlite3.connect(db_path)
                            t_cursor = t_conn.cursor()
                            t_cursor.execute("SELECT id, first_name, last_name, password FROM users WHERE LOWER(nickname) = ?", (nickname,))
                            row = t_cursor.fetchone()
                            if row and verify_password(password, row[3]):
                                matched_row = row
                                matched_trainer = t
                                t_conn.close()
                                break
                            t_conn.close()
                        except Exception:
                            pass

            if matched_row and matched_trainer:
                token = create_access_token({"sub": nickname, "type": "client", "user_id": matched_row[0]})
                self.send_json_response(200, {
                    "success": True, 
                    "type": "client",
                    "userId": matched_row[0],
                    "name": f"{matched_row[1]} {matched_row[2]}",
                    "trainerId": matched_trainer,
                    "token": token
                })
            else:
                self.send_json_response(200, {
                    "success": False, 
                    "error": "Nombre de usuario o contraseña incorrectos."
                })
        else:
            self.send_error_response(400, "Invalid auth type. Must be 'trainer' or 'client'.")

    def handle_register_trainer(self, data):
        name = data.get("name", "").strip()
        nickname = data.get("nickname", "").strip().lower()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "").strip()
        theme_color = data.get("theme_color", "#f3ca4c").strip()
        
        if not name or not nickname or not email or not password:
            self.send_error_response(400, "Todos los campos son requeridos.")
            return
            
        conn = sqlite3.connect(MASTER_DB_PATH)
        cursor = conn.cursor()
        try:
            hashed_pwd = get_password_hash(password)
            cursor.execute("""
                INSERT INTO trainers (name, nickname, email, password, theme_color)
                VALUES (?, ?, ?, ?, ?)
            """, (name, nickname, email, hashed_pwd, theme_color))
            conn.commit()
            
            # Dynamically initialize their isolated SQLite DB!
            initialize_tenant_db(nickname)
            
            self.send_json_response(200, {
                "success": True,
                "message": "Entrenador registrado exitosamente.",
                "nickname": nickname,
                "name": name,
                "themeColor": theme_color
            })
        except sqlite3.IntegrityError:
            self.send_json_response(200, {
                "success": False,
                "error": "El nombre de usuario o correo electrónico ya está registrado."
            })
        except Exception as e:
            self.send_json_response(500, {
                "success": False,
                "error": str(e)
            })
        finally:
            conn.close()

    def handle_get_trainer_config(self):
        trainer_nickname = self.get_request_trainer()
        conn = sqlite3.connect(MASTER_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT name, theme_color, logo_url FROM trainers WHERE LOWER(nickname) = ?", (trainer_nickname,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            self.send_json_response(200, {
                "success": True,
                "name": row[0],
                "theme_color": row[1],
                "logo_url": row[2]
            })
        else:
            self.send_json_response(200, {
                "success": False,
                "error": f"Trainer '{trainer_nickname}' not found."
            })

    def handle_get_clients(self):
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, nickname FROM users WHERE id != 0 ORDER BY id ASC")
        rows = cursor.fetchall()
        
        clients = []
        for row in rows:
            client = dict(row)
            # Calculate adherence KPI as daily log check-in frequency (last 30 days)
            cursor.execute("""
                SELECT COUNT(DISTINCT date) as log_count 
                FROM daily_logs 
                WHERE user_id = ? AND date >= date('now', '-30 days')
            """, (client['id'],))
            res = cursor.fetchone()
            log_count = res['log_count'] if res and res['log_count'] else 0
            client['adherence_score'] = min(10.0, (log_count / 30.0) * 10.0)
            clients.append(client)
            
        conn.close()
        self.send_json_response(200, clients)

    def handle_get_client_detail(self, user_id):
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 1. Fetch User Profile
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            self.send_error_response(404, f"Client {user_id} not found.")
            conn.close()
            return
        profile = dict(user_row)
        
        # 2. Fetch Assessments Joined with Skinfolds
        cursor.execute("""
            SELECT aa.*, sa.scapular, sa.triceps, sa.abdominal, sa.iliac as suprailiac,
                   sa.inner_thigh, sa.mid_thigh, sa.medial_calf, sa.chest as chest_fold,
                   sa.biceps as biceps_fold, sa.sum_folds, sa.body_fat_percentage,
                   sa.fat_mass_kg, sa.lean_mass_kg
            FROM anthropometric_assessments aa
            LEFT JOIN skinfold_assessments sa ON aa.id = sa.assessment_id
            WHERE aa.user_id = ?
            ORDER BY aa.date ASC
        """, (user_id,))
        assessments = [dict(row) for row in cursor.fetchall()]
        
        # 3. Fetch Daily Logs
        cursor.execute("SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date ASC", (user_id,))
        daily_logs = [dict(row) for row in cursor.fetchall()]
        
        # 4. Fetch Active Workout Plan
        cursor.execute("SELECT * FROM workout_plans WHERE user_id = ? LIMIT 1", (user_id,))
        plan_row = cursor.fetchone()
        workout_plan = None
        if plan_row:
            workout_plan = dict(plan_row)
            # Fetch days
            cursor.execute("SELECT * FROM workout_days WHERE plan_id = ? ORDER BY order_index ASC", (workout_plan['id'],))
            days = []
            for day_row in cursor.fetchall():
                day = dict(day_row)
                # Fetch blocks for this day
                cursor.execute("""
                    SELECT wb.id, wb.name, wb.routine_class, wb.description, wdb.order_index
                    FROM workout_day_blocks wdb
                    JOIN workout_blocks wb ON wdb.workout_block_id = wb.id
                    WHERE wdb.workout_day_id = ?
                    ORDER BY wdb.order_index ASC
                """, (day['id'],))
                blocks = []
                for block_row in cursor.fetchall():
                    block = dict(block_row)
                    # Fetch exercises for this block
                    cursor.execute("""
                        SELECT we.*, e.name as exercise_name, e.video_url, e.description
                        FROM workout_exercises we
                        JOIN exercises e ON we.exercise_id = e.id
                        WHERE we.workout_block_id = ?
                        ORDER BY we.order_index ASC
                    """, (block['id'],))
                    block['exercises'] = [dict(ex) for ex in cursor.fetchall()]
                    blocks.append(block)
                day['blocks'] = blocks
                days.append(day)
            workout_plan['days'] = days
            
        # 5. Fetch Active Nutrition Plan
        cursor.execute("SELECT * FROM nutrition_plans WHERE user_id = ? LIMIT 1", (user_id,))
        nut_row = cursor.fetchone()
        nutrition_plan = None
        if nut_row:
            nutrition_plan = dict(nut_row)
            # Fetch meals
            cursor.execute("SELECT * FROM meals WHERE nutrition_plan_id = ? ORDER BY order_index ASC", (nutrition_plan['id'],))
            meals = []
            for meal_row in cursor.fetchall():
                meal = dict(meal_row)
                # Fetch meal items
                cursor.execute("SELECT * FROM meal_items WHERE meal_id = ? ORDER BY id ASC", (meal['id'],))
                meal_items = []
                for item_row in cursor.fetchall():
                    item = dict(item_row)
                    if item.get("custom_data"):
                        try:
                            item["custom_data"] = json.loads(item["custom_data"])
                        except Exception:
                            pass
                    meal_items.append(item)
                meal['items'] = meal_items
                meals.append(meal)
            nutrition_plan['meals'] = meals

        conn.close()
        
        detail = {
            "profile": profile,
            "assessments": assessments,
            "daily_logs": daily_logs,
            "workout_plan": workout_plan,
            "nutrition_plan": nutrition_plan
        }
        self.send_json_response(200, detail)

    def handle_create_client(self, data):
        first_name = data.get("first_name")
        last_name = data.get("last_name")
        email = data.get("email")
        phone = data.get("phone")
        birthdate = data.get("birthdate")
        height_cm = data.get("height_cm", 170.0)
        blood_type = data.get("blood_type", "O+")
        allergies = data.get("allergies", "Ninguna")
        medications = data.get("medications", "Ninguno")
        availability_schedule = data.get("availability_schedule", "{}")
        nickname = data.get("nickname", "").strip()
        password = data.get("password", "").strip()
        
        if not first_name or not last_name or not email:
            self.send_error_response(400, "Missing required fields (first_name, last_name, email).")
            return
            
        # Fallback values
        if not nickname:
            nickname = email.split('@')[0].lower()
        if not password:
            password = "123456"
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        
        # Check nickname uniqueness
        cursor.execute("SELECT id FROM users WHERE LOWER(nickname) = ?", (nickname.lower(),))
        if cursor.fetchone():
            self.send_json_response(200, {"success": False, "error": f"El nombre de usuario (nickname) '{nickname}' ya está registrado."})
            conn.close()
            return
            
        try:
            hashed_pwd = get_password_hash(password)
            cursor.execute("""
                INSERT INTO users (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, hashed_pwd))
            client_id = cursor.lastrowid
            
            # Seed default workout & nutrition plan skeleton for new client
            cursor.execute("""
                INSERT INTO workout_plans (user_id, title, description, start_date, end_date)
                VALUES (?, ?, ?, ?, ?)
            """, (client_id, "Fase Introducción Fuerza", "Rutina base para adaptación neuromuscular.", "2026-06-07", "2026-09-07"))
            plan_id = cursor.lastrowid
            
            cursor.execute("INSERT INTO workout_days (plan_id, day_name, order_index) VALUES (?, ?, ?)", (plan_id, "Día A: Cuerpo Completo", 1))
            day_id = cursor.lastrowid
            
            # Create a default workout block for the client
            cursor.execute("""
                INSERT INTO workout_blocks (user_id, name, routine_class, description)
                VALUES (?, 'Cuerpo Completo', 'Fullbody', 'Bloque inicial para adaptación.')
            """, (client_id,))
            block_id = cursor.lastrowid
            
            # Link block to day
            cursor.execute("""
                INSERT INTO workout_day_blocks (workout_day_id, workout_block_id, order_index)
                VALUES (?, ?, 1)
            """, (day_id, block_id))
            
            # Link pushups and squats by default (IDs 1 and 2 from seeded exercises) to the block
            cursor.execute("""
                INSERT INTO workout_exercises (workout_block_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
                VALUES (?, 1, 3, "10-12", 7, 90, "Foco en rango de movimiento completo.", 1)
            """, (block_id,))
            cursor.execute("""
                INSERT INTO workout_exercises (workout_block_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
                VALUES (?, 2, 3, "12-15", 7, 90, "Bajar controlado.", 2)
            """, (block_id,))
            
            # Nutrition Plan default
            cursor.execute("""
                INSERT INTO nutrition_plans (user_id, title, description, start_date, end_date, target_calories, target_protein, target_carbs, target_fat)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (client_id, "Nutrición Inicial Normocalórica", "Balance energético neutro para adaptación.", "2026-06-07", "2026-09-07", 2000, 130, 220, 60))
            nut_id = cursor.lastrowid
            cursor.execute("INSERT INTO meals (nutrition_plan_id, meal_name, order_index) VALUES (?, 'Comidas Generales', 1)", (nut_id,))
            meal_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes)
                VALUES (?, 'Menú Balanceado de Proteína + Carbohidratos complejos + Verduras', 500, 2000, 130, 220, 60, 'Distribuir libremente en 3 o 4 comidas.')
            """, (meal_id,))
            
            conn.commit()
            self.send_json_response(200, {"success": True, "client_id": client_id})
        except sqlite3.IntegrityError:
            self.send_json_response(200, {"success": False, "error": "El correo ya está registrado."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_assign_routine(self, data):
        client_id = data.get('client_id')
        plan_id = data.get('plan_id') # ID de la plantilla
        
        if not client_id or not plan_id:
            self.send_error_response(400, "Missing client_id or plan_id")
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        
        try:
            # Verificar existencia de la plantilla
            cursor.execute("SELECT * FROM workout_plans WHERE id = ?", (plan_id,))
            template = cursor.fetchone()
            if not template:
                self.send_json_response(404, {"success": False, "error": "Template not found"})
                conn.close()
                return
            
            template_dict = dict(zip([col[0] for col in cursor.description], template))
            
            # Limpiar rutina anterior del cliente
            cursor.execute("SELECT id FROM workout_plans WHERE user_id = ?", (client_id,))
            old_plans = cursor.fetchall()
            for (op_id,) in old_plans:
                cursor.execute("SELECT id FROM workout_days WHERE plan_id = ?", (op_id,))
                for (od_id,) in cursor.fetchall():
                    cursor.execute("DELETE FROM workout_day_blocks WHERE workout_day_id = ?", (od_id,))
                cursor.execute("DELETE FROM workout_days WHERE plan_id = ?", (op_id,))
                cursor.execute("DELETE FROM workout_plans WHERE id = ?", (op_id,))
            
            # Crear nueva rutina para el cliente
            cursor.execute("""
                INSERT INTO workout_plans (user_id, title, description, start_date, end_date)
                VALUES (?, ?, ?, date('now'), date('now', '+3 months'))
            """, (client_id, template_dict['title'], template_dict['description']))
            new_plan_id = cursor.lastrowid
            
            # Clonar los días y asociar los bloques
            cursor.execute("SELECT * FROM workout_days WHERE plan_id = ?", (plan_id,))
            t_days = [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]
            
            for t_day in t_days:
                cursor.execute("""
                    INSERT INTO workout_days (plan_id, day_name, order_index)
                    VALUES (?, ?, ?)
                """, (new_plan_id, t_day['day_name'], t_day['order_index']))
                new_day_id = cursor.lastrowid
                
                # Clonar enlace a los bloques de ese día
                cursor.execute("SELECT * FROM workout_day_blocks WHERE workout_day_id = ?", (t_day['id'],))
                t_dbs = cursor.fetchall()
                for t_db in t_dbs:
                    cursor.execute("""
                        INSERT INTO workout_day_blocks (workout_day_id, workout_block_id, order_index)
                        VALUES (?, ?, ?)
                    """, (new_day_id, t_db[2], t_db[3]))
            conn.commit()
            self.send_json_response(200, {"success": True, "message": "Rutina asignada correctamente"})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_create_assessment(self, data):
        user_id = data.get("user_id")
        date = data.get("date")
        if not user_id or not date:
            self.send_error_response(400, "Missing user_id or date.")
            return
            
        # Extract all parameters with defaults
        weight = float(data.get("weight_kg", 0))
        height = float(data.get("height_cm", 170))
        fc_rep = int(data.get("fc_rep", 60))
        
        # Other native columns for anthropometric_assessments
        neck = float(data.get("neck", 0))
        chest = float(data.get("chest", 0))
        shoulder = float(data.get("shoulder", 0))
        abdomen = float(data.get("abdomen", 0))
        iliac = float(data.get("iliac", 0))
        trochanter = float(data.get("trochanter", 0))
        right_thigh = float(data.get("right_thigh", 0))
        left_thigh = float(data.get("left_thigh", 0))
        right_calf = float(data.get("right_calf", 0))
        left_calf = float(data.get("left_calf", 0))
        right_bicep = float(data.get("right_bicep", 0))
        left_bicep = float(data.get("left_bicep", 0))
        right_forearm = float(data.get("right_forearm", 0))
        left_forearm = float(data.get("left_forearm", 0))
        custom_data = data.get("custom_data", "")
        if isinstance(custom_data, (dict, list)):
            custom_data = json.dumps(custom_data)
        
        # Skinfolds (skinfold_assessments table)
        triceps = float(data.get("triceps", 0))
        scapular = float(data.get("scapular", 0))
        iliac_fold = float(data.get("iliac", 0)) # iliac maps to iliac fold
        abdominal = float(data.get("abdominal", 0))
        inner_thigh = float(data.get("inner_thigh", 0))
        mid_thigh = float(data.get("mid_thigh", 0))
        medial_calf = float(data.get("medial_calf", 0))
        chest_fold = float(data.get("chest_fold", 0))
        biceps_fold = float(data.get("biceps_fold", 0))
        
        # Faulkner formula for fat %
        fat_pct = (triceps + scapular + iliac_fold + abdominal) * 0.153 + 5.783
        fat_mass = weight * (fat_pct / 100.0)
        lean_mass = weight - fat_mass
        bmi = weight / ((height/100.0) * (height/100.0))
        sum_folds = triceps + scapular + iliac_fold + abdominal
        
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            # Delete if duplicate date/user to avoid unique constraint error
            cursor.execute("DELETE FROM anthropometric_assessments WHERE user_id = ? AND date = ?", (user_id, date))
            
            cursor.execute("""
                INSERT INTO anthropometric_assessments (
                    user_id, date, weight_kg, height_cm, bmi, fc_max, fc_rep,
                    neck, chest, shoulder, abdomen, iliac, trochanter,
                    right_thigh, left_thigh, right_calf, left_calf,
                    right_bicep, left_bicep, right_forearm, left_forearm, custom_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, date, weight, height, bmi, 195, fc_rep,
                neck, chest, shoulder, abdomen, iliac, trochanter,
                right_thigh, left_thigh, right_calf, left_calf,
                right_bicep, left_bicep, right_forearm, left_forearm, custom_data
            ))
            assessment_id = cursor.lastrowid
            
            cursor.execute("""
                INSERT INTO skinfold_assessments (
                    assessment_id, scapular, triceps, abdominal, iliac,
                    inner_thigh, mid_thigh, medial_calf, chest, biceps,
                    sum_folds, body_fat_percentage, fat_mass_kg, lean_mass_kg
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                assessment_id, scapular, triceps, abdominal, iliac_fold,
                inner_thigh, mid_thigh, medial_calf, chest_fold, biceps_fold,
                sum_folds, fat_pct, fat_mass, lean_mass
            ))
            conn.commit()
            self.send_json_response(200, {"success": True, "assessment_id": assessment_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_delete_assessment(self, data):
        assessment_id = data.get("id")
        if not assessment_id:
            self.send_error_response(400, "Missing assessment id.")
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM anthropometric_assessments WHERE id = ?", (assessment_id,))
            conn.commit()
            self.send_json_response(200, {"success": True, "message": "Assessment deleted."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_create_daily_log(self, data):
        user_id = data.get("user_id")
        date = data.get("date")
        
        if not user_id or not date:
            self.send_error_response(400, "Missing user_id or date.")
            return
            
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if completed_exercises exists in table
        cursor.execute("PRAGMA table_info(daily_logs)")
        cols = [r[1] for r in cursor.fetchall()]
        has_checklist = "completed_exercises" in cols
        
        # Read existing log to preserve variables not sent in partial updates
        cursor.execute("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", (user_id, date))
        existing = cursor.fetchone()
        
        # Build merged object
        if existing:
            merged = {
                "weight_kg": data.get("weight_kg") if data.get("weight_kg") is not None else existing["weight_kg"],
                "steps_count": data.get("steps_count") if data.get("steps_count") is not None else existing["steps_count"],
                "sleep_hours": data.get("sleep_hours") if data.get("sleep_hours") is not None else existing["sleep_hours"],
                "sleep_quality": data.get("sleep_quality") if data.get("sleep_quality") is not None else existing["sleep_quality"],
                "water_intake_ml": data.get("water_intake_ml") if data.get("water_intake_ml") is not None else existing["water_intake_ml"],
                "energy_level": data.get("energy_level") if data.get("energy_level") is not None else existing["energy_level"],
                "digestion_status": data.get("digestion_status") if data.get("digestion_status") is not None else existing["digestion_status"],
                "diet_adherence": data.get("diet_adherence") if data.get("diet_adherence") is not None else existing["diet_adherence"],
                "resting_hr": data.get("resting_hr") if data.get("resting_hr") is not None else existing["resting_hr"],
                "hrv": data.get("hrv") if data.get("hrv") is not None else existing["hrv"],
                "notes": data.get("notes") if data.get("notes") is not None else existing["notes"],
            }
            if has_checklist:
                merged["completed_exercises"] = data.get("completed_exercises") if data.get("completed_exercises") is not None else existing["completed_exercises"]
                merged["completed_meals"] = data.get("completed_meals") if data.get("completed_meals") is not None else existing["completed_meals"]
            
            update_sql = """
                UPDATE daily_logs SET
                    weight_kg = ?, steps_count = ?, sleep_hours = ?, sleep_quality = ?,
                    water_intake_ml = ?, energy_level = ?, digestion_status = ?,
                    diet_adherence = ?, resting_hr = ?, hrv = ?, notes = ?
            """
            params = [
                merged["weight_kg"], merged["steps_count"], merged["sleep_hours"], merged["sleep_quality"],
                merged["water_intake_ml"], merged["energy_level"], merged["digestion_status"],
                merged["diet_adherence"], merged["resting_hr"], merged["hrv"], merged["notes"]
            ]
            if has_checklist:
                update_sql += ", completed_exercises = ?, completed_meals = ?"
                params.extend([merged["completed_exercises"], merged["completed_meals"]])
            
            update_sql += " WHERE user_id = ? AND date = ?"
            params.extend([user_id, date])
            cursor.execute(update_sql, params)
        else:
            if has_checklist:
                cursor.execute("""
                    INSERT INTO daily_logs (
                        user_id, date, weight_kg, steps_count, sleep_hours, sleep_quality,
                        water_intake_ml, energy_level, digestion_status, diet_adherence, resting_hr, hrv, notes,
                        completed_exercises, completed_meals
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id, date,
                    data.get("weight_kg"), data.get("steps_count"), data.get("sleep_hours"), data.get("sleep_quality"),
                    data.get("water_intake_ml", 0), data.get("energy_level"), data.get("digestion_status"),
                    data.get("diet_adherence"), data.get("resting_hr"), data.get("hrv"), data.get("notes"),
                    data.get("completed_exercises", "[]"), data.get("completed_meals", "[]")
                ))
            else:
                cursor.execute("""
                    INSERT INTO daily_logs (
                        user_id, date, weight_kg, steps_count, sleep_hours, sleep_quality,
                        water_intake_ml, energy_level, digestion_status, diet_adherence, resting_hr, hrv, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id, date,
                    data.get("weight_kg"), data.get("steps_count"), data.get("sleep_hours"), data.get("sleep_quality"),
                    data.get("water_intake_ml", 0), data.get("energy_level"), data.get("digestion_status"),
                    data.get("diet_adherence"), data.get("resting_hr"), data.get("hrv"), data.get("notes")
                ))
            
        try:
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_get_exercises(self):
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM exercises ORDER BY id ASC")
        rows = cursor.fetchall()
        exercises = [dict(row) for row in rows]
        conn.close()
        self.send_json_response(200, exercises)

    def handle_create_exercise(self, data):
        name = data.get("name")
        primary_muscle = data.get("primary_muscle")
        
        if not name or not primary_muscle:
            self.send_error_response(400, "Nombre y músculo primario son requeridos.")
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO exercises (name, description, primary_muscle, secondary_muscles, equipment, video_url, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                name, data.get("description", ""), primary_muscle, 
                data.get("secondary_muscles", ""), data.get("equipment", ""), 
                data.get("video_url", ""), data.get("image_url", "")
            ))
            conn.commit()
            self.send_json_response(200, {"success": True, "exercise_id": cursor.lastrowid})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_get_workout_blocks(self):
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get blocks that are either global (0) or belong to the active user context (simplified for now)
        cursor.execute("SELECT * FROM workout_blocks WHERE user_id = 0 ORDER BY id ASC")
        blocks = [dict(row) for row in cursor.fetchall()]
        
        for block in blocks:
            cursor.execute("""
                SELECT we.*, e.name as exercise_name, e.primary_muscle as exercise_primary_muscle
                FROM workout_exercises we
                JOIN exercises e ON we.exercise_id = e.id
                WHERE we.workout_block_id = ?
                ORDER BY we.order_index ASC
            """, (block['id'],))
            block['exercises'] = [dict(ex) for ex in cursor.fetchall()]
            
        conn.close()
        self.send_json_response(200, blocks)
        
    def handle_create_workout_block(self, data):
        name = data.get("name")
        routine_class = data.get("routine_class", "Fullbody")
        
        if not name:
            self.send_error_response(400, "El nombre del bloque es requerido.")
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO workout_blocks (user_id, name, routine_class, description)
                VALUES (0, ?, ?, ?)
            """, (name, routine_class, data.get("description", "")))
            block_id = cursor.lastrowid
            
            exercises = data.get("exercises", [])
            for ex in exercises:
                cursor.execute("""
                    INSERT INTO workout_exercises (workout_block_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    block_id, ex.get("exercise_id"), ex.get("sets_count", 3), ex.get("reps_range", "10"),
                    ex.get("rpe_target", 7), ex.get("rest_seconds", 90), ex.get("notes", ""), ex.get("order_index", 1)
                ))
            conn.commit()
            self.send_json_response(200, {"success": True, "block_id": block_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_get_routines(self):
        # Fetch global routines (user_id = 0)
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM workout_plans WHERE user_id = 0")
        plans = [dict(row) for row in cursor.fetchall()]
        
        for plan in plans:
            cursor.execute("SELECT * FROM workout_days WHERE plan_id = ? ORDER BY order_index ASC", (plan['id'],))
            days = []
            for day_row in cursor.fetchall():
                day = dict(day_row)
                cursor.execute("""
                    SELECT wb.* 
                    FROM workout_blocks wb
                    JOIN workout_day_blocks wdb ON wb.id = wdb.workout_block_id
                    WHERE wdb.workout_day_id = ?
                    ORDER BY wdb.order_index ASC
                """, (day['id'],))
                blocks = [dict(b) for b in cursor.fetchall()]
                
                # Para mostrar la cantidad de ejercicios en la vista rápida
                total_ex = 0
                for block in blocks:
                    cursor.execute("""
                        SELECT we.*, e.name as exercise_name 
                        FROM workout_exercises we
                        JOIN exercises e ON we.exercise_id = e.id
                        WHERE we.workout_block_id = ?
                    """, (block['id'],))
                    block_exercises = [dict(ex) for ex in cursor.fetchall()]
                    block['exercises'] = block_exercises
                    total_ex += len(block_exercises)
                    
                day['blocks'] = blocks
                day['total_exercises'] = total_ex
                days.append(day)
            plan['days'] = days
            
        conn.close()
        self.send_json_response(200, plans)
        
    def handle_create_routine(self, data):
        title = data.get("title")
        if not title:
            self.send_error_response(400, "El título es requerido.")
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            # Create the global plan (user_id = 0)
            cursor.execute("""
                INSERT INTO workout_plans (user_id, title, description, start_date, end_date)
                VALUES (0, ?, ?, NULL, NULL)
            """, (title, data.get("description", "")))
            plan_id = cursor.lastrowid
            
            # Create days and link blocks
            days = data.get("days", [])
            for day in days:
                cursor.execute("INSERT INTO workout_days (plan_id, day_name, order_index) VALUES (?, ?, ?)", 
                    (plan_id, day.get("day_name", "Día"), day.get("order_index", 1)))
                day_id = cursor.lastrowid
                
                blocks = day.get("blocks", [])
                for block in blocks:
                    cursor.execute("""
                        INSERT INTO workout_day_blocks (workout_day_id, workout_block_id, order_index)
                        VALUES (?, ?, ?)
                    """, (day_id, block.get("block_id"), block.get("order_index", 1)))
            conn.commit()
            self.send_json_response(200, {"success": True, "plan_id": plan_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_get_daily_calendar(self, query_string):
        query_params = urllib.parse.parse_qs(query_string)
        user_id = query_params.get("user_id", [None])[0]
        month = query_params.get("month", [None])[0]
        year = query_params.get("year", [None])[0]
        
        if not user_id or not month or not year:
            self.send_error_response(400, "user_id, month and year are required.")
            return
            
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Format month for sqlite LIKE query
        month_padded = str(month).zfill(2)
        date_pattern = f"{year}-{month_padded}-%"
        
        cursor.execute("""
            SELECT * FROM daily_logs 
            WHERE user_id = ? AND date LIKE ?
        """, (user_id, date_pattern))
        
        logs = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        self.send_json_response(200, logs)



    def handle_update_exercise(self, data):
        ex_id = data.get('id')
        name = data.get('name')
        if not ex_id or not name:
            self.send_error_response(400, "Missing id or name")
            return
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                UPDATE exercises SET name=?, primary_muscle=?, secondary_muscles=?, equipment=?, video_url=?
                WHERE id=?
            ''', (name, data.get('primary_muscle'), data.get('secondary_muscles'), data.get('equipment'), data.get('video_url'), ex_id))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_delete_exercise(self, data):
        ex_id = data.get('id')
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM exercises WHERE id=?", (ex_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_update_block(self, data):
        print("DEBUG: handle_update_block received data:", data)
        block_id = data.get('id')
        name = data.get('name')
        exercises = data.get('exercises', [])
        if not block_id or not name:
            self.send_error_response(400, "Missing id or name")
            return
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE workout_blocks SET name=?, description=? WHERE id=?", 
                          (name, data.get('description', ''), block_id))
            cursor.execute("DELETE FROM workout_exercises WHERE workout_block_id=?", (block_id,))
            for ex in exercises:
                cursor.execute('''
                    INSERT INTO workout_exercises (workout_block_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (block_id, ex.get('exercise_id'), ex.get('sets_count'), ex.get('reps_range'), ex.get('rpe_target'), ex.get('rest_seconds', 90), ex.get('notes', ''), ex.get('order_index')))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_delete_block(self, data):
        block_id = data.get('id')
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM workout_blocks WHERE id=?", (block_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_update_routine(self, data):
        plan_id = data.get('id')
        title = data.get('title')
        days = data.get('days', [])
        if not plan_id or not title:
            self.send_error_response(400, "Missing id or title")
            return
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE workout_plans SET title=?, description=? WHERE id=?", 
                          (title, data.get('description'), plan_id))
            cursor.execute("SELECT id FROM workout_days WHERE plan_id=?", (plan_id,))
            for (od_id,) in cursor.fetchall():
                cursor.execute("DELETE FROM workout_day_blocks WHERE workout_day_id=?", (od_id,))
            cursor.execute("DELETE FROM workout_days WHERE plan_id=?", (plan_id,))
            for day in days:
                cursor.execute("INSERT INTO workout_days (plan_id, day_name, order_index) VALUES (?, ?, ?)", 
                               (plan_id, day.get('day_name'), day.get('order_index')))
                day_id = cursor.lastrowid
                for b_idx, block_id in enumerate(day.get('block_ids', [])):
                    cursor.execute("INSERT INTO workout_day_blocks (workout_day_id, workout_block_id, order_index) VALUES (?, ?, ?)", 
                                  (day_id, block_id, b_idx+1))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_delete_routine(self, data):
        plan_id = data.get('id')
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM workout_plans WHERE id=?", (plan_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def check_admin_auth(self):
        passcode = self.headers.get("X-Admin-Passcode")
        return passcode == "dev123"

    def handle_admin_reset_password(self, data):
        target_type = data.get('target_type')
        target_id = data.get('target_id')
        new_password = data.get('new_password')
        trainer_nick = data.get('trainer_nick')
        
        if not target_type or not target_id or not new_password:
            self.send_error_response(400, 'Missing fields')
            return
            
        hashed_pwd = get_password_hash(new_password)
        
        if target_type == 'trainer':
            conn = sqlite3.connect(MASTER_DB_PATH)
            cur = conn.cursor()
            cur.execute('UPDATE trainers SET password = ? WHERE id = ?', (hashed_pwd, target_id))
            conn.commit()
            conn.close()
        elif target_type == 'client':
            if not trainer_nick:
                self.send_error_response(400, 'Missing trainer_nick for client reset')
                return
            db_path = get_tenant_db_path(trainer_nick)
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute('UPDATE users SET password = ? WHERE id = ?', (hashed_pwd, target_id))
            conn.commit()
            conn.close()
        else:
            self.send_error_response(400, 'Invalid target_type')
            return
            
        self.send_json_response(200, {'success': True, 'message': 'Password reset successfully'})

    def handle_admin_verify(self, data):
        passcode = data.get("passcode")
        if passcode == "dev123":
            self.send_json_response(200, {"success": True})
        else:
            self.send_json_response(200, {"success": False, "error": "Código de acceso incorrecto."})

    def handle_admin_get_trainers(self):
        if not self.check_admin_auth():
            self.send_json_response(401, {"success": False, "error": "No autorizado. Código de acceso inválido."})
            return
        conn = sqlite3.connect(MASTER_DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, nickname, email, password, theme_color, logo_url, subscription_status, created_at FROM trainers ORDER BY id ASC")
        rows = cursor.fetchall()
        trainers = [dict(row) for row in rows]
        conn.close()
        self.send_json_response(200, trainers)

    def handle_admin_create_trainer(self, data):
        if not self.check_admin_auth():
            self.send_json_response(401, {"success": False, "error": "No autorizado. Código de acceso inválido."})
            return
        self.handle_register_trainer(data)

    def handle_admin_update_trainer(self, data):
        if not self.check_admin_auth():
            self.send_json_response(401, {"success": False, "error": "No autorizado. Código de acceso inválido."})
            return
        trainer_id = data.get("id")
        name = data.get("name", "").strip()
        nickname = data.get("nickname", "").strip().lower()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "").strip()
        theme_color = data.get("theme_color", "#f3ca4c").strip()

        if not trainer_id or not name or not nickname or not email or not password:
            self.send_error_response(400, "Todos los campos son requeridos.")
            return

        conn = sqlite3.connect(MASTER_DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id FROM trainers WHERE (LOWER(nickname) = ? OR LOWER(email) = ?) AND id != ?", (nickname, email, trainer_id))
            if cursor.fetchone():
                self.send_json_response(200, {"success": False, "error": "El nombre de usuario o correo ya está registrado por otro entrenador."})
                return

            cursor.execute("SELECT nickname FROM trainers WHERE id = ?", (trainer_id,))
            row = cursor.fetchone()
            if not row:
                self.send_json_response(200, {"success": False, "error": "Entrenador no encontrado."})
                return
            old_nickname = row[0]

            cursor.execute("""
                UPDATE trainers SET
                    name = ?, nickname = ?, email = ?, password = ?, theme_color = ?
                WHERE id = ?
            """, (name, nickname, email, password, theme_color, trainer_id))
            conn.commit()

            if old_nickname != nickname:
                old_db = os.path.join(TENANTS_DIR, f"trainer_{old_nickname}.db")
                new_db = os.path.join(TENANTS_DIR, f"trainer_{nickname}.db")
                if os.path.exists(old_db):
                    try:
                        os.rename(old_db, new_db)
                        print(f"Renamed tenant DB from {old_db} to {new_db}")
                    except Exception as e:
                        print(f"Error renaming DB: {e}")

            self.send_json_response(200, {"success": True, "message": "Entrenador actualizado correctamente."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_admin_delete_trainer(self, data):
        if not self.check_admin_auth():
            self.send_json_response(401, {"success": False, "error": "No autorizado. Código de acceso inválido."})
            return
        trainer_id = data.get("id")
        if not trainer_id:
            self.send_error_response(400, "ID del entrenador es requerido.")
            return

        conn = sqlite3.connect(MASTER_DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT nickname FROM trainers WHERE id = ?", (trainer_id,))
            row = cursor.fetchone()
            if not row:
                self.send_json_response(200, {"success": False, "error": "Entrenador no encontrado."})
                return
            nickname = row[0]

            if nickname == "admin":
                self.send_json_response(200, {"success": False, "error": "No se puede eliminar el entrenador administrador principal."})
                return

            cursor.execute("DELETE FROM trainers WHERE id = ?", (trainer_id,))
            conn.commit()

            db_path = os.path.join(TENANTS_DIR, f"trainer_{nickname}.db")
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                    print(f"Deleted physical DB file for trainer '{nickname}': {db_path}")
                except Exception as e:
                    print(f"Error deleting physical DB file: {e}")

            self.send_json_response(200, {"success": True, "message": "Entrenador eliminado correctamente."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_update_client(self, data):
        client_id = data.get("id")
        if not client_id:
            self.send_error_response(400, "ID del cliente es requerido.")
            return

        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            # 1. Fetch current client data to perform a partial/merged update
            cursor.execute("SELECT * FROM users WHERE id = ?", (client_id,))
            row = cursor.fetchone()
            if not row:
                self.send_error_response(404, "Cliente no encontrado.")
                conn.close()
                return
            
            current_client = dict(row)
            
            # 2. Merge inputs: if a field isn't present in 'data' payload, fallback to database value
            first_name = data.get("first_name")
            if first_name is None:
                first_name = current_client.get("first_name")
                
            last_name = data.get("last_name")
            if last_name is None:
                last_name = current_client.get("last_name")
                
            email = data.get("email")
            if email is None:
                email = current_client.get("email")
                
            phone = data.get("phone")
            if phone is None:
                phone = current_client.get("phone")
                
            birthdate = data.get("birthdate")
            if birthdate is None:
                birthdate = current_client.get("birthdate")
                
            height_cm = data.get("height_cm")
            if height_cm is None:
                height_cm = current_client.get("height_cm", 170.0)
                
            blood_type = data.get("blood_type")
            if blood_type is None:
                blood_type = current_client.get("blood_type", "O+")
                
            allergies = data.get("allergies")
            if allergies is None:
                allergies = current_client.get("allergies", "Ninguna")
                
            medications = data.get("medications")
            if medications is None:
                medications = current_client.get("medications", "Ninguno")
                
            nickname = data.get("nickname")
            if nickname is None:
                nickname = current_client.get("nickname")
                
            # If username/nickname is updated, ensure it's not taken by another user
            if nickname:
                cursor.execute("SELECT id FROM users WHERE LOWER(nickname) = ? AND id != ?", (nickname.lower(), client_id))
                if cursor.fetchone():
                    self.send_json_response(200, {"success": False, "error": f"El nombre de usuario '{nickname}' ya está registrado."})
                    conn.close()
                    return

            raw_password = data.get("password")
            if raw_password is not None and str(raw_password).strip() != "":
                # Encrypt if it's a new plain password
                if not str(raw_password).startswith("$2b$"):
                    password = get_password_hash(str(raw_password))
                else:
                    password = raw_password
            else:
                password = current_client.get("password")

            cursor.execute("""
                UPDATE users SET
                    first_name = ?, last_name = ?, email = ?, phone = ?, birthdate = ?,
                    height_cm = ?, blood_type = ?, allergies = ?, medications = ?,
                    nickname = ?, password = ?
                WHERE id = ?
            """, (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, nickname, password, client_id))
            conn.commit()
            self.send_json_response(200, {"success": True, "message": "Cliente actualizado correctamente."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_delete_client(self, data):
        client_id = data.get("id")
        if not client_id:
            self.send_error_response(400, "ID del cliente es requerido.")
            return

        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM users WHERE id = ?", (client_id,))
            conn.commit()
            self.send_json_response(200, {"success": True, "message": "Cliente eliminado correctamente."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_create_nutrition_plan(self, data):
        user_id = data.get("user_id")
        title = data.get("title")
        if user_id is None or not title:
            self.send_error_response(400, "user_id y title son requeridos.")
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO nutrition_plans (user_id, title, description, start_date, end_date, target_calories, target_protein, target_carbs, target_fat)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, title, data.get("description", ""), data.get("start_date"), data.get("end_date"), 
                  data.get("target_calories"), data.get("target_protein"), data.get("target_carbs"), data.get("target_fat")))
            plan_id = cursor.lastrowid
            
            meals = data.get("meals", [])
            for meal in meals:
                cursor.execute("INSERT INTO meals (nutrition_plan_id, meal_name, order_index) VALUES (?, ?, ?)", 
                    (plan_id, meal.get("meal_name", "Comida"), meal.get("order_index", 1)))
                meal_id = cursor.lastrowid
                
                items = meal.get("items", [])
                for item in items:
                    custom_data_val = item.get("custom_data")
                    if isinstance(custom_data_val, (dict, list)):
                        custom_data_val = json.dumps(custom_data_val)
                    cursor.execute("""
                        INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes, custom_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (meal_id, item.get("food_name"), item.get("weight_g", 0), item.get("calories_kcal", 0),
                          item.get("protein_g", 0), item.get("carbs_g", 0), item.get("fat_g", 0), item.get("notes", ""), custom_data_val))
            conn.commit()
            self.send_json_response(200, {"success": True, "plan_id": plan_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_assign_nutrition_plan(self, data):
        plan_id = data.get("plan_id")
        user_id = data.get("user_id")
        if not plan_id or not user_id:
            self.send_error_response(400, "plan_id y user_id son requeridos.")
            return
            
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            # Copy plan
            cursor.execute("SELECT * FROM nutrition_plans WHERE id = ?", (plan_id,))
            plan_row = cursor.fetchone()
            if not plan_row:
                self.send_error_response(404, "Plantilla de nutrición no encontrada.")
                return
                
            p = dict(plan_row)
            cursor.execute("""
                INSERT INTO nutrition_plans (user_id, title, description, start_date, end_date, target_calories, target_protein, target_carbs, target_fat)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, p['title'], p['description'], p['start_date'], p['end_date'], 
                  p['target_calories'], p['target_protein'], p['target_carbs'], p['target_fat']))
            new_plan_id = cursor.lastrowid
            
            # Copy meals
            cursor.execute("SELECT * FROM meals WHERE nutrition_plan_id = ?", (plan_id,))
            meals = cursor.fetchall()
            for meal_row in meals:
                m = dict(meal_row)
                cursor.execute("INSERT INTO meals (nutrition_plan_id, meal_name, order_index) VALUES (?, ?, ?)", 
                    (new_plan_id, m['meal_name'], m['order_index']))
                new_meal_id = cursor.lastrowid
                
                # Copy meal items
                cursor.execute("SELECT * FROM meal_items WHERE meal_id = ?", (m['id'],))
                items = cursor.fetchall()
                for item_row in items:
                    i = dict(item_row)
                    cursor.execute("""
                        INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes, custom_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (new_meal_id, i['food_name'], i['weight_g'], i['calories_kcal'],
                          i['protein_g'], i['carbs_g'], i['fat_g'], i['notes'], i.get('custom_data')))
                          
            conn.commit()
            self.send_json_response(200, {"success": True, "new_plan_id": new_plan_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_get_nutrition_plans(self, query_string):
        query_params = urllib.parse.parse_qs(query_string)
        user_id = query_params.get("user_id")
        
        if not user_id:
            self.send_error_response(400, "user_id is required.")
            return
            
        user_id = int(user_id[0])
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM nutrition_plans WHERE user_id = ?", (user_id,))
            plans = [dict(row) for row in cursor.fetchall()]
            
            for plan in plans:
                cursor.execute("SELECT * FROM meals WHERE nutrition_plan_id = ? ORDER BY order_index ASC", (plan['id'],))
                plan['meals'] = [dict(row) for row in cursor.fetchall()]
                for meal in plan['meals']:
                    cursor.execute("SELECT * FROM meal_items WHERE meal_id = ?", (meal['id'],))
                    meal_items = []
                    for row in cursor.fetchall():
                        item = dict(row)
                        if item.get("custom_data"):
                            try:
                                item["custom_data"] = json.loads(item["custom_data"])
                            except Exception:
                                pass
                        meal_items.append(item)
                    meal['items'] = meal_items
                    
            self.send_json_response(200, plans)
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})
        finally:
            conn.close()

    def handle_update_nutrition_plan(self, data):
        plan_id = data.get("id")
        if not plan_id:
            self.send_error_response(400, "El ID del plan es requerido.")
            return

        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                UPDATE nutrition_plans SET 
                    title = ?, description = ?, start_date = ?, end_date = ?, 
                    target_calories = ?, target_protein = ?, target_carbs = ?, target_fat = ?
                WHERE id = ?
            """, (data.get("title"), data.get("description"), data.get("start_date"), data.get("end_date"),
                  data.get("target_calories"), data.get("target_protein"), data.get("target_carbs"), data.get("target_fat"), plan_id))
            
            if "meals" in data:
                cursor.execute("DELETE FROM meals WHERE nutrition_plan_id = ?", (plan_id,))
                for meal in data["meals"]:
                    cursor.execute("INSERT INTO meals (nutrition_plan_id, meal_name, order_index) VALUES (?, ?, ?)", 
                        (plan_id, meal.get("meal_name", "Comida"), meal.get("order_index", 1)))
                    meal_id = cursor.lastrowid
                    
                    for item in meal.get("items", []):
                        custom_data_val = item.get("custom_data")
                        if isinstance(custom_data_val, (dict, list)):
                            custom_data_val = json.dumps(custom_data_val)
                        cursor.execute("""
                            INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes, custom_data)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (meal_id, item.get("food_name"), item.get("weight_g", 0), item.get("calories_kcal", 0),
                              item.get("protein_g", 0), item.get("carbs_g", 0), item.get("fat_g", 0), item.get("notes", ""), custom_data_val))
            
            conn.commit()
            self.send_json_response(200, {"success": True, "message": "Plan de nutrición actualizado."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_delete_nutrition_plan(self, data):
        plan_id = data.get("id")
        if not plan_id:
            self.send_error_response(400, "El ID del plan es requerido.")
            return

        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM nutrition_plans WHERE id = ?", (plan_id,))
            conn.commit()
            self.send_json_response(200, {"success": True, "message": "Plan de nutrición eliminado."})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    # --- Assessment Config Handlers ---
    
    def handle_get_assessment_config(self):
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM assessment_config ORDER BY order_index ASC, id ASC")
            configs = [dict(row) for row in cursor.fetchall()]
            self.send_json_response(200, {"success": True, "config": configs})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()
            
    def handle_create_assessment_config(self, data):
        field_name = data.get("field_name")
        field_type = data.get("field_type", "number")
        unit = data.get("unit", "")
        is_default = data.get("is_default", 0)
        db_column = data.get("db_column")
        is_active = data.get("is_active", 1)
        order_index = data.get("order_index", 0)
        
        if not field_name:
            self.send_json_response(400, {"success": False, "error": "field_name is required"})
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO assessment_config (field_name, field_type, unit, is_default, db_column, is_active, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (field_name, field_type, unit, is_default, db_column, is_active, order_index))
            conn.commit()
            new_id = cursor.lastrowid
            self.send_json_response(200, {"success": True, "id": new_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_update_assessment_config(self, data):
        config_id = data.get("id")
        if not config_id:
            self.send_json_response(400, {"success": False, "error": "Config ID is required"})
            return
            
        field_name = data.get("field_name")
        field_type = data.get("field_type")
        unit = data.get("unit")
        is_active = data.get("is_active")
        order_index = data.get("order_index")
        
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            updates = []
            params = []
            if field_name is not None:
                updates.append("field_name = ?")
                params.append(field_name)
            if field_type is not None:
                updates.append("field_type = ?")
                params.append(field_type)
            if unit is not None:
                updates.append("unit = ?")
                params.append(unit)
            if is_active is not None:
                updates.append("is_active = ?")
                params.append(is_active)
            if order_index is not None:
                updates.append("order_index = ?")
                params.append(order_index)
                
            if not updates:
                self.send_json_response(200, {"success": True, "message": "Nothing to update"})
                return
                
            params.append(config_id)
            query = "UPDATE assessment_config SET " + ", ".join(updates) + " WHERE id = ?"
            cursor.execute(query, params)
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()
            
    def handle_delete_assessment_config(self, data):
        config_id = data.get("id")
        if not config_id:
            self.send_json_response(400, {"success": False, "error": "Config ID is required"})
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM assessment_config WHERE id = ? AND is_default = 0", (config_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    # --- Nutrition Config Handlers ---
    
    def handle_get_nutrition_config(self):
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM nutrition_config ORDER BY order_index ASC, id ASC")
            configs = [dict(row) for row in cursor.fetchall()]
            self.send_json_response(200, {"success": True, "config": configs})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()
            
    def handle_get_foods(self):
        conn = self.get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM food_library ORDER BY name ASC")
            foods = []
            for row in cursor.fetchall():
                item = dict(row)
                if item.get("custom_data"):
                    try:
                        item["custom_data"] = json.loads(item["custom_data"])
                    except:
                        item["custom_data"] = {}
                else:
                    item["custom_data"] = {}
                foods.append(item)
            self.send_json_response(200, {"success": True, "foods": foods})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()
            
    def handle_create_food(self, data):
        name = data.get("name")
        weight_g = float(data.get("weight_g", 100.0))
        calories_kcal = int(data.get("calories_kcal", 0))
        protein_g = float(data.get("protein_g", 0.0))
        carbs_g = float(data.get("carbs_g", 0.0))
        fat_g = float(data.get("fat_g", 0.0))
        custom_data = data.get("custom_data", {})
        
        if not name:
            self.send_json_response(400, {"success": False, "error": "name is required"})
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO food_library (name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, custom_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, json.dumps(custom_data) if custom_data else None))
            conn.commit()
            new_id = cursor.lastrowid
            self.send_json_response(200, {"success": True, "id": new_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_update_food(self, data):
        food_id = data.get("id")
        if not food_id:
            self.send_json_response(400, {"success": False, "error": "Food ID is required"})
            return
            
        name = data.get("name")
        weight_g = data.get("weight_g")
        calories_kcal = data.get("calories_kcal")
        protein_g = data.get("protein_g")
        carbs_g = data.get("carbs_g")
        fat_g = data.get("fat_g")
        custom_data = data.get("custom_data")
        
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            updates = []
            params = []
            if name is not None:
                updates.append("name = ?")
                params.append(name)
            if weight_g is not None:
                updates.append("weight_g = ?")
                params.append(float(weight_g))
            if calories_kcal is not None:
                updates.append("calories_kcal = ?")
                params.append(int(calories_kcal))
            if protein_g is not None:
                updates.append("protein_g = ?")
                params.append(float(protein_g))
            if carbs_g is not None:
                updates.append("carbs_g = ?")
                params.append(float(carbs_g))
            if fat_g is not None:
                updates.append("fat_g = ?")
                params.append(float(fat_g))
            if custom_data is not None:
                updates.append("custom_data = ?")
                params.append(json.dumps(custom_data) if custom_data else None)
                
            if not updates:
                self.send_json_response(200, {"success": True, "message": "Nothing to update"})
                return
                
            params.append(food_id)
            query = "UPDATE food_library SET " + ", ".join(updates) + " WHERE id = ?"
            cursor.execute(query, params)
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_delete_food(self, data):
        food_id = data.get("id")
        if not food_id:
            self.send_json_response(400, {"success": False, "error": "Food ID is required"})
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM food_library WHERE id = ?", (food_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()
            
    def handle_create_nutrition_config(self, data):
        field_name = data.get("field_name")
        field_type = data.get("field_type", "number")
        unit = data.get("unit", "")
        is_default = data.get("is_default", 0)
        db_column = data.get("db_column")
        is_active = data.get("is_active", 1)
        order_index = data.get("order_index", 0)
        
        if not field_name:
            self.send_json_response(400, {"success": False, "error": "field_name is required"})
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO nutrition_config (field_name, field_type, unit, is_default, db_column, is_active, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (field_name, field_type, unit, is_default, db_column, is_active, order_index))
            conn.commit()
            new_id = cursor.lastrowid
            self.send_json_response(200, {"success": True, "id": new_id})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

    def handle_update_nutrition_config(self, data):
        config_id = data.get("id")
        if not config_id:
            self.send_json_response(400, {"success": False, "error": "Config ID is required"})
            return
            
        field_name = data.get("field_name")
        field_type = data.get("field_type")
        unit = data.get("unit")
        is_active = data.get("is_active")
        order_index = data.get("order_index")
        
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            updates = []
            params = []
            if field_name is not None:
                updates.append("field_name = ?")
                params.append(field_name)
            if field_type is not None:
                updates.append("field_type = ?")
                params.append(field_type)
            if unit is not None:
                updates.append("unit = ?")
                params.append(unit)
            if is_active is not None:
                updates.append("is_active = ?")
                params.append(is_active)
            if order_index is not None:
                updates.append("order_index = ?")
                params.append(order_index)
                
            if not updates:
                self.send_json_response(200, {"success": True, "message": "Nothing to update"})
                return
                
            params.append(config_id)
            query = "UPDATE nutrition_config SET " + ", ".join(updates) + " WHERE id = ?"
            cursor.execute(query, params)
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()
            
    def handle_delete_nutrition_config(self, data):
        config_id = data.get("id")
        if not config_id:
            self.send_json_response(400, {"success": False, "error": "Config ID is required"})
            return
            
        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM nutrition_config WHERE id = ? AND is_default = 0", (config_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"success": False, "error": str(e)})
        finally:
            conn.close()

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_master_db()
    migrate_existing_db_to_admin_tenant()
    yield

app = FastAPI(lifespan=lifespan)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start_time = time.time()
    response = None
    error_msg = ""
    try:
        response = await call_next(request)
    except Exception as e:
        import traceback
        error_msg = f"EXCEPTION: {str(e)}\n{traceback.format_exc()}"
        raise e
    finally:
        process_time = (time.time() - start_time) * 1000
        status_code = response.status_code if response else 500
        log_line = f"{get_colombia_now()} | {request.method} | {request.url.path} | Query: {request.url.query} | Status: {status_code} | Time: {process_time:.2f}ms\n"
        if error_msg:
            log_line += f"{error_msg}\n"
        try:
            with open(os.path.join(BASE_DIR, "server_requests.log"), "a", encoding="utf-8") as f:
                f.write(log_line)
        except Exception:
            pass
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def make_api_response(handler: FitnessHTTPRequestHandler):
    return Response(
        content=handler.wfile.data,
        status_code=handler._status_code,
        media_type=handler._content_type
    )

# --- POST Endpoints ---

@app.post("/api/auth")
async def api_auth(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_auth(data)
    return make_api_response(handler)

@app.post("/api/auth/register")
async def api_auth_register(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_register_trainer(data)
    return make_api_response(handler)

@app.post("/api/admin/reset_password")
async def api_admin_reset_password(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    if not handler.verify_jwt():
        return make_api_response(handler)
    handler.handle_admin_reset_password(data)
    return make_api_response(handler)

@app.post("/api/admin/verify")
async def api_admin_verify(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_admin_verify(data)
    return make_api_response(handler)

@app.post("/api/admin/trainers")
async def api_admin_create_trainer(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_admin_create_trainer(data)
    return make_api_response(handler)

@app.post("/api/clients")
async def api_create_client(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_client(data)
    return make_api_response(handler)

@app.post("/api/daily_logs")
async def api_create_daily_log(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_daily_log(data)
    return make_api_response(handler)

@app.post("/api/exercises")
async def api_create_exercise(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_exercise(data)
    return make_api_response(handler)

@app.post("/api/workout_blocks")
async def api_create_workout_block(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_workout_block(data)
    return make_api_response(handler)

@app.post("/api/routines")
async def api_create_routine(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_routine(data)
    return make_api_response(handler)

@app.post("/api/routines/assign")
async def api_assign_routine(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_assign_routine(data)
    return make_api_response(handler)

@app.post("/api/nutrition_plans")
async def api_create_nutrition_plan(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_nutrition_plan(data)
    return make_api_response(handler)

@app.post("/api/nutrition_plans/assign")
async def api_assign_nutrition_plan(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_assign_nutrition_plan(data)
    return make_api_response(handler)

@app.post("/api/assessment_config")
async def api_create_assessment_config(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_assessment_config(data)
    return make_api_response(handler)

@app.post("/api/nutrition_config")
async def api_create_nutrition_config(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_nutrition_config(data)
    return make_api_response(handler)

@app.post("/api/foods")
async def api_create_food(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_food(data)
    return make_api_response(handler)

@app.post("/api/assessments")
async def api_create_assessment(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_create_assessment(data)
    return make_api_response(handler)

# --- PUT Endpoints ---

@app.put("/api/exercises")
async def api_update_exercise(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_exercise(data)
    return make_api_response(handler)

@app.put("/api/workout_blocks")
async def api_update_workout_block(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_block(data)
    return make_api_response(handler)

@app.put("/api/routines")
async def api_update_routine(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_routine(data)
    return make_api_response(handler)

@app.put("/api/clients")
async def api_update_client(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_client(data)
    return make_api_response(handler)

@app.put("/api/admin/trainers")
async def api_admin_update_trainer(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_admin_update_trainer(data)
    return make_api_response(handler)

@app.put("/api/nutrition_plans")
async def api_update_nutrition_plan(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_nutrition_plan(data)
    return make_api_response(handler)

@app.put("/api/assessment_config")
async def api_update_assessment_config(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_assessment_config(data)
    return make_api_response(handler)

@app.put("/api/nutrition_config")
async def api_update_nutrition_config(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_nutrition_config(data)
    return make_api_response(handler)

@app.put("/api/foods")
async def api_update_food(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_update_food(data)
    return make_api_response(handler)

async def get_delete_data(request: Request):
    val_id = request.query_params.get("id")
    if val_id:
        try:
            val_id = int(val_id)
        except ValueError:
            pass
        return {"id": val_id}
    try:
        return await request.json()
    except Exception:
        return {}

# --- DELETE Endpoints ---

@app.delete("/api/assessments")
async def api_delete_assessment(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_assessment(data)
    return make_api_response(handler)

@app.delete("/api/exercises")
async def api_delete_exercise(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_exercise(data)
    return make_api_response(handler)

@app.delete("/api/workout_blocks")
async def api_delete_workout_block(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_block(data)
    return make_api_response(handler)

@app.delete("/api/routines")
async def api_delete_routine(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_routine(data)
    return make_api_response(handler)

@app.delete("/api/clients")
async def api_delete_client(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_client(data)
    return make_api_response(handler)

@app.delete("/api/admin/trainers")
async def api_admin_delete_trainer(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_admin_delete_trainer(data)
    return make_api_response(handler)

@app.delete("/api/nutrition_plans")
async def api_delete_nutrition_plan(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_nutrition_plan(data)
    return make_api_response(handler)

@app.delete("/api/assessment_config")
async def api_delete_assessment_config(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_assessment_config(data)
    return make_api_response(handler)

@app.delete("/api/nutrition_config")
async def api_delete_nutrition_config(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_nutrition_config(data)
    return make_api_response(handler)

@app.delete("/api/foods")
async def api_delete_food(request: Request):
    data = await get_delete_data(request)
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_delete_food(data)
    return make_api_response(handler)

# --- GET Endpoints ---

@app.get("/api/clients")
async def api_get_clients(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_clients()
    return make_api_response(handler)

@app.get("/api/clients/{user_id}")
async def api_get_client_detail(user_id: int, request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_client_detail(user_id)
    return make_api_response(handler)

@app.get("/api/exercises")
async def api_get_exercises(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_exercises()
    return make_api_response(handler)

@app.get("/api/workout_blocks")
async def api_get_workout_blocks(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_workout_blocks()
    return make_api_response(handler)

@app.get("/api/routines")
async def api_get_routines(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_routines()
    return make_api_response(handler)

@app.get("/api/nutrition_plans")
async def api_get_nutrition_plans(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_nutrition_plans(request.url.query)
    return make_api_response(handler)

@app.get("/api/daily_logs/calendar")
async def api_get_daily_calendar(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_daily_calendar(request.url.query)
    return make_api_response(handler)

@app.get("/api/public/all_clients")
async def api_get_public_all_clients():
    conn = sqlite3.connect(MASTER_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    trainers = []
    try:
        cursor.execute("SELECT nickname, name, theme_color, logo_url FROM trainers ORDER BY id ASC")
        trainer_rows = cursor.fetchall()
        for r in trainer_rows:
            nickname = r["nickname"]
            is_online = (nickname, 0) in chat_manager.active_connections
            trainers.append({
                "nickname": nickname,
                "name": r["name"],
                "theme_color": r["theme_color"] or "#f3ca4c",
                "logo_url": r["logo_url"],
                "is_online": is_online
            })
    except Exception as e:
        print("Error fetching trainers for public view:", e)
        trainers = [{"nickname": "admin", "name": "Admin", "theme_color": "#f3ca4c", "logo_url": "", "is_online": False}]
    finally:
        conn.close()

    all_clients = []
    for t in trainers:
        trainer_nickname = t["nickname"]
        trainer_name = t["name"]
        db_path = get_tenant_db_path(trainer_nickname)
        if not os.path.exists(db_path):
            continue
        try:
            t_conn = sqlite3.connect(db_path)
            t_conn.row_factory = sqlite3.Row
            t_cursor = t_conn.cursor()
            t_cursor.execute("SELECT id, first_name, last_name, email, nickname FROM users WHERE id != 0 ORDER BY id ASC")
            rows = t_cursor.fetchall()
            for r in rows:
                client = dict(r)
                client["trainer_id"] = trainer_nickname
                client["trainer_name"] = trainer_name
                # Calculate compliance KPI based on daily logs in the last 30 days
                t_cursor.execute("""
                    SELECT COUNT(DISTINCT date) as log_count 
                    FROM daily_logs 
                    WHERE user_id = ? AND date >= date('now', '-30 days')
                """, (client['id'],))
                res = t_cursor.fetchone()
                log_count = res['log_count'] if res and res['log_count'] else 0
                client['adherence_score'] = min(10.0, (log_count / 30.0) * 10.0)
                client["is_online"] = (trainer_nickname, client["id"]) in chat_manager.active_connections
                all_clients.append(client)
            t_conn.close()
        except Exception as e:
            print(f"Error fetching clients for trainer '{trainer_nickname}':", e)
            
    return JSONResponse(content={"success": True, "trainers": trainers, "clients": all_clients})

@app.get("/api/admin/download_backup")
async def api_download_backup(passcode: str = None):
    import tempfile
    import zipfile
    from fastapi import BackgroundTasks
    
    if passcode != "dev123":
        return JSONResponse(status_code=401, content={"success": False, "error": "No autorizado."})
    
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_path = tmp.name
    tmp.close()
    
    try:
        with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            if os.path.exists(MASTER_DB_PATH):
                zip_file.write(MASTER_DB_PATH, "master.db")
            if os.path.exists(TENANTS_DIR):
                for root, dirs, files in os.walk(TENANTS_DIR):
                    for file in files:
                        if file.endswith(".db"):
                            file_path = os.path.join(root, file)
                            arcname = os.path.join("tenants", file)
                            zip_file.write(file_path, arcname)
                            
        # Clean up temp file in background after download completes
        def remove_temp():
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
                
        bg_tasks = BackgroundTasks()
        bg_tasks.add_task(remove_temp)
        
        return FileResponse(tmp_path, media_type="application/zip", filename="elite_fitness_backup.zip", background=bg_tasks)
    except Exception as e:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/admin/restore_backup")
async def api_restore_backup(request: Request, passcode: str = None):
    import zipfile
    import tempfile
    import shutil
    
    if passcode != "dev123":
        return JSONResponse(status_code=401, content={"success": False, "error": "No autorizado."})
        
    try:
        form = await request.form()
        file = form.get("file")
        if not file:
            return JSONResponse(status_code=400, content={"success": False, "error": "Archivo faltante."})
            
        contents = await file.read()
        
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
        tmp_path = tmp.name
        tmp.write(contents)
        tmp.close()
        
        with zipfile.ZipFile(tmp_path, 'r') as zip_ref:
            temp_dir = tempfile.mkdtemp()
            zip_ref.extractall(temp_dir)
            
            # 1. Restore master.db
            temp_master = os.path.join(temp_dir, "master.db")
            if os.path.exists(temp_master):
                shutil.copy2(temp_master, MASTER_DB_PATH)
                
            # 2. Restore tenants databases
            temp_tenants = os.path.join(temp_dir, "tenants")
            if os.path.exists(temp_tenants):
                for f in os.listdir(temp_tenants):
                    if f.endswith(".db"):
                        src_path = os.path.join(temp_tenants, f)
                        dst_path = os.path.join(TENANTS_DIR, f)
                        shutil.copy2(src_path, dst_path)
                        
            shutil.rmtree(temp_dir)
            
        os.unlink(tmp_path)
        return JSONResponse(content={"success": True, "message": "Respaldo restaurado con éxito."})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/trainer/config")
async def api_get_trainer_config(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_trainer_config()
    return make_api_response(handler)

@app.get("/api/admin/trainers")
async def api_admin_get_trainers(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_admin_get_trainers()
    return make_api_response(handler)

@app.get("/api/assessment_config")
async def api_get_assessment_config(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_assessment_config()
    return make_api_response(handler)

@app.get("/api/nutrition_config")
async def api_get_nutrition_config(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_nutrition_config()
    return make_api_response(handler)

@app.get("/api/foods")
async def api_get_foods(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    handler.handle_get_foods()
    return make_api_response(handler)

# --- Chat SQLite Helpers ---

def save_chat_message(trainer: str, sender_id: int, receiver_id: int, message_text: str) -> int:
    db_path = get_tenant_db_path(trainer)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO chat_messages (sender_id, receiver_id, message, is_read, created_at)
            VALUES (?, ?, ?, 0, ?)
        """, (sender_id, receiver_id, message_text, get_colombia_now().isoformat()))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def get_chat_history(trainer: str, user_id: int, other_id: int, limit: int = 30, offset: int = 0):
    db_path = get_tenant_db_path(trainer)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, sender_id, receiver_id, message, is_read, created_at
            FROM chat_messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY id DESC
            LIMIT ? OFFSET ?
        """, (user_id, other_id, other_id, user_id, limit, offset))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "sender_id": r["sender_id"],
                "receiver_id": r["receiver_id"],
                "message": r["message"],
                "is_read": bool(r["is_read"]),
                "created_at": r["created_at"]
            })
        result.reverse()
        return result
    finally:
        conn.close()

def mark_messages_as_read(trainer: str, other_id: int, user_id: int):
    db_path = get_tenant_db_path(trainer)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE chat_messages
            SET is_read = 1
            WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
        """, (other_id, user_id))
        conn.commit()
    finally:
        conn.close()

# --- Chat Connection Manager ---

class ChatConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, trainer: str, user_id: int):
        await websocket.accept()
        self.active_connections[(trainer, user_id)] = websocket

    def disconnect(self, trainer: str, user_id: int):
        self.active_connections.pop((trainer, user_id), None)

    async def send_personal_message(self, message: dict, trainer: str, user_id: int):
        websocket = self.active_connections.get((trainer, user_id))
        if websocket:
            try:
                await websocket.send_json(message)
                return True
            except Exception:
                self.disconnect(trainer, user_id)
        return False

chat_manager = ChatConnectionManager()

# --- Chat WebSocket Endpoint ---

@app.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket, trainer: str, userId: int, token: str = None):
    trainer = trainer.strip().lower()
    if token:
        try:
            jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except Exception:
            print("WS Chat: invalid token provided")
            
    await chat_manager.connect(websocket, trainer, userId)
    
    # Notify presence upon connection
    if userId != 0:
        # Client connected. Notify trainer if online, and tell client if trainer is online.
        trainer_online = (trainer, 0) in chat_manager.active_connections
        if trainer_online:
            await chat_manager.send_personal_message({"type": "presence", "user_id": 0, "status": "online"}, trainer, userId)
            await chat_manager.send_personal_message({"type": "presence", "user_id": userId, "status": "online"}, trainer, 0)
        else:
            await chat_manager.send_personal_message({"type": "presence", "user_id": 0, "status": "offline"}, trainer, userId)
    else:
        # Trainer connected. Notify all online clients of this trainer, and notify trainer of online clients.
        for (t, u_id) in list(chat_manager.active_connections.keys()):
            if t == trainer and u_id != 0:
                await chat_manager.send_personal_message({"type": "presence", "user_id": 0, "status": "online"}, trainer, u_id)
                await chat_manager.send_personal_message({"type": "presence", "user_id": u_id, "status": "online"}, trainer, 0)
                
    try:
        while True:
            data = await websocket.receive_json()
            receiver_id = int(data.get("receiver_id"))
            message_text = data.get("message")
            
            if message_text:
                msg_id = save_chat_message(trainer, userId, receiver_id, message_text)
                
                payload = {
                    "id": msg_id,
                    "sender_id": userId,
                    "receiver_id": receiver_id,
                    "message": message_text,
                    "is_read": False,
                    "created_at": get_colombia_now().isoformat()
                }
                
                delivered = await chat_manager.send_personal_message(payload, trainer, receiver_id)
                
                await websocket.send_json({
                    "type": "receipt",
                    "id": msg_id,
                    "receiver_id": receiver_id,
                    "delivered": delivered
                })
    except WebSocketDisconnect:
        chat_manager.disconnect(trainer, userId)
        # Notify offline status on disconnect
        if userId != 0:
            await chat_manager.send_personal_message({"type": "presence", "user_id": userId, "status": "offline"}, trainer, 0)
        else:
            for (t, u_id) in list(chat_manager.active_connections.keys()):
                if t == trainer and u_id != 0:
                    await chat_manager.send_personal_message({"type": "presence", "user_id": 0, "status": "offline"}, trainer, u_id)
    except Exception as e:
        print("WS Chat Exception:", e)
        chat_manager.disconnect(trainer, userId)
        if userId != 0:
            await chat_manager.send_personal_message({"type": "presence", "user_id": userId, "status": "offline"}, trainer, 0)
        else:
            for (t, u_id) in list(chat_manager.active_connections.keys()):
                if t == trainer and u_id != 0:
                    await chat_manager.send_personal_message({"type": "presence", "user_id": 0, "status": "offline"}, trainer, u_id)

# --- Chat REST Endpoints ---

@app.get("/api/chat/history")
async def api_get_chat_history(request: Request, userId: int, otherId: int, limit: int = 30, offset: int = 0):
    handler = FitnessHTTPRequestHandler(request)
    trainer = handler.get_request_trainer()
    
    try:
        history = get_chat_history(trainer, userId, otherId, limit, offset)
        return JSONResponse(content={"success": True, "messages": history})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/chat/read")
async def api_mark_chat_read(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    trainer = handler.get_request_trainer()
    
    try:
        data = await request.json()
        sender_id = int(data.get("sender_id"))
        receiver_id = int(data.get("receiver_id"))
        
        mark_messages_as_read(trainer, sender_id, receiver_id)
        
        await chat_manager.send_personal_message({
            "type": "read_receipt",
            "sender_id": sender_id,
            "receiver_id": receiver_id
        }, trainer, sender_id)
        
        return JSONResponse(content={"success": True})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/chat/send")
async def api_send_chat_message_fallback(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    trainer = handler.get_request_trainer()
    
    try:
        data = await request.json()
        sender_id = int(data.get("sender_id"))
        receiver_id = int(data.get("receiver_id"))
        message_text = data.get("message", "").strip()
        
        if not message_text:
            return JSONResponse(status_code=400, content={"success": False, "error": "Empty message"})
            
        msg_id = save_chat_message(trainer, sender_id, receiver_id, message_text)
        
        payload = {
            "id": msg_id,
            "sender_id": sender_id,
            "receiver_id": receiver_id,
            "message": message_text,
            "is_read": False,
            "created_at": get_colombia_now().isoformat()
        }
        
        await chat_manager.send_personal_message(payload, trainer, receiver_id)
        
        receipt = {
            "type": "receipt",
            "id": msg_id,
            "sender_id": sender_id,
            "receiver_id": receiver_id,
            "delivered": True
        }
        await chat_manager.send_personal_message(receipt, trainer, sender_id)
        
        return JSONResponse(content={"success": True, "message_id": msg_id})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/chat/unread_counts")
async def api_get_chat_unread_counts(request: Request):
    handler = FitnessHTTPRequestHandler(request)
    trainer = handler.get_request_trainer()
    
    db_path = get_tenant_db_path(trainer)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT sender_id, COUNT(*) as count
            FROM chat_messages
            WHERE receiver_id = 0 AND is_read = 0
            GROUP BY sender_id
        """)
        rows = cursor.fetchall()
        counts = {r["sender_id"]: r["count"] for r in rows}
        return JSONResponse(content={"success": True, "unread_counts": counts})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
    finally:
        conn.close()

# --- UI HTML Views ---

@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/index.html", methods=["GET", "HEAD"])
async def read_root():
    return FileResponse(os.path.join(BASE_DIR, "web", "index.html"), media_type="text/html")

@app.api_route("/admin", methods=["GET", "HEAD"])
@app.api_route("/admin/", methods=["GET", "HEAD"])
async def read_admin():
    return FileResponse(os.path.join(BASE_DIR, "web", "admin", "index.html"), media_type="text/html")

@app.api_route("/trainer", methods=["GET", "HEAD"])
@app.api_route("/trainer/", methods=["GET", "HEAD"])
async def read_trainer():
    return FileResponse(os.path.join(BASE_DIR, "web", "trainer", "index.html"), media_type="text/html")

@app.api_route("/client", methods=["GET", "HEAD"])
@app.api_route("/client/", methods=["GET", "HEAD"])
async def read_client():
    return FileResponse(os.path.join(BASE_DIR, "web", "client", "client.html"), media_type="text/html")

# --- Static Files Mount ---

app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "web")), name="web")

if __name__ == "__main__":
    import uvicorn
    print(f"Elite Fitness Local Server running on: http://localhost:{PORT}/")
    print("Master Page & Router: http://localhost:8080/")
    print("Trainer Dashboard: http://localhost:8080/trainer/")
    print("Client Dashboard: http://localhost:8080/client/?userId=1")
    uvicorn.run(app, host="0.0.0.0", port=PORT)

