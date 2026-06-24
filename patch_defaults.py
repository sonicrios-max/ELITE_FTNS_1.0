with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_mig = '''                new_pass = "123456"'''
new_mig = '''                new_pass = get_password_hash("123456")'''
content = content.replace(old_mig, new_mig)

old_mig2 = '''                VALUES (0, 'Sistema', 'Plantillas', 'sistema@elitecoach.local', 0, 'sistema', '123456')'''
new_mig2 = f'''                VALUES (0, 'Sistema', 'Plantillas', 'sistema@elitecoach.local', 0, 'sistema', '{{get_password_hash("123456")}}')'''
content = content.replace(old_mig2, new_mig2)

old_mig3 = '''            INSERT INTO trainers (name, nickname, email, password, theme_color)
            VALUES ('Elite Coach Admin', 'admin', 'admin@elitecoach.local', 'admin', '#f3ca4c')'''
new_mig3 = f'''            INSERT INTO trainers (name, nickname, email, password, theme_color)
            VALUES ('Elite Coach Admin', 'admin', 'admin@elitecoach.local', '{{get_password_hash("admin")}}', '#f3ca4c')'''
content = content.replace(old_mig3, new_mig3)

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Migration defaults patched.')
