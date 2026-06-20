import http.server
import socketserver
import json
import sqlite3
import os
import urllib.parse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 8080))

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
            VALUES ('Elite Coach Admin', 'admin', 'admin@elitecoach.local', 'admin', '#f3ca4c')
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
    cursor = conn.cursor()
    try:
        cursor.executescript(schema_sql)
        conn.commit()
        
        # System User (ID 0) for templates
        cursor.execute("SELECT id FROM users WHERE id = 0")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO users (id, first_name, last_name, email, height_cm, nickname, password)
                VALUES (0, 'Sistema', 'Plantillas', 'sistema@elitecoach.local', 0, 'sistema', '123456')
            """)
            conn.commit()
            
        # Seed default exercises
        cursor.execute("SELECT id FROM exercises")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO exercises (id, name, description, routine_class, primary_muscle, equipment)
                VALUES 
                (1, 'Flexiones de Pecho (Pushups)', 'Ejercicio de empuje básico para pectoral y tríceps.', 'Fullbody', 'Pectoral', 'Ninguno'),
                (2, 'Sentadillas Libres (Squats)', 'Ejercicio básico de empuje de pierna enfocado en cuádriceps.', 'Fullbody', 'Cuádriceps', 'Ninguno')
            """)
            conn.commit()
            
        print(f"Tenant database '{trainer_nickname}' initialized successfully.")
    except Exception as e:
        print(f"Error initializing tenant database for '{trainer_nickname}': {e}")
    finally:
        conn.close()

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
                new_pass = "123456"
                
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
                VALUES (0, 'Sistema', 'Plantillas', 'sistema@elitecoach.local', 0, 'sistema', '123456')
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



class FitnessHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Override to suppress default console spam
        pass

    def get_request_trainer(self):
        # 1. Check custom header X-Trainer-Id
        trainer_id = self.headers.get('X-Trainer-Id')
        if trainer_id:
            return trainer_id.strip().lower()
            
        # 2. Check query parameter 'trainer'
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        trainer_param = query_params.get("trainer")
        if trainer_param:
            return trainer_param[0].strip().lower()
            
        return "admin"

    def get_db_connection(self):
        trainer = self.get_request_trainer()
        db_path = get_tenant_db_path(trainer)
        return sqlite3.connect(db_path)

    def end_headers(self):
        # Allow cross-origin requests for testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        # Route API queries
        if path == "/api/clients":
            self.handle_get_clients()
        elif path.startswith("/api/clients/"):
            try:
                user_id = int(path.split("/")[-1])
                self.handle_get_client_detail(user_id)
            except ValueError:
                self.send_error_response(400, "Invalid Client ID format.")
        elif path == "/api/exercises":
            self.handle_get_exercises()
        elif path == "/api/workout_blocks":
            self.handle_get_workout_blocks()
        elif path == "/api/routines":
            self.handle_get_routines()
        elif path == "/api/nutrition_plans":
            self.handle_get_nutrition_plans(parsed_url.query)
        elif path == "/api/daily_logs/calendar":
            self.handle_get_daily_calendar(parsed_url.query)
        elif path == "/api/trainer/config":
            self.handle_get_trainer_config()
        elif path == "/api/admin/trainers":
            self.handle_admin_get_trainers()
        elif path == "/api/assessment_config":
            self.handle_get_assessment_config()
        
        # Route Web Dashboards
        elif path == "/" or path == "/index.html":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "index.html"), "text/html")
        elif path == "/admin" or path == "/admin/":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "admin", "index.html"), "text/html")
        elif path == "/trainer" or path == "/trainer/":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "trainer", "index.html"), "text/html")
        elif path == "/client" or path == "/client/":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "client", "client.html"), "text/html")
        elif path == "/shared/style.css":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "shared", "style.css"), "text/css")
        elif path == "/trainer/trainer.js":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "trainer", "trainer.js"), "application/javascript")
        elif path == "/client/client.js":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "client", "client.js"), "application/javascript")
        elif path == "/manifest.json":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "manifest.json"), "application/json")
        elif path == "/service-worker.js":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "service-worker.js"), "application/javascript")
        elif path.startswith("/icons/"):
            filename = path.split("/")[-1]
            self.serve_local_file(os.path.join(BASE_DIR, "web", "icons", filename), "image/png")
        else:
            # Try serving normal static files
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        try:
            data = json.loads(post_data.decode('utf-8'))
        except json.JSONDecodeError:
            self.send_error_response(400, "Malformed JSON payload.")
            return

        if path == "/api/auth":
            self.handle_auth(data)
        elif path == "/api/auth/register":
            self.handle_register_trainer(data)
        elif path == "/api/admin/verify":
            self.handle_admin_verify(data)
        elif path == "/api/admin/trainers":
            self.handle_admin_create_trainer(data)
        elif path == "/api/clients":
            self.handle_create_client(data)
        elif path == "/api/auth/login":
            self.handle_login(data)
        elif path == "/api/daily_logs":
            self.handle_create_daily_log(data)
        elif path == "/api/exercises":
            self.handle_create_exercise(data)
        elif path == "/api/workout_blocks":
            self.handle_create_workout_block(data)
        elif path == "/api/routines":
            self.handle_create_routine(data)
        elif path == "/api/routines/assign":
            self.handle_assign_routine(data)
        elif path == "/api/nutrition_plans":
            self.handle_create_nutrition_plan(data)
        elif path == "/api/nutrition_plans/assign":
            self.handle_assign_nutrition_plan(data)
        elif path == "/api/assessment_config":
            self.handle_create_assessment_config(data)
        else:
            self.send_error_response(404, "Endpoint not found.")

    def do_PUT(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        try:
            data = json.loads(post_data.decode('utf-8'))
        except json.JSONDecodeError:
            self.send_error_response(400, "Malformed JSON payload.")
            return

        if path == "/api/exercises":
            self.handle_update_exercise(data)
        elif path == "/api/workout_blocks":
            self.handle_update_block(data)
        elif path == "/api/routines":
            self.handle_update_routine(data)
        elif path == "/api/clients":
            self.handle_update_client(data)
        elif path == "/api/admin/trainers":
            self.handle_admin_update_trainer(data)
        elif path == "/api/nutrition_plans":
            self.handle_update_nutrition_plan(data)
        elif path == "/api/assessment_config":
            self.handle_update_assessment_config(data)
        else:
            self.send_error_response(404, "Endpoint not found.")

    def do_DELETE(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        try:
            data = json.loads(post_data.decode('utf-8'))
        except json.JSONDecodeError:
            self.send_error_response(400, "Malformed JSON payload.")
            return

        if path == "/api/exercises":
            self.handle_delete_exercise(data)
        elif path == "/api/workout_blocks":
            self.handle_delete_block(data)
        elif path == "/api/routines":
            self.handle_delete_routine(data)
        elif path == "/api/clients":
            self.handle_delete_client(data)
        elif path == "/api/admin/trainers":
            self.handle_admin_delete_trainer(data)
        elif path == "/api/nutrition_plans":
            self.handle_delete_nutrition_plan(data)
        elif path == "/api/assessment_config":
            self.handle_delete_assessment_config(data)
        else:
            self.send_error_response(404, "Endpoint not found.")

    # --- API Handlers ---
    
    def handle_auth(self, data):
        auth_type = data.get("type") # "trainer" or "client"
        nickname = data.get("nickname", "").strip().lower()
        password = data.get("password", "").strip()
        
        if auth_type == "trainer":
            conn = sqlite3.connect(MASTER_DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, theme_color FROM trainers WHERE LOWER(nickname) = ? AND password = ?", (nickname, password))
            row = cursor.fetchone()
            conn.close()
            
            if row:
                self.send_json_response(200, {
                    "success": True, 
                    "type": "trainer",
                    "nickname": nickname,
                    "name": row[1],
                    "themeColor": row[2]
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
            conn = self.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, first_name, last_name FROM users WHERE LOWER(nickname) = ? AND password = ?", (nickname, password))
            row = cursor.fetchone()
            conn.close()
            
            if row:
                self.send_json_response(200, {
                    "success": True, 
                    "type": "client",
                    "userId": row[0],
                    "name": f"{row[1]} {row[2]}"
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
            cursor.execute("""
                INSERT INTO trainers (name, nickname, email, password, theme_color)
                VALUES (?, ?, ?, ?, ?)
            """, (name, nickname, email, password, theme_color))
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
        cursor.execute("SELECT id, first_name, last_name, email, phone FROM users WHERE id != 0 ORDER BY id ASC")
        rows = cursor.fetchall()
        
        clients = []
        for row in rows:
            client = dict(row)
            # Calculate adherence KPI (last 30 days)
            cursor.execute("""
                SELECT AVG(diet_adherence) as avg_adherence 
                FROM daily_logs 
                WHERE user_id = ? AND date >= date('now', '-30 days')
                AND diet_adherence IS NOT NULL
            """, (client['id'],))
            res = cursor.fetchone()
            client['adherence_score'] = res['avg_adherence'] if res and res['avg_adherence'] else 0
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
                meal['items'] = [dict(item) for item in cursor.fetchall()]
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
            cursor.execute("""
                INSERT INTO users (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, password))
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
        weight = float(data.get("weight_kg", 0))
        height = float(data.get("height_cm", 170))
        fc_rep = int(data.get("fc_rep", 60))
        neck = float(data.get("neck", 0))
        chest = float(data.get("chest", 0))
        abdomen = float(data.get("abdomen", 0))
        right_bicep = float(data.get("right_bicep", 0))
        right_thigh = float(data.get("right_thigh", 0))
        
        triceps = float(data.get("triceps", 0))
        scapular = float(data.get("scapular", 0))
        iliac = float(data.get("iliac", 0))
        abdominal = float(data.get("abdominal", 0))
        
        if not user_id or not date:
            self.send_error_response(400, "Missing user_id or date.")
            return
            
        # Faulkner formula for fat %
        fat_pct = (triceps + scapular + iliac + abdominal) * 0.153 + 5.783
        fat_mass = weight * (fat_pct / 100.0)
        lean_mass = weight - fat_mass
        bmi = weight / ((height/100.0) * (height/100.0))
        sum_folds = triceps + scapular + iliac + abdominal
        
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
                    right_bicep, left_bicep, right_forearm, left_forearm
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, date, weight, height, bmi, 195, fc_rep,
                neck, chest, 0.0, abdomen, 0.0, 0.0,
                right_thigh, right_thigh, 0.0, 0.0,
                right_bicep, right_bicep, 0.0, 0.0
            ))
            assessment_id = cursor.lastrowid
            
            cursor.execute("""
                INSERT INTO skinfold_assessments (
                    assessment_id, scapular, triceps, abdominal, iliac,
                    inner_thigh, mid_thigh, medial_calf, chest, biceps,
                    sum_folds, body_fat_percentage, fat_mass_kg, lean_mass_kg
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                assessment_id, scapular, triceps, abdominal, iliac,
                0.0, 0.0, 0.0, 0.0, 0.0,
                sum_folds, fat_pct, fat_mass, lean_mass
            ))
            conn.commit()
            self.send_json_response(200, {"success": True, "assessment_id": assessment_id})
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
        cursor = conn.cursor()
        
        # Read existing log to preserve variables not sent in partial updates
        cursor.execute("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", (user_id, date))
        existing = cursor.fetchone()
        
        # Build merged object
        if existing:
            # columns: id, user_id, date, weight_kg, steps_count, sleep_hours, sleep_quality, water_intake_ml, energy_level, digestion_status, diet_adherence, resting_hr, hrv, notes
            merged = {
                "weight_kg": data.get("weight_kg") if data.get("weight_kg") is not None else existing[3],
                "steps_count": data.get("steps_count") if data.get("steps_count") is not None else existing[4],
                "sleep_hours": data.get("sleep_hours") if data.get("sleep_hours") is not None else existing[5],
                "sleep_quality": data.get("sleep_quality") if data.get("sleep_quality") is not None else existing[6],
                "water_intake_ml": data.get("water_intake_ml") if data.get("water_intake_ml") is not None else existing[7],
                "energy_level": data.get("energy_level") if data.get("energy_level") is not None else existing[8],
                "digestion_status": data.get("digestion_status") if data.get("digestion_status") is not None else existing[9],
                "diet_adherence": data.get("diet_adherence") if data.get("diet_adherence") is not None else existing[10],
                "resting_hr": data.get("resting_hr") if data.get("resting_hr") is not None else existing[11],
                "hrv": data.get("hrv") if data.get("hrv") is not None else existing[12],
                "notes": data.get("notes") if data.get("notes") is not None else existing[13]
            }
            cursor.execute("""
                UPDATE daily_logs SET
                    weight_kg = ?, steps_count = ?, sleep_hours = ?, sleep_quality = ?,
                    water_intake_ml = ?, energy_level = ?, digestion_status = ?,
                    diet_adherence = ?, resting_hr = ?, hrv = ?, notes = ?
                WHERE user_id = ? AND date = ?
            """, (
                merged["weight_kg"], merged["steps_count"], merged["sleep_hours"], merged["sleep_quality"],
                merged["water_intake_ml"], merged["energy_level"], merged["digestion_status"],
                merged["diet_adherence"], merged["resting_hr"], merged["hrv"], merged["notes"],
                user_id, date
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

    # --- Helper Methods ---

    def serve_local_file(self, full_path, content_type):
        if not os.path.exists(full_path):
            self.send_error_response(404, f"File {os.path.basename(full_path)} not found.")
            return
            
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        
        stat = os.stat(full_path)
        self.send_header("Content-Length", str(stat.st_size))
        self.end_headers()
        
        with open(full_path, 'rb') as f:
            self.wfile.write(f.read())

    def send_json_response(self, status_code, body):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        json_bytes = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_header("Content-Length", str(len(json_bytes)))
        self.end_headers()
        self.wfile.write(json_bytes)

    def send_error_response(self, status_code, message):
        self.send_json_response(status_code, {"success": False, "error": message})

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
        first_name = data.get("first_name")
        last_name = data.get("last_name")
        email = data.get("email")
        phone = data.get("phone")
        birthdate = data.get("birthdate")
        height_cm = data.get("height_cm", 170.0)
        blood_type = data.get("blood_type", "O+")
        allergies = data.get("allergies", "Ninguna")
        medications = data.get("medications", "Ninguno")
        nickname = data.get("nickname")
        password = data.get("password")

        if not client_id or not first_name or not last_name or not email:
            self.send_error_response(400, "ID, nombre, apellido y correo son requeridos.")
            return

        conn = self.get_db_connection()
        cursor = conn.cursor()
        try:
            if nickname:
                cursor.execute("SELECT id FROM users WHERE LOWER(nickname) = ? AND id != ?", (nickname.lower(), client_id))
                if cursor.fetchone():
                    self.send_json_response(200, {"success": False, "error": f"El nombre de usuario '{nickname}' ya está registrado."})
                    return
            
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
                    cursor.execute("""
                        INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (meal_id, item.get("food_name"), item.get("weight_g", 0), item.get("calories_kcal", 0),
                          item.get("protein_g", 0), item.get("carbs_g", 0), item.get("fat_g", 0), item.get("notes", "")))
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
                        INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (new_meal_id, i['food_name'], i['weight_g'], i['calories_kcal'],
                          i['protein_g'], i['carbs_g'], i['fat_g'], i['notes']))
                          
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
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM nutrition_plans WHERE user_id = ?", (user_id,))
            plans = [dict(row) for row in cursor.fetchall()]
            
            for plan in plans:
                cursor.execute("SELECT * FROM meals WHERE nutrition_plan_id = ? ORDER BY order_index ASC", (plan['id'],))
                plan['meals'] = [dict(row) for row in cursor.fetchall()]
                for meal in plan['meals']:
                    cursor.execute("SELECT * FROM meal_items WHERE meal_id = ?", (meal['id'],))
                    meal['items'] = [dict(row) for row in cursor.fetchall()]
                    
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
                        cursor.execute("""
                            INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (meal_id, item.get("food_name"), item.get("weight_g", 0), item.get("calories_kcal", 0),
                              item.get("protein_g", 0), item.get("carbs_g", 0), item.get("fat_g", 0), item.get("notes", "")))
            
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

class ThreadingFitnessServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        import sys
        exc_type, exc_value, exc_traceback = sys.exc_info()
        if exc_type in (ConnectionAbortedError, ConnectionResetError, BrokenPipeError) or (exc_type is OSError and exc_value.errno == 10053):
            # Suppress normal disconnect tracebacks to keep console logs clean
            pass
        else:
            super().handle_error(request, client_address)

def run_server():
    init_master_db()
    migrate_existing_db_to_admin_tenant()

    with ThreadingFitnessServer(("", PORT), FitnessHTTPRequestHandler) as httpd:
        print(f"Elite Fitness Local Server running on: http://localhost:{PORT}/")
        print("Master Page & Router: http://localhost:8080/")
        print("Trainer Dashboard: http://localhost:8080/trainer/")
        print("Client Dashboard (Brayan): http://localhost:8080/client/?userId=1")
        print("Client Dashboard (Maria): http://localhost:8080/client/?userId=2")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()

