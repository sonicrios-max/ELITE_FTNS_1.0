with open('web/admin/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_btn_trainer = """<button class="btn-edit" onclick="openTrainerModal(${t.id})"><i class="fa-solid fa-edit"></i> Editar</button>
                        <button class="btn-edit" onclick="resetPassword('trainer', ${t.id}, '${t.nickname}')" style="background: rgba(16, 185, 129, 0.15); color: var(--dev-green); border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-key"></i> Reset Clave</button>"""
content = content.replace('<button class="btn-edit" onclick="openTrainerModal(${t.id})"><i class="fa-solid fa-edit"></i> Editar</button>', new_btn_trainer)

new_btn_client = """<button class="btn-edit" onclick="openClientModal(${c.id})"><i class="fa-solid fa-edit"></i> Editar</button>
                            <button class="btn-edit" onclick="resetPassword('client', ${c.id}, null)" style="background: rgba(16, 185, 129, 0.15); color: var(--dev-green); border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-key"></i> Reset Clave</button>"""
content = content.replace('<button class="btn-edit" onclick="openClientModal(${c.id})"><i class="fa-solid fa-edit"></i> Editar</button>', new_btn_client)

reset_fn = """
        async function resetPassword(type, id, nickname) {
            const newPass = prompt('Ingresa la nueva contraseña para este usuario:');
            if (!newPass) return;
            
            let trainer_nick = null;
            if (type === 'client') {
                trainer_nick = document.getElementById('trainerSelector').value;
            }
            
            try {
                const response = await fetch('/api/admin/reset_password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Passcode': adminPasscode,
                        'Authorization': 'Bearer ' + localStorage.getItem('jwtToken')
                    },
                    body: JSON.stringify({
                        target_type: type,
                        target_id: id,
                        new_password: newPass,
                        trainer_nick: trainer_nick
                    })
                });
                const result = await response.json();
                if (result.success) {
                    alert('Contraseña actualizada correctamente.');
                } else {
                    alert(result.error || 'Error al restablecer contraseña.');
                }
            } catch (err) {
                alert('Error de conexión.');
            }
        }
"""
if 'async function resetPassword' not in content:
    content = content.replace('// --- TRAINERS LOGIC ---', reset_fn + '\n        // --- TRAINERS LOGIC ---')
    with open('web/admin/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Reset password UI added to admin.')
else:
    print('Reset UI already present.')
