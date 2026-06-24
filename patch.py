import re

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
if 'import bcrypt' not in content:
    content = content.replace('import json', 'import json\nimport bcrypt\nimport jwt')

# 2. Add JWT secret key and helper functions near top
if 'SECRET_KEY = ' not in content:
    content = content.replace('PORT = int(os.environ.get("PORT", 8080))', 
'''PORT = int(os.environ.get("PORT", 8080))
SECRET_KEY = os.environ.get("JWT_SECRET", "super-secret-key-1234")

def verify_password(plain_password, hashed_password):
    if not hashed_password.startswith("$2b$"):
        return plain_password == hashed_password
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict):
    return jwt.encode(data, SECRET_KEY, algorithm="HS256")
''')

# 3. Patch handle_auth
old_auth_trainer = '''            cursor.execute("SELECT id, name, theme_color FROM trainers WHERE LOWER(nickname) = ? AND password = ?", (nickname, password))
            row = cursor.fetchone()'''
new_auth_trainer = '''            cursor.execute("SELECT id, name, theme_color, password FROM trainers WHERE LOWER(nickname) = ?", (nickname,))
            row = cursor.fetchone()
            if row and not verify_password(password, row[3]):
                row = None'''

content = content.replace(old_auth_trainer, new_auth_trainer)

old_auth_client = '''            cursor.execute("SELECT id, first_name, last_name FROM users WHERE LOWER(nickname) = ? AND password = ?", (nickname, password))
            row = cursor.fetchone()'''
new_auth_client = '''            cursor.execute("SELECT id, first_name, last_name, password FROM users WHERE LOWER(nickname) = ?", (nickname,))
            row = cursor.fetchone()
            if row and not verify_password(password, row[3]):
                row = None'''

content = content.replace(old_auth_client, new_auth_client)

old_auth_trainer_success = '''                self.send_json_response(200, {
                    "success": True, 
                    "type": "trainer",
                    "nickname": nickname,
                    "name": row[1],
                    "themeColor": row[2]
                })'''
new_auth_trainer_success = '''                token = create_access_token({"sub": nickname, "type": "trainer"})
                self.send_json_response(200, {
                    "success": True, 
                    "type": "trainer",
                    "nickname": nickname,
                    "name": row[1],
                    "themeColor": row[2],
                    "token": token
                })'''
content = content.replace(old_auth_trainer_success, new_auth_trainer_success)

old_auth_client_success = '''                self.send_json_response(200, {
                    "success": True, 
                    "type": "client",
                    "userId": row[0],
                    "name": f"{row[1]} {row[2]}"
                })'''
new_auth_client_success = '''                token = create_access_token({"sub": nickname, "type": "client", "user_id": row[0]})
                self.send_json_response(200, {
                    "success": True, 
                    "type": "client",
                    "userId": row[0],
                    "name": f"{row[1]} {row[2]}",
                    "token": token
                })'''
content = content.replace(old_auth_client_success, new_auth_client_success)

# 4. Patch handle_register_trainer
old_register_trainer = '''            cursor.execute("""
                INSERT INTO trainers (name, nickname, email, password, theme_color)
                VALUES (?, ?, ?, ?, ?)
            """, (name, nickname, email, password, theme_color))'''
new_register_trainer = '''            hashed_pwd = get_password_hash(password)
            cursor.execute("""
                INSERT INTO trainers (name, nickname, email, password, theme_color)
                VALUES (?, ?, ?, ?, ?)
            """, (name, nickname, email, hashed_pwd, theme_color))'''
content = content.replace(old_register_trainer, new_register_trainer)

# 5. Patch handle_create_client
old_create_client = '''            cursor.execute("""
                INSERT INTO users (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, password))'''
new_create_client = '''            hashed_pwd = get_password_hash(password)
            cursor.execute("""
                INSERT INTO users (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (first_name, last_name, email, phone, birthdate, height_cm, blood_type, allergies, medications, availability_schedule, nickname, hashed_pwd))'''
content = content.replace(old_create_client, new_create_client)

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('server.py patched successfully.')
