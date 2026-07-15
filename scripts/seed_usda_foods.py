import json
import os
import sqlite3
import urllib.request
import urllib.parse
import time
import glob

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(BASE_DIR, "FoodData_Central_foundation_food_json_2026-04-30", "FoodData_Central_foundation_food_json_2026-04-30.json")
DB_TENANTS_DIR = os.path.join(BASE_DIR, "database", "tenants")
SEED_TENANTS_DIR = os.path.join(BASE_DIR, "seed_data", "tenants")

# Dictionary for post-processing translations
POST_PROCESS_DICT = {
    "wild caught": "salvaje",
    "farm raised": "de criadero",
    "raw": "crudo",
    "canned": "enlatado",
    "frozen": "congelado",
    "unsweetened": "sin azúcar",
    "sweetened": "endulzado",
    "dry roasted": "tostado en seco",
    "commercial": "comercial",
    "with salt added": "con sal",
    "without salt": "sin sal",
    "boneless": "sin hueso",
    "skinless": "sin piel",
    "with skin": "con piel",
    "boiled": "hervido",
    "cooked": "cocido",
    "roasted": "rostizado",
    "baked": "horneado",
    "drained solids": "sólidos escurridos",
    "regular pack": "empaque regular",
    "fluid": "líquido",
    "whole": "entero",
    "white": "blanco",
    "green": "verde",
    "red": "rojo",
    "yellow": "amarillo",
    "grade a": "grado A",
    "large": "grande",
    "peeled": "pelado",
    "seeded": "sin semillas",
    "seedless": "sin semillas",
    "sliced": "rebanado",
    "plain": "natural",
    "nonfat": "sin grasa",
    "whole milk": "leche entera",
    "butter": "mantequilla",
    "cheese": "queso",
    "yoghurt": "yogur",
    "yogurt": "yogur",
    "all-purpose": "multiusos",
    "all purpose": "multiusos",
    "juice": "jugo",
    "concentrate": "concentrado"
}

def translate_en_to_es(text):
    if not text:
        return ""
    url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=" + urllib.parse.quote(text)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            res_json = json.loads(res_data)
            translated = "".join([sentence[0] for sentence in res_json[0]])
            return translated
    except Exception as e:
        print(f"Error en traducción simple de '{text}': {e}")
        return None

def translate_batch(texts):
    # Join with unique delimiter ' || ' (spaces around double pipe)
    delimiter = " || "
    joined = delimiter.join(texts)
    translated_joined = translate_en_to_es(joined)
    
    if not translated_joined:
        # Fallback to individual
        print("Fallo de traducción en lote. Cambiando a traducción individual...")
        return [translate_en_to_es(t) for t in texts]
        
    # Split back
    translated_texts = [t.strip() for t in translated_joined.split("||")]
    
    # Verify split count matches
    if len(translated_texts) != len(texts):
        print(f"Discrepancia en traducción de lote: se enviaron {len(texts)} y se recibieron {len(translated_texts)}. Reintentando uno por uno...")
        res = []
        for t in texts:
            val = translate_en_to_es(t)
            res.append(val if val else t)
            time.sleep(0.1) # Small delay to respect rate limit
        return res
        
    return translated_texts

def post_process_translation(translated_text, original_en):
    if not translated_text:
        return ""
        
    # Perform clean-up on translated text based on common terms
    lowered_es = translated_text.lower()
    lowered_en = original_en.lower()
    
    # Apply substitutions if they appear in original/translation
    # For example, to make sure "raw" translates properly depending on gender:
    if "chicken" in lowered_en or "breast" in lowered_en or "pechuga" in lowered_es:
        # Feminine gender
        translated_text = translated_text.replace("crudo", "cruda")
        translated_text = translated_text.replace("congelado", "congelada")
        translated_text = translated_text.replace("hervido", "hervida")
    elif "water" in lowered_en or "agua" in lowered_es:
        translated_text = translated_text.replace("crudo", "cruda")
        
    # Replace common terms from post-processing dictionary
    # E.g. to ensure "wild caught" translates to a natural culinary word
    for en_term, es_term in POST_PROCESS_DICT.items():
        # check if it translates to literal bad words, replace it
        if en_term in lowered_en:
            # Check translation variations
            if en_term == "wild caught" and "salvaje" not in lowered_es:
                translated_text += " (salvaje)"
                
    # Normalize spacing and title case/sentence case
    translated_text = translated_text.strip().strip('.')
    if len(translated_text) > 1:
        # Capitalize first letter
        translated_text = translated_text[0].upper() + translated_text[1:]
        
    return translated_text

