with open('server.py', 'r', encoding='utf-8') as f:
    c = f.read()

handler_func = '''    def handle_admin_reset_password(self, data):
        target_type = data.get('target_type')
        target_id = data.get('target_id')
        new_password = data.get('new_password')
        trainer_nick = data.get('trainer_nick')
        
        if not target_type or not target_id or not new_password:
            self.send_error_response(400, 'Missing fields')
            return
            
        hashed_pwd = get_password_hash(new_password)
        
        if target_type == 'trainer':
            conn = sqlite3.connect(MASTER_DB_PATH)
            cur = conn.cursor()
            cur.execute('UPDATE trainers SET password = ? WHERE id = ?', (hashed_pwd, target_id))
            conn.commit()
            conn.close()
        elif target_type == 'client':
            if not trainer_nick:
                self.send_error_response(400, 'Missing trainer_nick for client reset')
                return
            db_path = get_tenant_db_path(trainer_nick)
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute('UPDATE users SET password = ? WHERE id = ?', (hashed_pwd, target_id))
            conn.commit()
            conn.close()
        else:
            self.send_error_response(400, 'Invalid target_type')
            return
            
        self.send_json_response(200, {'success': True, 'message': 'Password reset successfully'})
'''

route = '''@app.post("/api/admin/reset_password")
async def api_admin_reset_password(request: Request):
    data = await request.json()
    handler = FitnessHTTPRequestHandler(request)
    if not handler.verify_jwt():
        return make_api_response(handler)
    handler.handle_admin_reset_password(data)
    return make_api_response(handler)
'''

if 'def handle_admin_reset_password' not in c:
    c = c.replace('def handle_admin_verify(self, data):', handler_func + '\n    def handle_admin_verify(self, data):')
    c = c.replace('@app.post("/api/admin/verify")', route + '\n@app.post("/api/admin/verify")')
    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Reset password endpoint added.')
else:
    print('Already added.')
