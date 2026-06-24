import re

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

def patch_endpoints(text):
    # Regex to find all @app.route functions
    # They look like:
    # @app.post("/api/clients")
    # async def api_create_client(request: Request):
    #     data = await request.json()
    #     handler = FitnessHTTPRequestHandler(request)
    #     handler.handle_create_client(data)
    #     return make_api_response(handler)
    
    # We will insert `if not handler.verify_jwt(): return make_api_response(handler)` right after `handler = FitnessHTTPRequestHandler(request)`
    
    lines = text.split('\\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        if 'handler = FitnessHTTPRequestHandler(request)' in line:
            # check if the route is auth or register or public
            is_public = False
            # Look back to find the route
            for j in range(i, max(-1, i-5), -1):
                if '@app.' in lines[j] and ('/api/auth' in lines[j]):
                    is_public = True
                    break
            
            if not is_public and 'verify_jwt' not in text:
                indent = line.split('handler')[0]
                out.append(indent + 'if not handler.verify_jwt():')
                out.append(indent + '    return make_api_response(handler)')
        i += 1
    return '\\n'.join(out)

new_content = patch_endpoints(content)

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('Endpoints patched for JWT verification.')
