import sqlite3
import os

def init_db():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    persistent_dir = os.environ.get("PERSISTENT_DIR", os.path.join(base_dir, "database"))
    if not os.path.exists(persistent_dir):
        os.makedirs(persistent_dir)
        
    db_path = os.path.join(persistent_dir, "fitness.db")
    schema_path = os.path.join(base_dir, "database", "schema.sql")
    
    print(f"Initializing database at: {db_path}")
    print(f"Reading schema from: {schema_path}")
    
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.executescript(schema_sql)
        conn.commit()
        print("Database initialized successfully.")
    except Exception as e:
        print("Error initializing database:", e)
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