def extract_macros(food):
    protein = 0.0
    fat = 0.0
    carbs = 0.0
    calories = 0
    sugars = 0.0
    
    for nut_entry in food.get("foodNutrients", []):
        nutrient_info = nut_entry.get("nutrient", {})
        nut_id = nutrient_info.get("id")
        nut_name = nutrient_info.get("name", "").lower()
        nut_unit = nutrient_info.get("unitName", "").lower()
        amount = nut_entry.get("amount", 0.0)
        
        # Verify units are standard (grams for macros, kcal for energy)
        if nut_id == 1003 or "protein" in nut_name:
            if nut_unit == "g":
                protein = float(amount)
        elif nut_id in (1004, 1085) or "total lipid" in nut_name or "total fat" in nut_name:
            if nut_unit == "g":
                fat = float(amount)
        elif nut_id == 1005 or "carbohydrate" in nut_name:
            if nut_unit == "g":
                carbs = float(amount)
        elif nut_id == 1063 or "sugars, total" in nut_name:
            if nut_unit == "g":
                sugars = float(amount)
        elif nut_unit == "kcal" and ("energy" in nut_name or nut_id in (1008, 2047, 2048)):
            if nut_id == 1008:
                calories = int(amount)
            elif calories == 0:
                calories = int(amount)
                
    if carbs == 0.0 and sugars > 0.0:
        carbs = sugars
        
    # Fallback calorie estimation if energy is missing or 0
    if calories == 0 and (protein > 0 or carbs > 0 or fat > 0):
        calories = int(round(protein * 4.0 + carbs * 4.0 + fat * 9.0))
        
    return {
        "calories": calories,
        "protein": round(protein, 2),
        "carbs": round(carbs, 2),
        "fat": round(fat, 2)
    }

def map_category(usda_cat):
    if not usda_cat:
        return "Otros"
    cat_lower = usda_cat.lower()
    if any(kw in cat_lower for kw in ("poultry", "beef", "pork", "finfish", "shellfish", "sausages", "meat", "chicken", "turkey")):
        return "Carnes y Pescados"
    elif "fruit" in cat_lower:
        return "Frutas"
    elif "vegetable" in cat_lower or "kale" in cat_lower:
        return "Verduras"
    elif any(kw in cat_lower for kw in ("grain", "cereal", "pasta", "legume", "baked", "bread", "wheat", "rice", "oat")):
        return "Granos y Cereales"
    elif "dairy" in cat_lower or "egg" in cat_lower:
        return "Lácteos y Huevos"
    elif "fat" in cat_lower or "oil" in cat_lower:
        return "Aceites y Grasas"
    elif "nut" in cat_lower or "seed" in cat_lower:
        return "Nueces y Semillas"
    else:
        return "Otros"

