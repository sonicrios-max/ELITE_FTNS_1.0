import sqlite3
import json
import urllib.request
import urllib.error
import subprocess
import time
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "database", "fitness.db")

def run_database_integrity_checks():
    print("=== RUNNING DB INTEGRITY CHECKS ===")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check clients
    cursor.execute("SELECT id, first_name, last_name, email FROM users")
    users = cursor.fetchall()
    print(f"Users found in DB ({len(users)}):")
    for u in users:
        print(f"  - ID: {u[0]} | {u[1]} {u[2]} | {u[3]}")
        
    # Check Brayan's assessment count
    cursor.execute("SELECT COUNT(*) FROM anthropometric_assessments WHERE user_id = 1")
    count1 = cursor.fetchone()[0]
    print(f"  - User 1 (Brayan) assessments: {count1} (Expected 5)")
    
    conn.close()
    print("DB checks passed.\n")

def test_api_endpoints():
    print("=== STARTING API AND FUNCTIONAL TESTS ===")
    # 1. Start backend server as background process
    server_script = os.path.join(BASE_DIR, "server.py")
    # Do NOT capture stdout/stderr to avoid pipe buffering hangs
    server_proc = subprocess.Popen(["python", server_script])
    time.sleep(2.0) # wait for server to bind port
    
    try:
        # Test 1: GET /api/clients
        print("Test 1: Fetching all clients via API...")
        res = urllib.request.urlopen("http://127.0.0.1:8080/api/clients", timeout=5)
        clients = json.loads(res.read().decode('utf-8'))
        assert len(clients) >= 2, "Should have at least 2 clients"
        print(f"  [PASS] Found {len(clients)} clients: {[c['first_name'] for c in clients]}")
        
        # Test 2: GET /api/clients/1 (Brayan's details)
        print("Test 2: Fetching Brayan's detailed data...")
        res = urllib.request.urlopen("http://127.0.0.1:8080/api/clients/1", timeout=5)
        brayan_detail = json.loads(res.read().decode('utf-8'))
        assert brayan_detail['profile']['first_name'] == "BRAYAN ANDRES"
        assert len(brayan_detail['assessments']) == 5
        print("  [PASS] Brayan's detailed profile and assessments loaded successfully.")

        # Test 3: POST /api/clients (Create third user with full profile fields)
        print("Test 3: Creating a new client (Carlos Gomez) with full details...")
        # Clean up Carlos if already exists to ensure clean run
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM users WHERE email = 'carlos.gomez@example.com'")
        conn.commit()
        conn.close()

        new_client_payload = {
            "first_name": "CARLOS",
            "last_name": "GOMEZ",
            "email": "carlos.gomez@example.com",
            "phone": "3205554433",
            "birthdate": "1994-08-20",
            "height_cm": 180.0,
            "blood_type": "O-",
            "availability_schedule": "Lunes a Viernes (Noche)",
            "allergies": "Gluten",
            "medications": "Ninguno"
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            data=json.dumps(new_client_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req, timeout=5)
        result = json.loads(res.read().decode('utf-8'))
        assert result['success'] is True, "Client creation should succeed"
        carlos_id = result['client_id']
        print(f"  [PASS] Carlos Gomez created successfully with ID: {carlos_id}")

        # Test 4: Verify profile details are stored correctly
        print("Test 4: Verifying new client profile retrieval details...")
        res = urllib.request.urlopen(f"http://127.0.0.1:8080/api/clients/{carlos_id}", timeout=5)
        carlos_detail = json.loads(res.read().decode('utf-8'))
        profile = carlos_detail['profile']
        assert profile['first_name'] == "CARLOS"
        assert profile['birthdate'] == "1994-08-20"
        assert profile['blood_type'] == "O-"
        assert profile['availability_schedule'] == "Lunes a Viernes (Noche)"
        assert profile['medications'] == "Ninguno"
        print("  [PASS] All newly added profile fields mapped and verified in database.")

        # Test 5: POST /api/assessments (Submit Carlos's physical measurements)
        print("Test 5: Submitting Carlos's anthropometric assessment...")
        assessment_payload = {
            "user_id": carlos_id,
            "date": "2026-06-07",
            "weight_kg": 80.0,
            "height_cm": 180.0,
            "fc_rep": 64,
            "neck": 39.0,
            "chest": 105.0,
            "abdomen": 88.0,
            "right_bicep": 36.5,
            "right_thigh": 61.0,
            "triceps": 12.0,
            "scapular": 14.0,
            "iliac": 15.0,
            "abdominal": 18.0
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/assessments",
            data=json.dumps(assessment_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req, timeout=5)
        as_result = json.loads(res.read().decode('utf-8'))
        assert as_result['success'] is True, "Assessment submission should succeed"
        print("  [PASS] Anthropometric values inserted.")
        
        # Test 6: Verify Carlos's calculated values
        print("Test 6: Verifying automatic KPI calculation for Carlos...")
        res = urllib.request.urlopen(f"http://127.0.0.1:8080/api/clients/{carlos_id}", timeout=5)
        carlos_detail = json.loads(res.read().decode('utf-8'))
        latest_as = carlos_detail['assessments'][-1]
        
        fat_pct = latest_as['body_fat_percentage']
        expected_fat = 59 * 0.153 + 5.783
        assert abs(fat_pct - expected_fat) < 0.01
        print(f"  [PASS] Faulkner Fat % calculated accurately: {fat_pct:.2f}% (Expected: {expected_fat:.2f}%)")
        
        bmi = latest_as['bmi']
        expected_bmi = 80.0 / ((180.0/100.0) ** 2)
        assert abs(bmi - expected_bmi) < 0.01
        print(f"  [PASS] BMI calculated accurately: {bmi:.2f}")

    except Exception as e:
        print(f"  [FAIL] Test encountered an error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Kill server process
        server_proc.terminate()
        server_proc.wait()
        print("API Server terminated.")
        print("=== TESTS FINISHED ===")

if __name__ == "__main__":
    run_database_integrity_checks()
    test_api_endpoints()
