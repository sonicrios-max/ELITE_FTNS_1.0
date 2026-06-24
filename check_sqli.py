with open('server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if 'execute(' in line:
            if '%' in line or 'f"' in line or "f'" in line or 'format(' in line:
                print(f'{i+1}: {line.strip()}')