def main():
    print(f"Cargando dataset USDA desde {JSON_PATH}...")
    if not os.path.exists(JSON_PATH):
        print(f"Error: No se encontró el archivo JSON en {JSON_PATH}")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    raw_foods = data.get("FoundationFoods", [])
    print(f"Total alimentos crudos en JSON: {len(raw_foods)}")

    # 1. Definir los alimentos por defecto del proyecto y tradicionales colombianos
    # E.g. (name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g)
    seeded_foods = [
        ("Pechuga de Pollo", "Chicken Breast", "Carnes y Pescados", 100.0, 165, 31.0, 0.0, 3.6),
        ("Arroz Blanco", "White Rice", "Granos y Cereales", 100.0, 130, 2.7, 28.0, 0.3),
        ("Avena en Hojuelas", "Rolled Oats", "Granos y Cereales", 100.0, 389, 16.9, 66.3, 6.9),
        ("Huevo Entero", "Whole Egg", "Lácteos y Huevos", 100.0, 155, 13.0, 1.1, 11.0),
        ("Filete de Salmón", "Salmon Fillet", "Carnes y Pescados", 100.0, 208, 20.0, 0.0, 13.0),
        
        # Alimentos colombianos tradicionales (frutas y afines)
        ("Limón", "Lemon / Lime", "Frutas", 100.0, 29, 1.1, 9.3, 0.3),
        ("Lima limón", "Lemon-lime", "Frutas", 100.0, 30, 0.7, 10.5, 0.2),
        ("Guayaba", "Guava", "Frutas", 100.0, 68, 2.6, 14.3, 1.0),
        ("Tomate de árbol", "Tamarillo / Tree tomato", "Frutas", 100.0, 31, 2.0, 3.8, 0.1),
        ("Maracuyá", "Passion fruit", "Frutas", 100.0, 97, 2.2, 23.4, 0.7),
        ("Gulupa", "Purple passion fruit / Gulupa", "Frutas", 100.0, 97, 2.2, 23.4, 0.7),
        ("Lulo", "Naranjilla / Lulo", "Frutas", 100.0, 25, 0.6, 5.9, 0.2),
        ("Uchuvas", "Goldenberry / Cape gooseberry / Physalis", "Frutas", 100.0, 53, 1.9, 11.2, 0.7),
        ("Granadilla", "Sweet passion fruit / Granadilla", "Frutas", 100.0, 94, 2.2, 22.0, 0.7),
        ("Banano Cavendish", "Cavendish Banana", "Frutas", 100.0, 89, 1.1, 22.8, 0.3),
        ("Banano manzano o bocadillo", "Baby banana", "Frutas", 100.0, 90, 1.2, 23.0, 0.3),
        ("Coco, pulpa cruda", "Coconut, raw pulp", "Nueces y Semillas", 100.0, 354, 3.3, 15.2, 33.5),
        ("Agua de coco", "Coconut water", "Otros", 100.0, 19, 0.7, 3.7, 0.2),
        ("Mango", "Mango", "Frutas", 100.0, 60, 0.8, 15.0, 0.3),
        ("Aguacate", "Avocado", "Frutas", 100.0, 160, 2.0, 8.5, 14.7),
        
        # Nuevas adiciones de frutas exóticas y tradicionales colombianas
        ("Chontaduro", "Peach palm fruit", "Frutas", 100.0, 185, 3.3, 37.6, 5.8),
        ("Mangostino", "Mangosteen", "Frutas", 100.0, 73, 0.4, 18.0, 0.6),
        ("Ciruela costeña", "Colombian wild plum", "Frutas", 100.0, 46, 0.7, 11.4, 0.3),
        ("Mamoncillo", "Spanish lime", "Frutas", 100.0, 58, 0.6, 13.5, 0.2),
        ("Guama", "Ice cream bean", "Frutas", 100.0, 60, 1.0, 15.0, 0.2),
        ("Caimito", "Star apple", "Frutas", 100.0, 67, 1.0, 15.0, 0.4),
        ("Feijoa", "Feijoa / Pineapple guava", "Frutas", 100.0, 55, 1.0, 13.0, 0.6),
        ("Pitaya amarilla", "Yellow dragon fruit", "Frutas", 100.0, 50, 1.1, 11.5, 0.4),
        ("Guanábana", "Soursop", "Frutas", 100.0, 66, 1.0, 16.8, 0.3),
        ("Corozo", "Corozo fruit", "Frutas", 100.0, 45, 0.8, 11.0, 0.2),
        ("Arazá", "Amazonian guava / Araza", "Frutas", 100.0, 32, 0.8, 7.2, 0.2),
        ("Zapote", "Sapote", "Frutas", 100.0, 124, 1.5, 32.0, 0.6),
        ("Borojó", "Borojo", "Frutas", 100.0, 93, 1.1, 24.7, 0.2),
        ("Algarrobo", "Locust bean / Algarrobo", "Frutas", 100.0, 380, 4.8, 89.0, 0.9),
        ("Níspero", "Sapodilla / Nispero", "Frutas", 100.0, 83, 0.4, 20.0, 1.1),
        ("Copoazú", "Cupuacu", "Frutas", 100.0, 72, 0.8, 14.8, 2.0),
        ("Camu Camu", "Camu Camu", "Frutas", 100.0, 24, 0.4, 5.9, 0.2),
        ("Tamarindo", "Tamarind", "Frutas", 100.0, 239, 2.8, 62.5, 0.6)
    ]
    
    # Keep track of existing names (in Spanish and English) to avoid duplicates
    seen_names = {
        "pechuga de pollo", "arroz blanco", "avena en hojuelas", "huevo entero", "filete de salmón",
        "limón", "lima limón", "guayaba", "tomate de árbol", "maracuyá", "gulupa", "lulo", "uchuvas",
        "granadilla", "banano cavendish", "banano manzano o bocadillo", "coco, pulpa cruda", "agua de coco",
        "mango", "aguacate", "chontaduro", "mangostino", "ciruela costeña", "mamoncillo", "guama", "caimito",
        "feijoa", "pitaya amarilla", "guanábana", "corozo", "arazá", "zapote", "borojó", "algarrobo",
        "níspero", "copoazú", "camu camu", "tamarindo"
    }
    seen_names_en = {
        "chicken breast", "white rice", "rolled oats", "whole egg", "salmon fillet",
        "lemon / lime", "lemon-lime", "guava", "tamarillo / tree tomato", "passion fruit",
        "purple passion fruit / gulupa", "naranjilla / lulo", "goldenberry / cape gooseberry / physalis",
        "sweet passion fruit / granadilla", "cavendish banana", "baby banana", "coconut, raw pulp",
        "coconut water", "mango", "avocado", "peach palm fruit", "mangosteen", "colombian wild plum",
        "spanish lime", "ice cream bean", "star apple", "feijoa / pineapple guava", "yellow dragon fruit",
        "soursop", "corozo fruit", "amazonian guava / araza", "sapote", "borojo", "locust bean / algarrobo",
        "sapodilla / nispero", "cupuacu", "camu camu", "tamarind"
    }

    # Process USDA foods
    print("Extrayendo información nutricional y traduciendo nombres...")
    to_translate = []
    
    for food in raw_foods:
        if not food:
            continue
        desc = food.get("description", "").strip()
        if not desc:
            continue
            
        # Extract macros
        macros = extract_macros(food)
        
        # Categorize
        usda_cat = food.get("foodCategory", {}).get("description", "")
        category = map_category(usda_cat)
        
        # Prepare for batch translation
        to_translate.append((desc, macros, category))

    # Translate in batches of 15
    batch_size = 15
    translated_count = 0
    total_to_translate = len(to_translate)
    
    print(f"Iniciando traducción de {total_to_translate} nombres en lotes de {batch_size}...")
    for idx in range(0, total_to_translate, batch_size):
        chunk = to_translate[idx:idx+batch_size]
        en_names = [item[0] for item in chunk]
        
        # Translate the batch
        es_names = translate_batch(en_names)
        
        for (original_en, macros, category), es_name in zip(chunk, es_names):
            if not es_name:
                es_name = original_en # Fallback to English if translation failed
                
            es_name_clean = post_process_translation(es_name, original_en)
            
            # De-duplicate check
            name_key = es_name_clean.lower()
            en_key = original_en.lower()
            
            if name_key not in seen_names and en_key not in seen_names_en:
                seen_names.add(name_key)
                seen_names_en.add(en_key)
                
                # Append: (name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g)
                seeded_foods.append((
                    es_name_clean,
                    original_en,
                    category,
                    100.0,
                    macros["calories"],
                    macros["protein"],
                    macros["carbs"],
                    macros["fat"]
                ))
        
        translated_count += len(chunk)
        print(f"  -> Traducidos {translated_count}/{total_to_translate}...")
        time.sleep(0.2) # Small cooldown to prevent rate limit triggers

    print(f"Proceso de traducción completado. Total de alimentos finales a sembrar: {len(seeded_foods)}")

    # 2. Buscar todas las bases de datos de inquilinos activas y de plantilla
    target_dbs = []
    
    # Active DB directory
    if os.path.exists(DB_TENANTS_DIR):
        target_dbs.extend(glob.glob(os.path.join(DB_TENANTS_DIR, "trainer_*.db")))
        
    # Seed DB directory
    if os.path.exists(SEED_TENANTS_DIR):
        target_dbs.extend(glob.glob(os.path.join(SEED_TENANTS_DIR, "trainer_*.db")))

    if not target_dbs:
        print("No se encontraron bases de datos de inquilinos (trainer_*.db) para actualizar.")
        return

    print(f"Se encontraron {len(target_dbs)} bases de datos para actualizar:")
    for db in target_dbs:
        print(f"  - {db}")

    # 3. Aplicar migraciones e insertar alimentos en cada base de datos
    for db_path in target_dbs:
        print(f"\nProcesando base de datos: {os.path.basename(db_path)}")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        try:
            # A. Migración: Agregar columnas si no existen
            cursor.execute("PRAGMA table_info(food_library)")
            columns = [row[1] for row in cursor.fetchall()]
            if "name_en" not in columns:
                print("  -> Ejecutando migración: Agregando columna 'name_en' a 'food_library'...")
                cursor.execute("ALTER TABLE food_library ADD COLUMN name_en TEXT")
                conn.commit()
                
            if "category" not in columns:
                print("  -> Ejecutando migración: Agregando columna 'category' a 'food_library'...")
                cursor.execute("ALTER TABLE food_library ADD COLUMN category TEXT")
                conn.commit()
                
            # B. Limpiar la tabla de alimentos existente
            cursor.execute("DELETE FROM food_library")
            conn.commit()
            
            # C. Insertar los alimentos consolidados
            # E.g. (name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g)
            cursor.executemany("""
                INSERT OR IGNORE INTO food_library (name, name_en, category, weight_g, calories_kcal, protein_g, carbs_g, fat_g)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, seeded_foods)
            conn.commit()
            
            # Verificar recuento de inserción
            cursor.execute("SELECT COUNT(*) FROM food_library")
            count = cursor.fetchone()[0]
            print(f"  -> Sembrado exitoso: {count} alimentos en 'food_library'")
            
        except Exception as e:
            print(f"  -> Error procesando base de datos: {e}")
        finally:
            conn.close()

    print("\n¡Sembrado e importación del catálogo USDA completados de forma exitosa!")

if __name__ == "__main__":
    main()
