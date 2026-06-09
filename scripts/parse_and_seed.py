import sqlite3
import os
import re
from datetime import datetime

def parse_float(val):
    if val is None:
        return 0.0
    val_str = str(val).strip()
    if not val_str or val_str == '-' or val_str == '':
        return 0.0
    val_str = val_str.replace(',.', '.').replace('..', '.').replace(',', '.')
    val_str = re.sub(r'[^\d\.]', '', val_str)
    try:
        return float(val_str)
    except ValueError:
        return 0.0

def parse_fat_pct(val):
    if val is None:
        return 0.0
    val_str = str(val).strip()
    if '%' in val_str:
        val_str = val_str.replace('%', '')
        try:
            return float(val_str)
        except ValueError:
            return 0.0
    else:
        try:
            f = float(val_str)
            if f < 1.0 and f > 0.0:
                return f * 100.0
            return f
        except ValueError:
            return 0.0

def seed_brayan():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    persistent_dir = os.environ.get("PERSISTENT_DIR", os.path.join(base_dir, "database"))
    db_path = os.path.join(persistent_dir, "fitness.db")
    xlsx_path = os.path.join(base_dir, "Brayan Guerrero (1).xlsx")
    
    if not os.path.exists(xlsx_path):
        print(f"Error: {xlsx_path} not found.")
        return
        
    try:
        import openpyxl
    except ImportError:
        print("openpyxl not installed. Please install it using: pip install openpyxl")
        return
        
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb['DIEGO ']
    
    rows = list(ws.iter_rows(values_only=True))
    
    first_name = "BRAYAN ANDRES"
    last_name = "GUERRERO RIOS"
    email = "brayan.guerrero@example.com"
    phone = "3001234567"
    birthdate = "2003-01-31"
    height_cm = 172.0
    blood_type = "O+"
    allergies = "NADA"
    medications = "NADA"
    availability = '{"Lunes": "Día", "Martes": "Día", "Miércoles": "Día", "Jueves": "Día", "Viernes": "Día", "Sábado": "Día", "Domingo": "Día"}'
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    user_row = cursor.fetchone()
    if user_row:
        user_id = user_row[0]
        print(f"User {first_name} {last_name} already exists with ID: {user_id}")
    else:
        cursor.execute("""
            INSERT INTO users (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability))
        user_id = cursor.lastrowid
        print(f"Inserted User {first_name} {last_name} with ID: {user_id}")
        
    date_row = rows[20] # row 21
    valid_cols = []
    for c_idx in range(4, len(date_row)):
        val = date_row[c_idx]
        if val is not None and str(val).strip() != '':
            date_str = ""
            if isinstance(val, datetime):
                date_str = val.strftime('%Y-%m-%d')
            else:
                val_str = str(val).strip()
                try:
                    dt = datetime.strptime(val_str, '%d/%m/%Y')
                    date_str = dt.strftime('%Y-%m-%d')
                except ValueError:
                    try:
                        dt = datetime.strptime(val_str, '%Y-%m-%d %H:%M:%S')
                        date_str = dt.strftime('%Y-%m-%d')
                    except ValueError:
                        date_str = val_str
            valid_cols.append((c_idx, date_str))
            
    print(f"Found assessment dates: {valid_cols}")
    
    for col_idx, d_str in valid_cols:
        weight = parse_float(rows[24][col_idx])
        neck = parse_float(rows[33][col_idx])
        chest = parse_float(rows[34][col_idx])
        shoulder = parse_float(rows[35][col_idx])
        abdomen = parse_float(rows[36][col_idx])
        iliac = parse_float(rows[37][col_idx])
        trochanter = parse_float(rows[38][col_idx])
        right_thigh = parse_float(rows[39][col_idx])
        left_thigh = parse_float(rows[41][col_idx])
        right_calf = parse_float(rows[43][col_idx])
        left_calf = parse_float(rows[44][col_idx])
        right_bicep = parse_float(rows[45][col_idx])
        left_bicep = parse_float(rows[46][col_idx])
        right_forearm = parse_float(rows[47][col_idx])
        left_forearm = parse_float(rows[48][col_idx])
        
        bmi = weight / ((height_cm/100.0) * (height_cm/100.0))
        
        scapular = parse_float(rows[51][col_idx])
        triceps = parse_float(rows[52][col_idx])
        abdominal = parse_float(rows[53][col_idx])
        sk_iliac = parse_float(rows[54][col_idx])
        inner_thigh = parse_float(rows[55][col_idx])
        medial_calf = parse_float(rows[57][col_idx])
        
        sum_folds = scapular + triceps + abdominal + sk_iliac + inner_thigh + medial_calf
        
        body_fat_pct = parse_fat_pct(rows[62][col_idx])
        if body_fat_pct == 0.0:
            body_fat_pct = (triceps + scapular + sk_iliac + abdominal) * 0.153 + 5.783
            
        fat_mass = weight * (body_fat_pct / 100.0)
        lean_mass = weight - fat_mass
        
        cursor.execute("SELECT id FROM anthropometric_assessments WHERE user_id = ? AND date = ?", (user_id, d_str))
        as_row = cursor.fetchone()
        
        if as_row:
            print(f"Assessment on {d_str} already exists. Skipping.")
        else:
            cursor.execute("""
                INSERT INTO anthropometric_assessments (
                    user_id, date, weight_kg, height_cm, bmi, fc_max, fc_rep,
                    neck, chest, shoulder, abdomen, iliac, trochanter,
                    right_thigh, left_thigh, right_calf, left_calf,
                    right_bicep, left_bicep, right_forearm, left_forearm
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, d_str, weight, height_cm, bmi, 195, 60,
                neck, chest, 0.0, abdomen, 0.0, 0.0,
                right_thigh, left_thigh, right_calf, left_calf,
                right_bicep, left_bicep, right_forearm, left_forearm
            ))
            assessment_id = cursor.lastrowid
            
            cursor.execute("""
                INSERT INTO skinfold_assessments (
                    assessment_id, scapular, triceps, abdominal, iliac,
                    inner_thigh, mid_thigh, medial_calf, chest, biceps,
                    sum_folds, body_fat_percentage, fat_mass_kg, lean_mass_kg
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                assessment_id, scapular, triceps, abdominal, sk_iliac,
                inner_thigh, 0.0, medial_calf, 0.0, 0.0,
                sum_folds, body_fat_pct, fat_mass, lean_mass
            ))
            print(f"Seeded assessment for {d_str}")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    seed_brayan()
