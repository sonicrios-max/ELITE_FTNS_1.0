import os

def patch_js_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Add Authorization header to global fetch interceptor
    old_fetch = "    options.headers['X-Trainer-Id'] = trainerId;"
    new_fetch = "    options.headers['X-Trainer-Id'] = trainerId;\n    const token = localStorage.getItem('jwtToken');\n    if(token) options.headers['Authorization'] = 'Bearer ' + token;"
    if old_fetch in content and new_fetch not in content:
        content = content.replace(old_fetch, new_fetch)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

patch_js_file('web/trainer/trainer.js')
patch_js_file('web/client/client.js')

with open('web/index.html', 'r', encoding='utf-8') as f:
    idx_content = f.read()

# Add JWT to localStorage
old_trainer_login = "                    localStorage.setItem('trainerTheme', data.themeColor || '#f3ca4c');"
new_trainer_login = "                    localStorage.setItem('trainerTheme', data.themeColor || '#f3ca4c');\n                    localStorage.setItem('jwtToken', data.token);"
idx_content = idx_content.replace(old_trainer_login, new_trainer_login)

old_client_login = "                    localStorage.setItem('userName', data.name);"
new_client_login = "                    localStorage.setItem('userName', data.name);\n                    localStorage.setItem('jwtToken', data.token);"
idx_content = idx_content.replace(old_client_login, new_client_login)

with open('web/index.html', 'w', encoding='utf-8') as f:
    f.write(idx_content)
print('Frontend fetch and login patched for JWT.')
