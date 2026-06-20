import urllib.request
import urllib.error
import json
import subprocess
import time
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSISTENT_DIR = os.path.join(BASE_DIR, "database")
MASTER_DB_PATH = os.path.join(PERSISTENT_DIR, "master.db")
TENANTS_DIR = os.path.join(PERSISTENT_DIR, "tenants")

def run_admin_tests():
    print("=== STARTING DEV/ADMIN ENDPOINTS VERIFICATION ===")
    
    server_script = os.path.join(BASE_DIR, "server.py")
    server_proc = subprocess.Popen(["python", server_script])
    time.sleep(3.0) # wait for server to bind
    
    try:
        # 1. Verify Passcode
        print("\nTest 1: Verifying passcode API...")
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/admin/verify",
            data=json.dumps({"passcode": "dev123"}).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        
        # Test bad passcode
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/admin/verify",
            data=json.dumps({"passcode": "badpass"}).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is False
        print("  [PASS] Passcode verification logic works.")

        # 2. Get Trainers Authentication Check
        print("\nTest 2: Getting trainers auth check...")
        try:
            req = urllib.request.Request("http://127.0.0.1:8080/api/admin/trainers")
            urllib.request.urlopen(req)
            assert False, "Should have failed with 401"
        except urllib.error.HTTPError as e:
            assert e.code == 401
            print("  [PASS] Access blocked without header.")
            
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/admin/trainers",
            headers={'X-Admin-Passcode': 'dev123'}
        )
        res = urllib.request.urlopen(req)
        trainers = json.loads(res.read().decode('utf-8'))
        assert isinstance(trainers, list)
        print(f"  [PASS] Access granted with header. Found {len(trainers)} trainers.")

        # 3. Create Trainer from Admin
        print("\nTest 3: Creating trainer via Admin API...")
        payload_trainer = {
            "name": "Admin Coach",
            "nickname": "admin_coach",
            "email": "admin_coach@elite.com",
            "password": "password123",
            "theme_color": "#10b981"
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/admin/trainers",
            data=json.dumps(payload_trainer).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Admin-Passcode': 'dev123'
            }
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        print("  [PASS] Trainer created successfully.")

        # 4. Update Trainer Theme & Password
        print("\nTest 4: Updating trainer info...")
        # Get ID
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/admin/trainers",
            headers={'X-Admin-Passcode': 'dev123'}
        )
        res = urllib.request.urlopen(req)
        trainers = json.loads(res.read().decode('utf-8'))
        created = [t for t in trainers if t['nickname'] == 'admin_coach'][0]
        trainer_id = created['id']
        
        payload_update = {
            "id": trainer_id,
            "name": "Admin Coach Modificado",
            "nickname": "admin_coach",
            "email": "admin_coach@elite.com",
            "password": "newpassword123",
            "theme_color": "#06b6d4"
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/admin/trainers",
            data=json.dumps(payload_update).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Admin-Passcode': 'dev123'
            },
            method='PUT'
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        
        # Verify changes in DB
        conn = sqlite3.connect(MASTER_DB_PATH)
        c = conn.cursor()
        c.execute("SELECT password, theme_color, name FROM trainers WHERE id = ?", (trainer_id,))
        row = c.fetchone()
        assert row[0] == "newpassword123"
        assert row[1] == "#06b6d4"
        assert row[2] == "Admin Coach Modificado"
        conn.close()
        print("  [PASS] Trainer details updated in master.db.")

        # 5. Manage Client CRUD in Trainer DB
        print("\nTest 5: Creating, updating and deleting client in trainer DB...")
        # Create client under admin_coach
        client_payload = {
            "first_name": "Test",
            "last_name": "Client",
            "email": "test.client@example.com",
            "phone": "123-456",
            "birthdate": "1995-05-05",
            "height_cm": 172.0
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            data=json.dumps(client_payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Trainer-Id': 'admin_coach'
            }
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        client_id = res_data['client_id']
        
        # Update client profile
        update_client_payload = {
            "id": client_id,
            "first_name": "Test Modificado",
            "last_name": "Client Modificado",
            "email": "test.client.mod@example.com",
            "phone": "987-654",
            "birthdate": "1995-05-05",
            "height_cm": 175.0,
            "nickname": "test_client_nick",
            "password": "newclientpass"
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            data=json.dumps(update_client_payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Trainer-Id': 'admin_coach'
            },
            method='PUT'
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        
        # Verify update
        tenant_db = os.path.join(TENANTS_DIR, "trainer_admin_coach.db")
        conn_tenant = sqlite3.connect(tenant_db)
        c_tenant = conn_tenant.cursor()
        c_tenant.execute("SELECT first_name, email, password FROM users WHERE id = ?", (client_id,))
        row_c = c_tenant.fetchone()
        assert row_c[0] == "Test Modificado"
        assert row_c[1] == "test.client.mod@example.com"
        assert row_c[2] == "newclientpass"
        
        # Delete client
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/clients",
            data=json.dumps({"id": client_id}).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Trainer-Id': 'admin_coach'
            },
            method='DELETE'
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        
        # Verify deleted
        c_tenant.execute("SELECT count(*) FROM users WHERE id = ?", (client_id,))
        count = c_tenant.fetchone()[0]
        assert count == 0
        conn_tenant.close()
        print("  [PASS] Client CRUD endpoints functional.")

        # 6. Delete Trainer (Physically removes database)
        print("\nTest 6: Deleting trainer via Admin API (Database Cleanup)...")
        req = urllib.request.Request(
            "http://127.0.0.1:8080/api/admin/trainers",
            data=json.dumps({"id": trainer_id}).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Admin-Passcode': 'dev123'
            },
            method='DELETE'
        )
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        assert res_data['success'] is True
        
        # Verify DB removed
        assert not os.path.exists(tenant_db), "Database file should have been deleted"
        
        # Verify removed from master
        conn = sqlite3.connect(MASTER_DB_PATH)
        c = conn.cursor()
        c.execute("SELECT count(*) FROM trainers WHERE id = ?", (trainer_id,))
        count_t = c.fetchone()[0]
        assert count_t == 0
        conn.close()
        print("  [PASS] Trainer deletion & database file physical deletion works.")
        
        print("\n=== ALL DEV/ADMIN VERIFICATION TESTS PASSED SUCCESSFULLY! ===")
        
    except Exception as e:
        print(f"\n  [FAIL] Test encountered error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        server_proc.terminate()
        server_proc.wait()
        print("Server stopped.")

if __name__ == "__main__":
    run_admin_tests()
