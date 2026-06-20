import sqlite3
import json
import urllib.request
import urllib.error
import subprocess
import time
import os
import shutil

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSISTENT_DIR = os.environ.get("PERSISTENT_DIR", os.path.join(BASE_DIR, "database"))
MASTER_DB_PATH = os.path.join(PERSISTENT_DIR, "master.db")
TENANTS_DIR = os.path.join(PERSISTENT_DIR, "tenants")

def clean_test_data():
    print("Cleaning up any existing test databases...")
    for coach in ["coach_azul", "coach_rojo"]:
        db_file = os.path.join(TENANTS_DIR, f"trainer_{coach}.db")
        if os.path.exists(db_file):
            try:
                os.remove(db_file)
                print(f"  Removed {db_file}")
            except Exception as e:
                print(f"  Error removing {db_file}: {e}")
                
    if os.path.exists(MASTER_DB_PATH):
        conn = sqlite3.connect(MASTER_DB_PATH)
        c = conn.cursor()
        try:
            c.execute("DELETE FROM trainers WHERE nickname IN ('coach_azul', 'coach_rojo')")
            conn.commit()
            print("  Removed coach_azul and coach_rojo entries from master.db")
        except Exception as e:
            print(f"  Error cleaning master.db: {e}")
        finally:
            conn.close()

