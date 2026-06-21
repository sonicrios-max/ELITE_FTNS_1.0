-- SQLite Schema for Personal Fitness Database

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    birthdate DATE,
    height_cm REAL NOT NULL,
    blood_type TEXT,
    allergies TEXT,
    medications TEXT,
    availability_schedule TEXT, -- JSON representation of days/hours
    nickname TEXT UNIQUE,
    password TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Anthropometric Assessments (includes smart scale metrics + circumferences)
CREATE TABLE IF NOT EXISTS anthropometric_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL,
    weight_kg REAL NOT NULL,
    height_cm REAL NOT NULL,
    bmi REAL NOT NULL, -- We'll calculate and insert manually to avoid SQLite compatibility edge cases
    fc_max INTEGER,
    fc_rep INTEGER,
    
    -- Smart Scale Metrics (optional inputs)
    muscle_mass_pct REAL,
    body_water_pct REAL,
    visceral_fat_rating INTEGER,
    bone_mass_kg REAL,
    basal_metabolic_rate_kcal INTEGER,
    
    -- Circumferences (cm)
    neck REAL,
    chest REAL,
    shoulder REAL,
    abdomen REAL,
    iliac REAL,
    trochanter REAL,
    right_thigh REAL,
    left_thigh REAL,
    right_calf REAL,
    left_calf REAL,
    right_bicep REAL,
    left_bicep REAL,
    right_forearm REAL,
    left_forearm REAL,
    
    -- Custom Dynamic Fields (JSON string)
    custom_data TEXT,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2.1 Trainer Custom Assessment Configuration
CREATE TABLE IF NOT EXISTS assessment_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'number', -- 'number', 'text'
    unit TEXT,
    is_default BOOLEAN DEFAULT 0,
    db_column TEXT, -- points to native column if is_default is true
    is_active BOOLEAN DEFAULT 1,
    order_index INTEGER DEFAULT 0
);

-- 3. Skinfold Assessments (Adipometry)
CREATE TABLE IF NOT EXISTS skinfold_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER UNIQUE NOT NULL, -- linked to the main assessment
    scapular REAL,
    triceps REAL,
    abdominal REAL,
    iliac REAL,
    inner_thigh REAL,
    mid_thigh REAL,
    medial_calf REAL,
    chest REAL,
    biceps REAL,
    sum_folds REAL,
    body_fat_percentage REAL, -- Calculated via Faulkner or Jackson-Pollock
    fat_mass_kg REAL,
    lean_mass_kg REAL,
    FOREIGN KEY (assessment_id) REFERENCES anthropometric_assessments(id) ON DELETE CASCADE
);

-- 4. Daily Log (tracking variables submitted via mobile app)
CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL,
    weight_kg REAL,
    steps_count INTEGER,
    sleep_hours REAL,
    sleep_quality INTEGER CHECK(sleep_quality BETWEEN 1 AND 10),
    water_intake_ml INTEGER,
    energy_level INTEGER CHECK(energy_level BETWEEN 1 AND 5),
    digestion_status INTEGER CHECK(digestion_status BETWEEN 1 AND 5),
    diet_adherence INTEGER CHECK(diet_adherence BETWEEN 1 AND 10),
    resting_hr INTEGER,
    hrv REAL,
    notes TEXT,
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Exercise Library
CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    routine_class TEXT DEFAULT 'Fullbody', -- e.g., Fuerza, Empuje, Tracción, Pierna, Core, Fullbody
    primary_muscle TEXT NOT NULL,
    secondary_muscles TEXT, -- comma-separated
    equipment TEXT,
    video_url TEXT, -- URL to custom media asset
    image_url TEXT
);

-- 5.1 Workout Blocks (Rutinas de Grupo Muscular)
CREATE TABLE IF NOT EXISTS workout_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, -- ID 0 para Plantillas Globales
    name TEXT NOT NULL,
    routine_class TEXT NOT NULL, -- Clasificación principal del bloque
    description TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Workout Routine Plans
CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. Training Days in a Plan (e.g., Push, Pull, Legs)
CREATE TABLE IF NOT EXISTS workout_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    day_name TEXT NOT NULL, -- e.g., "Día 1: Torso"
    order_index INTEGER NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
);

-- 7.1 Blocks inside a Training Day
CREATE TABLE IF NOT EXISTS workout_day_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_day_id INTEGER NOT NULL,
    workout_block_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    FOREIGN KEY (workout_day_id) REFERENCES workout_days(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_block_id) REFERENCES workout_blocks(id) ON DELETE CASCADE
);

-- 8. Exercises in a Workout Block
CREATE TABLE IF NOT EXISTS workout_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_block_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    sets_count INTEGER NOT NULL,
    reps_range TEXT NOT NULL, -- e.g., "8-12"
    rpe_target INTEGER, -- e.g., 8
    rest_seconds INTEGER, -- e.g., 90
    notes TEXT,
    order_index INTEGER NOT NULL,
    FOREIGN KEY (workout_block_id) REFERENCES workout_blocks(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

-- 9. Workout Execution Logs (Daily tracking)
CREATE TABLE IF NOT EXISTS workout_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    workout_day_id INTEGER NOT NULL,
    date DATE NOT NULL,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    rpe_actual INTEGER,
    feeling_score INTEGER, -- 1 to 5
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_day_id) REFERENCES workout_days(id) ON DELETE CASCADE
);

-- 10. Individual Sets logged during a workout
CREATE TABLE IF NOT EXISTS set_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_execution_id INTEGER NOT NULL,
    workout_exercise_id INTEGER NOT NULL,
    set_number INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    reps_completed INTEGER NOT NULL,
    rpe REAL,
    rir REAL,
    FOREIGN KEY (workout_execution_id) REFERENCES workout_execution_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
);

-- 11. Nutrition Plans
CREATE TABLE IF NOT EXISTS nutrition_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    target_calories INTEGER,
    target_protein INTEGER,
    target_carbs INTEGER,
    target_fat INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 12. Meals (e.g. Desayuno, Almuerzo, Cena)
CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nutrition_plan_id INTEGER NOT NULL,
    meal_name TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    FOREIGN KEY (nutrition_plan_id) REFERENCES nutrition_plans(id) ON DELETE CASCADE
);

-- 13. Meal Items (specific foods in a meal)
CREATE TABLE IF NOT EXISTS meal_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    food_name TEXT NOT NULL,
    weight_g REAL NOT NULL,
    calories_kcal INTEGER NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    notes TEXT,
    custom_data TEXT, -- JSON representation of custom dynamic nutritional values
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);

-- 14. Trainer Custom Nutrition Configuration
CREATE TABLE IF NOT EXISTS nutrition_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'number', -- 'number', 'text'
    unit TEXT,
    is_default BOOLEAN DEFAULT 0,
    db_column TEXT, -- points to native column if is_default is true
    is_active BOOLEAN DEFAULT 1,
    order_index INTEGER DEFAULT 0
);

-- 15. Global Food/Ingredient Library
CREATE TABLE IF NOT EXISTS food_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    weight_g REAL NOT NULL DEFAULT 100,
    calories_kcal INTEGER NOT NULL DEFAULT 0,
    protein_g REAL NOT NULL DEFAULT 0,
    carbs_g REAL NOT NULL DEFAULT 0,
    fat_g REAL NOT NULL DEFAULT 0,
    custom_data TEXT -- JSON representation of custom dynamic nutritional values
);
