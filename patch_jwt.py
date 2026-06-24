with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

auth_check_method = '''    def verify_jwt(self):
        auth_header = self.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            self.send_error_response(401, "Unauthorized: Missing token")
            return False
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            return True
        except jwt.ExpiredSignatureError:
            self.send_error_response(401, "Unauthorized: Token expired")
            return False
        except jwt.InvalidTokenError:
            self.send_error_response(401, "Unauthorized: Invalid token")
            return False
'''

if 'def verify_jwt(self):' not in content:
    content = content.replace('def get_request_trainer(self):', auth_check_method + '\n    def get_request_trainer(self):')
    
    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Added verify_jwt to handler')
else:
    print('verify_jwt already present')
