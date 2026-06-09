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
DB_PATH = os.path.join(PERSISTENT_DIR, "fitness.db")

def check_and_migrate_db():
    print(f"Checking database migration at: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("Database file does not exist yet. It will be initialized by seeding scripts.")
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        # Check columns of users table
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
            
            # Seed default credentials for users if null
            cursor.execute("SELECT id, email, nickname FROM users")
            users = cursor.fetchall()
            for u_id, email, nick in users:
                # Set default nickname as part of email before @
                new_nick = email.split('@')[0].lower()
                new_pass = "123456"
                
                # Check if nickname already exists in database (to be safe)
                cursor.execute("SELECT id FROM users WHERE nickname = ? AND id != ?", (new_nick, u_id))
                if cursor.fetchone():
                    new_nick = f"{new_nick}_{u_id}"
                
                cursor.execute("UPDATE users SET nickname = ?, password = ? WHERE id = ?", (new_nick, new_pass, u_id))
                print(f"  -> User ID {u_id} updated: nickname='{new_nick}', password='{new_pass}'")
            conn.commit()
            print("Default credentials seeded.")
    except Exception as e:
        print("Error during migration:", e)
    finally:
        conn.close()



class FitnessHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Override to suppress default console spam
        pass

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
        
        # Route Web Dashboards
        elif path == "/" or path == "/index.html":
            self.serve_local_file(os.path.join(BASE_DIR, "web", "index.html"), "text/html")
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
        elif path == "/api/clients":
            self.handle_create_client(data)
        elif path == "/api/assessments":
            self.handle_create_assessment(data)
        elif path == "/api/daily_logs":
            self.handle_create_daily_log(data)
        else:
            self.send_error_response(404, "Endpoint not found.")

    # --- API Handlers ---
    
    def handle_auth(self, data):
        auth_type = data.get("type") # "trainer" or "client"
        nickname = data.get("nickname", "").strip().lower()
        password = data.get("password", "").strip()
        
        if auth_type == "trainer":
            if nickname == "admin" and password == "admin":
                self.send_json_response(200, {
                    "success": True, 
                    "type": "trainer"
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
            conn = sqlite3.connect(DB_PATH)
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

    def handle_get_clients(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, first_name, last_name, email, phone FROM users ORDER BY id ASC")
        rows = cursor.fetchall()
        clients = [dict(row) for row in rows]
        conn.close()
        
        self.send_json_response(200, clients)

    def handle_get_client_detail(self, user_id):
        conn = sqlite3.connect(DB_PATH)
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
                # Fetch exercises on this day
                cursor.execute("""
                    SELECT we.*, e.name as exercise_name, e.video_url, e.description
                    FROM workout_exercises we
                    JOIN exercises e ON we.exercise_id = e.id
                    WHERE we.workout_day_id = ?
                    ORDER BY we.order_index ASC
                """, (day['id'],))
                day['exercises'] = [dict(ex) for ex in cursor.fetchall()]
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
            
        conn = sqlite3.connect(DB_PATH)
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
            # Link pushups and squats by default (IDs 1 and 2 from seeded exercises)
            cursor.execute("""
                INSERT INTO workout_exercises (workout_day_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
                VALUES (?, 1, 3, "10-12", 7, 90, "Foco en rango de movimiento completo.", 1)
            """, (day_id,))
            cursor.execute("""
                INSERT INTO workout_exercises (workout_day_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
                VALUES (?, 2, 3, "12-15", 7, 90, "Bajar controlado.", 2)
            """, (day_id,))
            
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
        
        conn = sqlite3.connect(DB_PATH)
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
            
        conn = sqlite3.connect(DB_PATH)
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

def run_server():
    # Auto-initialize and seed the database if it doesn't exist or is empty
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        print("Database not found or empty. Auto-initializing and seeding database...")
        try:
            from scripts.init_db import init_db
            from scripts.parse_and_seed import seed_brayan
            from scripts.seed_details import seed_details
            
            init_db()
            seed_brayan()
            seed_details()
            print("Database initialized and auto-seeded successfully!")
        except Exception as e:
            print("Error during database auto-seeding:", e)

    # Call migration check to ensure columns and default credentials exist
    check_and_migrate_db()

    # Make sure we can bind to port 8080. If already in use, run simple output
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), FitnessHTTPRequestHandler) as httpd:
        print(f"Elite Fitness Local Server running on: http://localhost:{PORT}/")
        print("Master Page & Router: http://localhost:8080/")
        print("Trainer Dashboard: http://localhost:8080/trainer/")
        print("Client Dashboard (Brayan): http://localhost:8080/client/?userId=1")
        print("Client Dashboard (Maria): http://localhost:8080/client/?userId=2")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()
