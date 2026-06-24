import os
import re

files_to_check = []
for r, d, files in os.walk('web'):
    for f in files:
        if f.endswith('.html') or f.endswith('.js'):
            files_to_check.append(os.path.join(r, f))

for filepath in files_to_check:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        continue
    
    modified = False
    
    # Check if there are modals
    if 'style.display' in content:
        # Replace open modal display = 'flex'
        new_content, n = re.subn(r'(\.style\.display\s*=\s*[\'\"`](flex|block)[\'\"`]\s*;)(?!.*\bbody\.style\.overflow)', r'\1 document.body.style.overflow = \'hidden\';', content)
        if n > 0: modified = True
        content = new_content
        
        # Replace close modal display = 'none'
        new_content, n = re.subn(r'(\.style\.display\s*=\s*[\'\"`]none[\'\"`]\s*;)(?!.*\bbody\.style\.overflow)', r'\1 document.body.style.overflow = \'\';', content)
        if n > 0: modified = True
        content = new_content

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Patched JS styles in {filepath}')
