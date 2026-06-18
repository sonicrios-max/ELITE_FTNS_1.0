import sqlite3

def fix_db():
    conn = sqlite3.connect('database/fitness.db')
    cursor = conn.cursor()
    cursor.execute("UPDATE workout_plans SET title = 'Plantilla Maestra: Fuerza e Hipertrofia' WHERE user_id != 0")
    conn.commit()
    conn.close()
    print("Database workout plan titles updated successfully.")

if __name__ == '__main__':
    fix_db()
