import os

with open("server.py", "r", encoding="utf-8") as f:
    content = f.read()

handlers_code = """
    def handle_update_exercise(self, data):
        ex_id = data.get('id')
        name = data.get('name')
        if not ex_id or not name:
            self.send_error_response(400, "Missing id or name")
            return
        import sqlite3
        from constants import DB_PATH
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                UPDATE exercises SET name=?, primary_muscle=?, secondary_muscles=?, equipment=?, video_url=?
                WHERE id=?
            ''', (name, data.get('primary_muscle'), data.get('secondary_muscles'), data.get('equipment'), data.get('video_url'), ex_id))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_delete_exercise(self, data):
        ex_id = data.get('id')
        import sqlite3
        from constants import DB_PATH
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM exercises WHERE id=?", (ex_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_update_block(self, data):
        block_id = data.get('id')
        name = data.get('name')
        exercises = data.get('exercises', [])
        if not block_id or not name:
            self.send_error_response(400, "Missing id or name")
            return
        import sqlite3
        from constants import DB_PATH
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE workout_blocks SET name=?, routine_class=?, description=? WHERE id=?", 
                          (name, data.get('routine_class'), data.get('description'), block_id))
            cursor.execute("DELETE FROM workout_exercises WHERE workout_block_id=?", (block_id,))
            for ex in exercises:
                cursor.execute('''
                    INSERT INTO workout_exercises (workout_block_id, exercise_id, sets_count, reps_range, rpe_target, order_index)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (block_id, ex.get('exercise_id'), ex.get('sets_count'), ex.get('reps_range'), ex.get('rpe_target'), ex.get('order_index')))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_delete_block(self, data):
        block_id = data.get('id')
        import sqlite3
        from constants import DB_PATH
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM workout_blocks WHERE id=?", (block_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_update_routine(self, data):
        plan_id = data.get('id')
        title = data.get('title')
        days = data.get('days', [])
        if not plan_id or not title:
            self.send_error_response(400, "Missing id or title")
            return
        import sqlite3
        from constants import DB_PATH
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE workout_plans SET title=?, description=? WHERE id=?", 
                          (title, data.get('description'), plan_id))
            cursor.execute("SELECT id FROM workout_days WHERE plan_id=?", (plan_id,))
            for (od_id,) in cursor.fetchall():
                cursor.execute("DELETE FROM workout_day_blocks WHERE workout_day_id=?", (od_id,))
            cursor.execute("DELETE FROM workout_days WHERE plan_id=?", (plan_id,))
            for day in days:
                cursor.execute("INSERT INTO workout_days (plan_id, day_name, order_index) VALUES (?, ?, ?)", 
                              (plan_id, day.get('day_name'), day.get('order_index')))
                day_id = cursor.lastrowid
                for b_idx, block_id in enumerate(day.get('block_ids', [])):
                    cursor.execute("INSERT INTO workout_day_blocks (workout_day_id, workout_block_id, order_index) VALUES (?, ?, ?)", 
                                  (day_id, block_id, b_idx+1))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    def handle_delete_routine(self, data):
        plan_id = data.get('id')
        import sqlite3
        from constants import DB_PATH
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("DELETE FROM workout_plans WHERE id=?", (plan_id,))
            conn.commit()
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

def run_server():
"""

if "def run_server():" in content:
    content = content.replace("def run_server():", handlers_code)
    with open("server.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("Funciones inyectadas con éxito en server.py")
else:
    print("No se encontró el ancla de inyección")
