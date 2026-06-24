import os
import sqlite3
import bcrypt

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSISTENT_DIR = os.environ.get("PERSISTENT_DIR", os.path.join(BASE_DIR, "database"))
MASTER_DB_PATH = os.path.join(PERSISTENT_DIR, "master.db")
TENANTS_DIR = os.path.join(PERSISTENT_DIR, "tenants")

def get_password_hash(password):
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def hash_passwords():
    # Hash trainers in master.db
    if os.path.exists(MASTER_DB_PATH):
        print(f"Hashing passwords in {MASTER_DB_PATH}...")
        conn = sqlite3.connect(MASTER_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, password FROM trainers")
        rows = cursor.fetchall()
        for row in rows:
            trainer_id, pwd = row
            if not pwd.startswith("$2b$"):  # bcrypt prefix
                hashed = get_password_hash(pwd)
                cursor.execute("UPDATE trainers SET password = ? WHERE id = ?", (hashed, trainer_id))
        conn.commit()
        conn.close()
    
    # Hash clients in tenant databases
    if os.path.exists(TENANTS_DIR):
        for f in os.listdir(TENANTS_DIR):
            if f.endswith(".db"):
                tenant_db_path = os.path.join(TENANTS_DIR, f)
                print(f"Hashing passwords in tenant {f}...")
                conn = sqlite3.connect(tenant_db_path)
                cursor = conn.cursor()
                try:
                    cursor.execute("SELECT id, password FROM users")
                    rows = cursor.fetchall()
                    for row in rows:
                        user_id, pwd = row
                        if pwd and not pwd.startswith("$2b$"):
                            hashed = get_password_hash(pwd)
                            cursor.execute("UPDATE users SET password = ? WHERE id = ?", (hashed, user_id))
                    conn.commit()
                except Exception as e:
                    print(f"Error in {f}: {e}")
                finally:
                    conn.close()

if __name__ == "__main__":
    hash_passwords()
    print("Password hashing completed.")
