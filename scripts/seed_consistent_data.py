import sqlite3
import os
import random
from datetime import datetime, timedelta

def seed_consistent_data():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    persistent_dir = os.environ.get("PERSISTENT_DIR", os.path.join(base_dir, "database"))
    db_path = os.path.join(persistent_dir, "fitness.db")
    
    print(f"Opening database for consistent seeding: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Enable foreign keys and clear all existing tables to prevent duplicate or orphan records
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    tables_to_clear = [
        "set_logs", "workout_execution_logs", "workout_exercises", 
        "workout_day_blocks", "workout_blocks", "workout_days", "workout_plans", 
        "meal_items", "meals", "nutrition_plans", "skinfold_assessments", 
        "anthropometric_assessments", "daily_logs", "exercises", "users"
    ]
    
    for table in tables_to_clear:
        try:
            cursor.execute(f"DELETE FROM {table};")
        except sqlite3.OperationalError as e:
            print(f"Skipping clear for {table} (operational error: {e})")
            
    # Reset sqlite auto-increment counters
    try:
        cursor.execute("DELETE FROM sqlite_sequence;")
    except sqlite3.OperationalError:
        pass
        
    print("Cleaned up existing database records.")
    
    # 2. Seed Exercise Library (6 exercises)
    exercises_data = [
        (1, "Flexiones de Pecho (Push-Ups)", "Apoya las manos a la altura de los hombros, baja con el cuerpo alineado apretando el abdomen y empuja hacia arriba.", "Empuje", "Pectorales", "Tríceps, Hombro anterior", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-pushups-in-a-park-23233-large.mp4", ""),
        (2, "Sentadillas Libres (Squats)", "Coloca los pies al ancho de los hombros, baja la cadera manteniendo la espalda recta e intentando romper el paralelo.", "Pierna", "Cuádriceps", "Glúteos, Femorales", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-young-woman-doing-squats-in-front-of-a-mirror-42792-large.mp4", ""),
        (3, "Fondos en Paralelas (Dips)", "Sujétate de las barras paralelas, baja de forma controlada flexionando los codos hasta 90 grados y vuelve a subir.", "Empuje", "Tríceps", "Pectoral bajo, Hombro anterior", "Barras paralelas", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-tricep-dips-on-gym-bars-33423-large.mp4", ""),
        (4, "Dominadas Pronas (Pull-Ups)", "Cuélgate de la barra fija con agarre prono (palmas al frente) y sube hasta que tu barbilla pase la barra.", "Tracción", "Dorsales", "Bíceps, Braquial", "Barra fija", "https://assets.mixkit.co/videos/preview/mixkit-athletic-man-doing-pull-ups-at-the-gym-40292-large.mp4", ""),
        (5, "Plancha Abdominal Isometrica (Plank)", "Apoya los antebrazos y puntas de pie, mantén la cadera neutra alineando hombros, espalda y piernas sin arquear la zona lumbar.", "Core", "Abdomen (Core)", "Serrato, Glúteos", "Peso corporal", "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-plank-exercise-on-mat-34241-large.mp4", ""),
        (6, "Elevación de Piernas Colgado (Leg Raises)", "Cuélgate de la barra y eleva las piernas rectas hasta formar un ángulo de 90 grados con el torso.", "Core", "Abdomen bajo", "Flexores de cadera", "Barra fija", "https://assets.mixkit.co/videos/preview/mixkit-man-doing-leg-raises-on-pull-up-bar-40293-large.mp4", "")
    ]
    
    for ex in exercises_data:
        cursor.execute("""
            INSERT INTO exercises (id, name, description, routine_class, primary_muscle, secondary_muscles, equipment, video_url, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, ex)
    print("Seeded 6 base exercises.")
    
    # 3. Seed Users (3 users + 1 System user)
    users_data = [
        (0, "Sistema", "Global", "admin@elitecoach.com", "0000000000", "1900-01-01", 170.0, "O+", "NADA", "NADA", "Siempre", "admin", "admin"),
        (1, "BRAYAN ANDRES", "GUERRERO RIOS", "brayan.guerrero@example.com", "3001234567", "2003-01-31", 172.0, "O+", "NADA", "NADA", '{"Lunes": "Día", "Martes": "Día", "Miércoles": "Día", "Jueves": "Día", "Viernes": "Día"}', "brayan.guerrero", "123456"),
        (2, "MARIA JULIANA", "PEREZ", "maria.perez@example.com", "3159876543", "1998-05-15", 160.0, "A+", "LACTOSA", "NINGUNO", '{"Lunes": "Noche", "Martes": "Noche", "Miércoles": "Noche", "Jueves": "Noche", "Viernes": "Noche"}', "maria.perez", "123456"),
        (3, "CARLOS", "GOMEZ", "carlos.gomez@example.com", "3205554433", "1994-08-20", 180.0, "O-", "Gluten", "Ninguno", '{"Lunes": "Noche", "Martes": "Noche", "Miércoles": "Noche", "Jueves": "Noche", "Viernes": "Noche"}', "carlos.gomez", "123456")
    ]
    
    for u in users_data:
        cursor.execute("""
            INSERT INTO users (id, first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, u)
    print("Seeded 3 target users.")
    
    # 4. Seed Anthropometric and Skinfold Assessments
    # Exactly 5 monthly assessments per user: Jan 15, Feb 15, Mar 15, Apr 15, May 15 of 2026.
    dates = ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15"]
    
    # Baseline configs for assessments
    user_baselines = {
        1: { # Brayan (Bulking)
            "height": 172.0, "weights": [71.0, 71.5, 72.0, 72.5, 73.0], 
            "neck": [36.0, 36.1, 36.2, 36.3, 36.5], "chest": [98.0, 98.5, 99.0, 99.5, 100.0],
            "abdomen": [81.0, 81.2, 81.3, 81.5, 81.7], "right_bicep": [33.5, 33.8, 34.0, 34.2, 34.5],
            "right_thigh": [56.0, 56.2, 56.5, 56.7, 57.0], "right_calf": [36.0, 36.1, 36.2, 36.2, 36.3],
            "folds": { # scapular, triceps, abdominal, iliac, inner_thigh, medial_calf
                "scapular": [12.0, 11.8, 11.5, 11.2, 11.0], "triceps": [10.0, 9.8, 9.5, 9.2, 9.0],
                "abdominal": [15.0, 14.8, 14.5, 14.2, 14.0], "iliac": [13.0, 12.8, 12.5, 12.2, 12.0],
                "inner_thigh": [14.0, 13.8, 13.5, 13.2, 13.0], "medial_calf": [11.0, 10.8, 10.5, 10.2, 10.0]
            }
        },
        2: { # Maria (Cutting)
            "height": 160.0, "weights": [65.0, 64.0, 63.0, 62.0, 61.2],
            "neck": [33.5, 33.2, 33.0, 32.8, 32.5], "chest": [92.0, 91.0, 90.0, 89.0, 88.5],
            "abdomen": [82.0, 79.5, 77.0, 74.0, 71.0], "right_bicep": [28.5, 28.0, 27.5, 27.0, 26.8],
            "right_thigh": [56.0, 55.0, 54.0, 53.0, 52.5], "right_calf": [38.0, 37.5, 37.0, 36.8, 36.5],
            "folds": {
                "scapular": [14.0, 12.5, 11.0, 9.5, 8.5], "triceps": [12.0, 11.0, 10.0, 9.0, 8.0],
                "abdominal": [18.0, 16.0, 14.0, 11.0, 10.0], "iliac": [16.0, 14.0, 12.0, 10.0, 9.0],
                "inner_thigh": [15.0, 13.5, 12.0, 10.5, 9.5], "medial_calf": [10.0, 9.0, 8.0, 7.0, 6.5]
            }
        },
        3: { # Carlos (Recomposition)
            "height": 180.0, "weights": [82.0, 81.5, 81.0, 80.5, 80.0],
            "neck": [39.5, 39.5, 39.3, 39.2, 39.0], "chest": [106.0, 105.8, 105.5, 105.2, 105.0],
            "abdomen": [90.0, 89.5, 89.0, 88.5, 88.0], "right_bicep": [36.0, 36.2, 36.3, 36.4, 36.5],
            "right_thigh": [62.0, 61.8, 61.5, 61.2, 61.0], "right_calf": [39.0, 39.0, 38.8, 38.8, 38.5],
            "folds": {
                "scapular": [15.0, 14.5, 14.0, 13.8, 13.5], "triceps": [13.0, 12.5, 12.0, 11.8, 11.5],
                "abdominal": [20.0, 19.5, 19.0, 18.5, 18.0], "iliac": [17.0, 16.5, 16.0, 15.5, 15.0],
                "inner_thigh": [16.0, 15.5, 15.0, 14.5, 14.0], "medial_calf": [12.0, 11.5, 11.0, 10.5, 10.0]
            }
        }
    }
    
    for u_id, config in user_baselines.items():
        h = config["height"]
        for idx, date_str in enumerate(dates):
            w = config["weights"][idx]
            bmi = w / ((h / 100.0) ** 2)
            
            # Circumferences
            neck_val = config["neck"][idx]
            chest_val = config["chest"][idx]
            abd_val = config["abdomen"][idx]
            bicep_val = config["right_bicep"][idx]
            thigh_val = config["right_thigh"][idx]
            calf_val = config["right_calf"][idx]
            
            # Insert anthropometric record
            cursor.execute("""
                INSERT INTO anthropometric_assessments (
                    user_id, date, weight_kg, height_cm, bmi, fc_max, fc_rep,
                    neck, chest, shoulder, abdomen, iliac, trochanter,
                    right_thigh, left_thigh, right_calf, left_calf,
                    right_bicep, left_bicep, right_forearm, left_forearm
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                u_id, date_str, w, h, bmi, 195, 64,
                neck_val, chest_val, 0.0, abd_val, 0.0, 0.0,
                thigh_val, thigh_val, calf_val, calf_val,
                bicep_val, bicep_val, 0.0, 0.0
            ))
            assessment_id = cursor.lastrowid
            
            # Folds
            scap = config["folds"]["scapular"][idx]
            tricep = config["folds"]["triceps"][idx]
            abdom = config["folds"]["abdominal"][idx]
            ili = config["folds"]["iliac"][idx]
            ithigh = config["folds"]["inner_thigh"][idx]
            mcalf = config["folds"]["medial_calf"][idx]
            
            sum_folds = scap + tricep + abdom + ili + ithigh + mcalf
            
            # Calculate fat % via Faulkner formula (triceps, scapular, iliac, abdominal)
            fat_pct = (tricep + scap + ili + abdom) * 0.153 + 5.783
            fat_mass = w * (fat_pct / 100.0)
            lean_mass = w - fat_mass
            
            # Insert skinfold record
            cursor.execute("""
                INSERT INTO skinfold_assessments (
                    assessment_id, scapular, triceps, abdominal, iliac,
                    inner_thigh, mid_thigh, medial_calf, chest, biceps,
                    sum_folds, body_fat_percentage, fat_mass_kg, lean_mass_kg
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                assessment_id, scap, tricep, abdom, ili,
                ithigh, 0.0, mcalf, 0.0, 0.0,
                sum_folds, fat_pct, fat_mass, lean_mass
            ))
            
    print("Seeded exactly 5 anthropometric and skinfold assessments for all 3 users.")
    
    # 5. Seed Daily Logs
    # Exactly 30 consecutive days from May 10, 2026 to June 8, 2026.
    start_log_date = datetime(2026, 5, 10)
    random.seed(12345)
    
    for u_id in [1, 2, 3]:
        base_w = user_baselines[u_id]["weights"][-1] # use latest assessment weight as base
        for day in range(30):
            current_date = (start_log_date + timedelta(days=day)).strftime('%Y-%m-%d')
            
            # Fluctuating trend based on user goal
            if u_id == 1:   # Brayan (bulking)
                w_fluct = base_w + (day * 0.04) + random.uniform(-0.15, 0.15)
            elif u_id == 2: # Maria (cutting)
                w_fluct = base_w - (day * 0.05) + random.uniform(-0.12, 0.12)
            else:           # Carlos (maintenance)
                w_fluct = base_w + random.uniform(-0.18, 0.18)
                
            steps = int(random.gauss(10000, 1200))
            sleep_h = round(random.uniform(6.5, 8.5), 1)
            sleep_q = random.randint(7, 9)
            water = random.choice([2000, 2250, 2500, 2750, 3000])
            energy = random.choice([3, 4, 5])
            digest = random.choice([4, 5])
            adherence = random.randint(8, 10)
            resting_hr = int(random.uniform(56, 64))
            hrv = round(random.uniform(58.0, 72.0), 1)
            
            cursor.execute("""
                INSERT INTO daily_logs (
                    user_id, date, weight_kg, steps_count, sleep_hours, sleep_quality,
                    water_intake_ml, energy_level, digestion_status, diet_adherence, resting_hr, hrv, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                u_id, current_date, round(w_fluct, 2), steps, sleep_h, sleep_q,
                water, energy, digest, adherence, resting_hr, hrv,
                "Registro diario autogenerado consistente."
            ))
            
    print("Seeded exactly 30 daily logs for all 3 users.")
    
    # 6. Seed Workout Plans
    # 1 plan per user + 1 global template
    plans_config = [
        (100, 0, "Plantilla Maestra: Fuerza e Hipertrofia", "Plantilla Global. Enfoque en ganancias de fuerza e hipertrofia funcional.", "2026-01-01", "2026-12-31"),
        (1, 1, "Rutina Calistenia Básica - Brayan", "Plan enfocado en el dominio del peso corporal y volumen muscular.", "2026-05-01", "2026-08-01"),
        (2, 2, "Rutina Tonificación y Resistencia - Maria", "Rutina de alta densidad para tonificación y pérdida de grasa.", "2026-05-01", "2026-08-01"),
        (3, 3, "Rutina Fuerza e Hipertrofia - Carlos", "Enfoque en ganancias de fuerza e hipertrofia funcional.", "2026-05-01", "2026-08-01")
    ]
    
    for plan_id, u_id, title, desc, start, end in plans_config:
        cursor.execute("""
            INSERT INTO workout_plans (id, user_id, title, description, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (plan_id, u_id, title, desc, start, end))
        
        # Each plan has exactly 3 days (order_index 1, 2, 3)
        days = [
            (plan_id * 10 + 1, plan_id, "Día 1: Fuerza Empuje / Torso", 1),
            (plan_id * 10 + 2, plan_id, "Día 2: Tracción / Pierna", 2),
            (plan_id * 10 + 3, plan_id, "Día 3: Core / Fullbody", 3)
        ]
        
        for d in days:
            cursor.execute("INSERT INTO workout_days (id, plan_id, day_name, order_index) VALUES (?, ?, ?, ?)", d)
            d_id = d[0]
            
            # Create a Workout Block for the day
            block_id = d_id * 100
            cursor.execute("INSERT INTO workout_blocks (id, user_id, name, routine_class, description) VALUES (?, ?, ?, ?, ?)", 
                           (block_id, u_id, "Bloque Principal", "Fullbody", "Circuito base"))
            
            # Link Block to Day
            cursor.execute("INSERT INTO workout_day_blocks (workout_day_id, workout_block_id, order_index) VALUES (?, ?, ?)",
                           (d_id, block_id, 1))
            
            # Each block has exactly 3 exercises
            if d[3] == 1:
                # Day 1: Pushups (1), Dips (3), Plank (5)
                exercises = [1, 3, 5]
            elif d[3] == 2:
                # Day 2: Pullups (4), Squats (2), Leg Raises (6)
                exercises = [4, 2, 6]
            else:
                # Day 3: Pushups (1), Squats (2), Plank (5)
                exercises = [1, 2, 5]
                
            for idx, ex_id in enumerate(exercises):
                cursor.execute("""
                    INSERT INTO workout_exercises (workout_block_id, exercise_id, sets_count, reps_range, rpe_target, rest_seconds, notes, order_index)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (block_id, ex_id, 3, "10-12", 8, 90, "Mantén buena técnica.", idx + 1))
                
    print("Seeded exactly 1 workout plan (3 days, 3 exercises per day) for all 3 users.")
    
    # 7. Seed Workout Execution Logs and Set Logs
    # Exactly 12 execution logs per user: Monday, Wednesday, Friday for 4 weeks (May 11 to June 5, 2026).
    weeks_dates = [
        # Week 1
        ("2026-05-11", 1), ("2026-05-13", 2), ("2026-05-15", 3),
        # Week 2
        ("2026-05-18", 1), ("2026-05-20", 2), ("2026-05-22", 3),
        # Week 3
        ("2026-05-25", 1), ("2026-05-27", 2), ("2026-05-29", 3),
        # Week 4
        ("2026-06-01", 1), ("2026-06-03", 2), ("2026-06-05", 3)
    ]
    
    execution_counter = 1
    for u_id in [1, 2, 3]:
        plan_id = u_id
        for week_idx, (date_str, day_order) in enumerate(weeks_dates):
            # Find the workout_day_id for this day order index
            day_num = plan_id * 10 + day_order
            
            cursor.execute("""
                INSERT INTO workout_execution_logs (id, user_id, workout_day_id, date, start_time, end_time, rpe_actual, feeling_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                execution_counter, u_id, day_num, date_str, 
                f"{date_str} 18:00:00", f"{date_str} 19:15:00", 
                random.choice([7, 8, 9]), random.choice([4, 5])
            ))
            
            # Fetch exercises for this day to seed set logs via blocks
            cursor.execute("""
                SELECT we.id, we.exercise_id 
                FROM workout_exercises we
                JOIN workout_day_blocks wdb ON we.workout_block_id = wdb.workout_block_id
                WHERE wdb.workout_day_id = ?
                ORDER BY wdb.order_index ASC, we.order_index ASC
            """, (day_num,))
            w_exercises = cursor.fetchall()
            
            # Generate sets for each of the 3 exercises
            for we_id, ex_id in w_exercises:
                # Establish weight based on exercise and user
                # Carlos (User 3) uses additional weights that increase slightly week over week (overload)
                if u_id == 3:
                    if ex_id == 2: # Squats
                        base_weight = 20.0 + (week_idx * 2.0)
                    elif ex_id == 3: # Dips
                        base_weight = 5.0 + (week_idx * 1.0)
                    else:
                        base_weight = 0.0
                else:
                    base_weight = 0.0 # Bodyweight exercises for Brayan and Maria
                    
                for set_num in range(1, 5): # exactly 4 sets
                    reps = random.choice([10, 11, 12]) if set_num <= 2 else random.choice([8, 9, 10])
                    rpe = 7.0 + (set_num * 0.5)
                    rir = 10 - rpe
                    
                    cursor.execute("""
                        INSERT INTO set_logs (workout_execution_id, workout_exercise_id, set_number, weight_kg, reps_completed, rpe, rir)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (execution_counter, we_id, set_num, base_weight, reps, rpe, rir))
                    
            execution_counter += 1
            
    print("Seeded exactly 12 workout execution logs per user (total 36 sessions) with exactly 4 sets logged per exercise.")
    
    # 8. Seed Nutrition Plans
    # 1 plan per user + 1 global template
    nutrition_config = [
        (100, 0, "Plantilla Maestra: Recomposición Corporal", "Plantilla Global. Ajuste calórico neutro con alta ingesta proteica.", "2026-01-01", "2026-12-31", 2200, 150, 240, 70),
        (1, 1, "Fase Volumen Limpio - Brayan", "Superávit calórico controlado para aumento de masa muscular limpia.", "2026-05-01", "2026-08-01", 2600, 160, 320, 75),
        (2, 2, "Fase Definición Controlada - Maria", "Déficit calórico enfocado en preservar masa magra.", "2026-05-01", "2026-08-01", 1600, 120, 160, 50),
        (3, 3, "Fase Recomposición Corporal - Carlos", "Ajuste calórico neutro con alta ingesta proteica.", "2026-05-01", "2026-08-01", 2200, 150, 240, 70)
    ]
    
    meal_item_counter = 1
    for np_id, u_id, title, desc, start, end, kcal, pro, carb, fat in nutrition_config:
        cursor.execute("""
            INSERT INTO nutrition_plans (id, user_id, title, description, start_date, end_date, target_calories, target_protein, target_carbs, target_fat)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (np_id, u_id, title, desc, start, end, kcal, pro, carb, fat))
        
        # Each plan has exactly 3 meals: Desayuno, Almuerzo, Cena (order_index 1, 2, 3)
        meals = [
            (np_id * 10 + 1, np_id, "Desayuno", 1),
            (np_id * 10 + 2, np_id, "Almuerzo", 2),
            (np_id * 10 + 3, np_id, "Cena", 3)
        ]
        
        for m_id, plan_idx, m_name, order_idx in meals:
            cursor.execute("INSERT INTO meals (id, nutrition_plan_id, meal_name, order_index) VALUES (?, ?, ?, ?)", (m_id, plan_idx, m_name, order_idx))
            
            # Each meal has exactly 2 food items
            if order_idx == 1: # Desayuno
                items = [
                    ("Avena en Hojuelas", 80, int(kcal * 0.15), int(pro * 0.1), int(carb * 0.2), int(fat * 0.1), "Remojar en agua caliente."),
                    ("Claras de Huevo", 150, int(kcal * 0.10), int(pro * 0.25), 2, 0, "Hacer en tortilla con pimentón.")
                ]
            elif order_idx == 2: # Almuerzo
                items = [
                    ("Pechuga de Pollo", 150, int(kcal * 0.25), int(pro * 0.35), 0, int(fat * 0.2), "A la plancha con sal y especias."),
                    ("Arroz Blanco", 200, int(kcal * 0.15), int(pro * 0.05), int(carb * 0.35), 1, "Cocido sin aceite.")
                ]
            else: # Cena
                items = [
                    ("Filete de Salmón", 150, int(kcal * 0.25), int(pro * 0.20), 0, int(fat * 0.45), "Al horno con limón."),
                    ("Camote / Batata", 150, int(kcal * 0.10), int(pro * 0.05), int(carb * 0.18), 1, "Hervido o al horno.")
                ]
                
            for food_name, w_g, item_kcal, item_pro, item_carb, item_fat, notes in items:
                cursor.execute("""
                    INSERT INTO meal_items (id, meal_id, food_name, weight_g, calories_kcal, protein_g, carbs_g, fat_g, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (meal_item_counter, m_id, food_name, w_g, item_kcal, item_pro, item_carb, item_fat, notes))
                meal_item_counter += 1
                
    print("Seeded exactly 1 nutrition plan (3 meals, 2 foods per meal) for all 3 users.")
    
    # Commit changes
    conn.commit()
    
    # 9. Reset auto-increment sequences manually to prevent key conflicts in future inserts
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cursor.fetchall() if not t[0].startswith('sqlite_')]
    for table in tables:
        cursor.execute(f"SELECT MAX(id) FROM {table};")
        max_id = cursor.fetchone()[0]
        if max_id is not None:
            cursor.execute("INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)", (table, max_id))
            
    conn.commit()
    conn.close()
    print("Database seeding completed successfully and auto-increment keys updated.")

if __name__ == "__main__":
    seed_consistent_data()
