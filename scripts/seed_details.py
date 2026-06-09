import sqlite3
import os
import random
from datetime import datetime, timedelta

def seed_details():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    persistent_dir = os.environ.get("PERSISTENT_DIR", os.path.join(base_dir, "database"))
    db_path = os.path.join(persistent_dir, "fitness.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Seed Maria Perez (Second Client)
    first_name = "MARIA JULIANA"
    last_name = "PEREZ"
    email = "maria.perez@example.com"
    phone = "3159876543"
    birthdate = "1998-05-15"
    height_cm = 160.0
    blood_type = "A+"
    allergies = "LACTOSA"
    medications = "NINGUNO"
    availability = '{"Lunes": "Noche", "Martes": "Noche", "Miércoles": "Noche", "Jueves": "Noche", "Viernes": "Noche"}'
    
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    maria_row = cursor.fetchone()
    if maria_row:
        maria_id = maria_row[0]
        print(f"Maria already exists with ID: {maria_id}")
    else:
        cursor.execute("""
            INSERT INTO users (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability))
        maria_id = cursor.lastrowid
        print(f"Inserted User Maria Perez with ID: {maria_id}")
        
    # Seed Maria's 3 assessments (Jan, Mar, May 2026)
    assessments_data = [
        ("2026-01-15", 68.0, 33.5, 92.0, 102.0, 82.0, 88.0, 104.0, 56.0, 55.5, 38.0, 37.5, 28.5, 28.0, 24.0, 24.0, 14.0, 12.0, 18.0, 16.0, 15.0, 10.0, 22.0),
        ("2026-03-15", 64.5, 33.0, 90.0, 100.0, 76.0, 82.0, 100.0, 54.0, 54.0, 37.5, 37.0, 27.5, 27.0, 23.5, 23.5, 11.0, 10.0, 14.0, 12.0, 12.0, 8.0, 18.5),
        ("2026-05-15", 61.2, 32.5, 88.5, 98.0, 71.0, 76.5, 96.0, 52.5, 52.0, 37.0, 36.5, 26.8, 26.5, 23.0, 23.0, 8.5, 8.0, 10.0, 9.0, 9.5, 6.5, 15.2)
    ]
    
    for item in assessments_data:
        date_str = item[0]
        weight = item[1]
        neck, chest, shoulder, abdomen, iliac, trochanter, r_thigh, l_thigh, r_calf, l_calf, r_bicep, l_bicep, r_forearm, l_forearm = item[2:16]
        scapular, triceps, abdominal, sk_iliac, inner_thigh, medial_calf, fat_pct = item[16:]
        
        bmi = weight / ((height_cm/100.0) * (height_cm/100.0))
        sum_folds = scapular + triceps + abdominal + sk_iliac + inner_thigh + medial_calf
        fat_mass = weight * (fat_pct / 100.0)
        lean_mass = weight - fat_mass
        
        cursor.execute("SELECT id FROM anthropometric_assessments WHERE user_id = ? AND date = ?", (maria_id, date_str))
        as_row = cursor.fetchone()
        if not as_row:
            cursor.execute("""
                INSERT INTO anthropometric_assessments (
                    user_id, date, weight_kg, height_cm, bmi, fc_max, fc_rep,
                    neck, chest, shoulder, abdomen, iliac, trochanter,
                    right_thigh, left_thigh, right_calf, left_calf,
                    right_bicep, left_bicep, right_forearm, left_forearm
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                maria_id, date_str, weight, height_cm, bmi, 190, 64,
                neck, chest, shoulder, abdomen, iliac, trochanter,
                r_thigh, l_thigh, r_calf, l_calf,
                r_bicep, l_bicep, r_forearm, l_forearm
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
                sum_folds, fat_pct, fat_mass, lean_mass
            ))
            print(f"Inserted Assessment for Maria on {date_str}")
            
    # 2. Seed Exercise Library
    exercises = [
        ("Flexiones de Pecho (Push-Ups)", "Apoya las manos a la altura de los hombros, baja con el cuerpo alineado apretando el abdomen y empuja hacia arriba.", "Pectorales", "Tríceps, Hombro anterior", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-pushups-in-a-park-23233-large.mp4", ""),
        ("Sentadillas Libres (Squats)", "Coloca los pies al ancho de los hombros, baja la cadera manteniendo la espalda recta e intentando romper el paralelo.", "Cuádriceps", "Glúteos, Femorales", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-young-woman-doing-squats-in-front-of-a-mirror-42792-large.mp4", ""),
        ("Fondos en Paralelas (Dips)", "Sujétate de las barras paralelas, baja de forma controlada flexionando los codos hasta 90 grados y vuelve a subir.", "Tríceps", "Pectoral bajo, Hombro anterior", "Barras paralelas", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-tricep-dips-on-gym-bars-33423-large.mp4", ""),
        ("Dominadas Pronas (Pull-Ups)", "Cuélgate de la barra fija con agarre prono (palmas al frente) y sube hasta que tu barbilla pase la barra.", "Dorsales", "Bíceps, Braquial", "Barra fija", "https://assets.mixkit.co/videos/preview/mixkit-athletic-man-doing-pull-ups-at-the-gym-40292-large.mp4", ""),
        ("Plancha Abdominal Isometrica (Plank)", "Apoya los antebrazos y puntas de pie, mantén la cadera neutra alineando hombros, espalda y piernas sin arquear la zona lumbar.", "Abdomen (Core)", "Serrato, Glúteos", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-plank-exercise-on-mat-34241-large.mp4", ""),
        ("Elevación de Piernas Colgado (Leg Raises)", "Cuélgate de la barra y eleva las piernas rectas hasta formar un ángulo de 90 grados con el torso.", "Abdomen bajo", "Flexores de cadera", "Barra fija", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-leg-raises-on-pull-up-bar-40293-large.mp4", "")
    ]
    
    exercise_ids = {}
    for name, desc, primary, sec, equip, v_url, img_url in exercises:
        cursor.execute("SELECT id FROM exercises WHERE name = ?", (name,))
        ex_row = cursor.fetchone()
        if ex_row:
            exercise_ids[name] = ex_row[0]
        else:
            cursor.execute("""
                INSERT INTO exercises (name, description, primary_muscle, secondary_muscles, equipment, video_url, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (name, desc, primary, sec, equip, v_url, img_url))
            exercise_ids[name] = cursor.lastrowid
            
    print(f"Seeded exercises.")
    
    # 3. Seed Workout Plans for Brayan (User 1)
    brayan_id = 1
    cursor.execute("SELECT id FROM workout_plans WHERE user_id = ?", (brayan_id,))
    wp_row = cursor.fetchone()
    if not wp_row:
        cursor.execute("""
            INSERT INTO workout_plans (user_id, title, description, start_date, end_date)
            VALUES (?, ?, ?, ?, ?)
        """, (brayan_id, "Rutina Calistenia Básica", "Plan enfocado en el dominio del peso corporal.", "2026-05-01", "2026-08-01"))
        plan_id = cursor.lastrowid
        
        cursor.execute("INSERT INTO workout_days (plan_id, day_name, order_index) VALUES (?, ?, ?)", (plan_id, "Día 1: Fuerza Empuje", 1))
        d1_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO workout_exercises (workout_day_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (d1_id, exercise_ids["Flexiones de Pecho (Push-Ups)"], 4, "12-15", 8, 90, "Foco en rango completo.", 1))
        cursor.execute("""
            INSERT INTO workout_exercises (workout_day_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (d1_id, exercise_ids["Fondos en Paralelas (Dips)"], 4, "8-10", 8, 120, "Mantén codos alineados.", 2))
        
        cursor.execute("INSERT INTO workout_days (plan_id, day_name, order_index) VALUES (?, ?, ?)", (plan_id, "Día 2: Tracción y Pierna", 2))
        d2_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO workout_exercises (workout_day_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (d2_id, exercise_ids["Dominadas Pronas (Pull-Ups)"], 4, "6-8", 9, 120, "Evita balanceo.", 1))
        cursor.execute("""
            INSERT INTO workout_exercises (workout_day_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (d2_id, exercise_ids["Sentadillas Libres (Squats)"], 4, "15-20", 7, 90, "Rompe paralelo.", 2))
        
    # 4. Seed Nutrition Plan for Brayan
    cursor.execute("SELECT id FROM nutrition_plans WHERE user_id = ?", (brayan_id,))
    np_row = cursor.fetchone()
    if not np_row:
        cursor.execute("""
            INSERT INTO nutrition_plans (user_id, title, description, start_date, end_date, target_calories, target_protein, target_carbs, target_fat)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (brayan_id, "Fase Volumen Limpio", "Superávit calórico controlado.", "2026-05-01", "2026-08-01", 2600, 160, 320, 75))
        np_id = cursor.lastrowid
        
        meals = [
            ("Desayuno", 1, [
                ("Avena en Hojuelas", 80, 310, 11, 52, 6, "Remojar en agua"),
                ("Claras de Huevo", 150, 80, 16, 1, 0, "Tortilla"),
                ("Plátano Maduro", 100, 90, 1, 23, 0.3, "Picado")
            ]),
            ("Almuerzo", 2, [
                ("Pechuga de Pollo", 150, 240, 46, 0, 4, "A la plancha"),
                ("Arroz Blanco", 200, 260, 5, 56, 0.5, "Cocido")
            ])
        ]
        
        for m_name, idx, items in meals:
            cursor.execute("INSERT INTO meals (nutrition_plan_id, meal_name, order_index) VALUES (?, ?, ?)", (np_id, m_name, idx))
            m_id = cursor.lastrowid
            for f_name, w_g, kcal, pro, carb, fat, nts in items:
                cursor.execute("""
                    INSERT INTO meal_items (meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (m_id, f_name, w_g, kcal, pro, carb, fat, nts))

    # 5. Seed Daily Logs with realistic fluctuations (rather than a straight descending line)
    now = datetime.now()
    random.seed(42) # seed for nice, reproducible curves
    
    print("Seeding daily logs with realistic fluctuations...")
    
    # User 1: Brayan (Bulking, trending up from 72.1 to 73.1 over 14 days)
    base_weight_brayan = 72.1
    for i in range(14):
        day_idx = 13 - i # 13 is oldest (13 days ago), 0 is today
        log_date = (now - timedelta(days=day_idx)).strftime('%Y-%m-%d')
        
        # Trend up + natural variance
        weight_val = base_weight_brayan + (i * 0.077) + random.uniform(-0.12, 0.12)
        steps = int(random.gauss(9500, 1000))
        sleep = round(random.uniform(6.8, 8.2), 1)
        sleep_q = random.randint(7, 9)
        water = random.choice([2000, 2250, 2500, 2750, 3000])
        energy = random.choice([4, 5])
        digest = random.choice([4, 5])
        adh = random.randint(8, 10)
        resting_hr = int(random.uniform(58, 62))
        hrv = round(random.uniform(62.0, 69.0), 1)
        
        cursor.execute("""
            INSERT OR REPLACE INTO daily_logs (user_id, date, weight_kg, steps_count, sleep_hours, sleep_quality, water_intake_ml, energy_level, digestion_status, diet_adherence, resting_hr, hrv, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (brayan_id, log_date, round(weight_val, 2), steps, sleep, sleep_q, water, energy, digest, adh, resting_hr, hrv, "Día regular, entrenamiento completado."))
        
    # User 2: Maria (Cutting, trending down from 62.1 to 61.2 over 14 days)
    base_weight_maria = 62.1
    for i in range(14):
        day_idx = 13 - i
        log_date = (now - timedelta(days=day_idx)).strftime('%Y-%m-%d')
        
        # Trend down + natural variance
        weight_val = base_weight_maria - (i * 0.07) + random.uniform(-0.10, 0.10)
        steps = int(random.gauss(10800, 1200))
        sleep = round(random.uniform(6.6, 7.8), 1)
        sleep_q = random.randint(6, 8)
        water = random.choice([1800, 2000, 2250, 2500])
        energy = random.choice([3, 4])
        digest = random.choice([3, 4, 5])
        adh = random.randint(8, 10)
        resting_hr = int(random.uniform(62, 66))
        hrv = round(random.uniform(56.0, 61.0), 1)
        
        cursor.execute("""
            INSERT OR REPLACE INTO daily_logs (user_id, date, weight_kg, steps_count, sleep_hours, sleep_quality, water_intake_ml, energy_level, digestion_status, diet_adherence, resting_hr, hrv, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (maria_id, log_date, round(weight_val, 2), steps, sleep, sleep_q, water, energy, digest, adh, resting_hr, hrv, "Entrenamiento completado y alimentación limpia."))
            
    conn.commit()
    conn.close()
    print("Database seeding completed.")

if __name__ == "__main__":
    seed_details()