def run_tests():
    print("=== STARTING MULTI-TENANCY VERIFICATION TESTS ===")
    
    # Ensure master.db and directories exist before running
    if not os.path.exists(PERSISTENT_DIR):
        os.makedirs(PERSISTENT_DIR)
    if not os.path.exists(TENANTS_DIR):
        os.makedirs(TENANTS_DIR)
        
    clean_test_data()
    
    server_script = os.path.join(BASE_DIR, "server.py")
    print("Starting backend server in background...")
    server_proc = subprocess.Popen(["python", server_script])
    time.sleep(3.0) # wait for server to bind port
    
    try:
        # 1. Register coach_azul
        print("\nTest 1: Registering coach_azul...")
        payload_azul = {
            "name": "Coach Azul",
            "nickname": "coach_azul",
            "email": "azul@coach.com",
            "password": "password123",
            "theme_color": "#3b82f6"
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/auth/register",
            data=json.dumps(payload_azul).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req, timeout=5)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        print("  [PASS] coach_azul registered successfully.")
        
        # 2. Register coach_rojo
        print("\nTest 2: Registering coach_rojo...")
        payload_rojo = {
            "name": "Coach Rojo",
            "nickname": "coach_rojo",
            "email": "rojo@coach.com",
            "password": "password123",
            "theme_color": "#ef4444"
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/auth/register",
            data=json.dumps(payload_rojo).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req, timeout=5)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        print("  [PASS] coach_rojo registered successfully.")
        
        # 3. Verify trainer databases exist
        print("\nTest 3: Checking if isolated SQLite databases were created...")
        db_azul = os.path.join(TENANTS_DIR, "trainer_coach_azul.db")
        db_rojo = os.path.join(TENANTS_DIR, "trainer_coach_rojo.db")
        assert os.path.exists(db_azul), "trainer_coach_azul.db should exist"
        assert os.path.exists(db_rojo), "trainer_coach_rojo.db should exist"
        print("  [PASS] Physical database isolation verified. DB files present.")
        
        # 4. Create client for coach_azul
        print("\nTest 4: Creating client under coach_azul database...")
        client_azul_payload = {
            "first_name": "Cliente",
            "last_name": "Azul",
            "email": "cliente.azul@example.com",
            "phone": "555-BLUE",
            "birthdate": "2000-01-01",
            "height_cm": 175.0
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            data=json.dumps(client_azul_payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Trainer-Id': 'coach_azul'
            }
        )
        res = urllib.request.urlopen(req, timeout=5)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        client_azul_id = res_data['client_id']
        print(f"  [PASS] Cliente Azul created with ID {client_azul_id} in coach_azul DB.")
        
        # 5. Create client for coach_rojo
        print("\nTest 5: Creating client under coach_rojo database...")
        client_rojo_payload = {
            "first_name": "Cliente",
            "last_name": "Rojo",
            "email": "cliente.rojo@example.com",
            "phone": "555-RED",
            "birthdate": "1999-12-31",
            "height_cm": 180.0
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            data=json.dumps(client_rojo_payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Trainer-Id': 'coach_rojo'
            }
        )
        res = urllib.request.urlopen(req, timeout=5)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        client_rojo_id = res_data['client_id']
        print(f"  [PASS] Cliente Rojo created with ID {client_rojo_id} in coach_rojo DB.")
        
        # 6. Query clients as coach_azul
        print("\nTest 6: Querying clients as coach_azul...")
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            headers={'X-Trainer-Id': 'coach_azul'}
        )
        res = urllib.request.urlopen(req, timeout=5)
        clients = json.loads(res.read().decode('utf-8'))
        
        assert len(clients) == 1, "coach_azul should only see 1 client"
        assert clients[0]['email'] == "cliente.azul@example.com"
        print("  [PASS] coach_azul only sees Cliente Azul.")
        
        # 7. Query clients as coach_rojo
        print("\nTest 7: Querying clients as coach_rojo...")
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            headers={'X-Trainer-Id': 'coach_rojo'}
        )
        res = urllib.request.urlopen(req, timeout=5)
        clients = json.loads(res.read().decode('utf-8'))
        
        assert len(clients) == 1, "coach_rojo should only see 1 client"
        assert clients[0]['email'] == "cliente.rojo@example.com"
        print("  [PASS] coach_rojo only sees Cliente Rojo.")
        
        # 8. Submit daily log for client_azul
        print("\nTest 8: Submitting a daily log report for Cliente Azul...")
        log_payload = {
            "user_id": client_azul_id,
            "date": "2026-06-18",
            "weight_kg": 76.5,
            "steps_count": 10500,
            "sleep_hours": 8.0,
            "sleep_quality": 9,
            "water_intake_ml": 2500,
            "energy_level": 4,
            "digestion_status": 5,
            "diet_adherence": 10,
            "resting_hr": 62,
            "notes": "Excelente dia, todo azul!"
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/daily_logs",
            data=json.dumps(log_payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Trainer-Id': 'coach_azul'
            }
        )
        res = urllib.request.urlopen(req, timeout=5)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        print("  [PASS] Daily log report successfully sent and registered.")
        
        # 9. Verify database isolation by checking the SQLite files directly
        print("\nTest 9: Verifying SQLite data isolation directly in files...")
        conn_azul = sqlite3.connect(db_azul)
        c_azul = conn_azul.cursor()
        c_azul.execute("SELECT weight_kg, steps_count, notes FROM daily_logs WHERE user_id = ?", (client_azul_id,))
        log_azul = c_azul.fetchone()
        assert log_azul is not None
        assert log_azul[0] == 76.5
        assert log_azul[2] == "Excelente dia, todo azul!"
        conn_azul.close()
        
        # Check coach_rojo DB has NO daily logs for this user_id
        conn_rojo = sqlite3.connect(db_rojo)
        c_rojo = conn_rojo.cursor()
        c_rojo.execute("SELECT count(*) FROM daily_logs")
        log_rojo_count = c_rojo.fetchone()[0]
        assert log_rojo_count == 0, "coach_rojo DB daily_logs table must be empty!"
        conn_rojo.close()
        print("  [PASS] Database isolation physically confirmed at SQLite level.")
        
        print("\n=== ALL TESTS PASSED SUCCESSFULLY! MULTI-TENANCY IS FULLY FUNCTIONAL! ===")
        
    except urllib.error.HTTPError as e:
        print(f"\n  [FAIL] HTTP Error: {e.code} {e.reason}")
        try:
            print("Response Body:", e.fp.read().decode('utf-8'))
        except Exception:
            pass
    except Exception as e:
        print(f"\n  [FAIL] Test encountered an error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        server_proc.terminate()
        server_proc.wait()
        print("API Server terminated.")
        #clean_test_data()
        print("=== TESTS FINISHED ===")

if __name__ == "__main__":
    run_tests()
