import os

js_code = """
// --- Assign Routine to Client Modal ---
function assignRoutinePrompt(planId, title) {
    if (!usersData || usersData.length === 0) {
        alert("No hay clientes disponibles para asignar.");
        return;
    }
    
    let optionsHtml = usersData.map(u => `<option value="${u.id}">${u.first_name} ${u.last_name}</option>`).join('');
    
    const dialogHtml = `
        <div id="assignRoutineModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;">
            <div class="glass-card" style="width: 400px; padding: 25px; border-radius: 12px; background: #1a1a1a; color: white;">
                <h3 style="margin-bottom: 15px; color: var(--accent-cyan);">Asignar Plantilla</h3>
                <p style="margin-bottom: 20px; font-size: 14px; color: #ccc;">Selecciona el cliente al que deseas asignarle la plantilla <strong>"${title}"</strong>. Esto reemplazará su rutina activa actual.</p>
                
                <select id="assignClientSelect" class="form-input" style="width: 100%; margin-bottom: 20px; padding: 10px; border-radius: 6px; background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1);">
                    ${optionsHtml}
                </select>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn-secondary" onclick="document.getElementById('assignRoutineModal').remove()">Cancelar</button>
                    <button class="btn-primary" onclick="confirmAssignRoutine(${planId})">Confirmar Asignación</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHtml);
}

async function confirmAssignRoutine(planId) {
    const select = document.getElementById("assignClientSelect");
    const clientId = select.value;
    
    try {
        const response = await fetch('/api/routines/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, plan_id: planId })
        });
        
        const result = await response.json();
        if (result.success) {
            alert("Rutina clonada y asignada correctamente.");
            document.getElementById('assignRoutineModal').remove();
            
            // Si el cliente modificado es el que estamos viendo actualmente en la ficha principal, recargamos la pantalla
            if (parseInt(clientId) === activeUserId) {
                selectClient(activeUserId);
            }
        } else {
            alert("Error al asignar: " + result.error);
        }
    } catch (err) {
        console.error(err);
        alert("Error de conexión al asignar rutina.");
    }
}
"""

with open('web/trainer/trainer.js', 'a', encoding='utf-8') as f:
    f.write(js_code)

print("Modal functions appended to trainer.js successfully.")
