import os

with open("web/trainer/trainer.js", "r", encoding="utf-8") as f:
    content = f.read()

# Replace Exercise buttons
old_ex_btns = """                    <td>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 12px;"><i class="fa-solid fa-pen"></i></button>
                    </td>"""
new_ex_btns = """                    <td style="display: flex; gap: 5px;">
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="editExercise(${ex.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteExercise(${ex.id})"><i class="fa-solid fa-trash"></i></button>
                    </td>"""
content = content.replace(old_ex_btns, new_ex_btns)

# Replace Block buttons
old_block_header = """                    <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                        <h4 style="color: var(--accent-cyan);">${b.name} <span style="font-size: 12px; color: var(--color-text-secondary); font-weight: normal;">[${b.routine_class}]</span></h4>
                    </div>"""
new_block_header = """                    <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                        <h4 style="color: var(--accent-cyan);">${b.name} <span style="font-size: 12px; color: var(--color-text-secondary); font-weight: normal;">[${b.routine_class}]</span></h4>
                        <div>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="editBlock(${b.id})"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteBlock(${b.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>"""
content = content.replace(old_block_header, new_block_header)

# Replace Routine buttons
old_routine_header = """                    <div style="display:flex; justify-content:space-between;">
                        <h4>${r.title}</h4>
                        <button class="btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="assignRoutinePrompt(${r.id}, '${r.title}')"><i class="fa-solid fa-user-plus"></i> Asignar a Cliente</button>
                    </div>"""
new_routine_header = """                    <div style="display:flex; justify-content:space-between;">
                        <h4>${r.title}</h4>
                        <div style="display:flex; gap: 5px;">
                            <button class="btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="assignRoutinePrompt(${r.id}, '${r.title}')"><i class="fa-solid fa-user-plus"></i> Asignar</button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="editRoutine(${r.id})"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteRoutine(${r.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>"""
content = content.replace(old_routine_header, new_routine_header)

# JS CRUD functions to append
js_crud = """
// --- Delete Functions ---
async function deleteItem(endpoint, id, refreshFunction) {
    if(!confirm("¿Estás seguro de que deseas eliminar este elemento? Esta acción no se puede deshacer y borrará el elemento de todas las rutinas en las que esté asignado.")) return;
    
    try {
        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const result = await response.json();
        if (result.success) {
            refreshFunction();
        } else {
            alert("Error al eliminar: " + result.error);
        }
    } catch (e) {
        alert("Error de red: " + e);
    }
}

function deleteExercise(id) { deleteItem('/api/exercises', id, fetchGlobalExercises); }
function deleteBlock(id) { deleteItem('/api/workout_blocks', id, fetchGlobalBlocks); }
function deleteRoutine(id) { deleteItem('/api/routines', id, fetchGlobalRoutines); }

// --- Edit Modes ---
let editingExerciseId = null;
let editingBlockId = null;
let editingRoutineId = null;

// Override original submit for Exercises to handle PUT
const originalSubmitEx = submitNewExercise;
submitNewExercise = async function(e) {
    if(!editingExerciseId) return originalSubmitEx(e);
    
    e.preventDefault();
    const payload = {
        id: editingExerciseId,
        name: document.getElementById('newExName').value,
        primary_muscle: document.getElementById('newExPrimary').value,
        secondary_muscles: document.getElementById('newExSecondary').value,
        equipment: document.getElementById('newExEquipment').value,
        video_url: document.getElementById('newExVideo').value
    };
    const res = await fetch('/api/exercises', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
        closeExerciseModal();
        e.target.reset();
        fetchGlobalExercises();
    } else alert("Error: " + result.error);
}

function editExercise(id) {
    // We fetch current globally cached exercises
    // We don't have a direct global variable for exercises cache, so we fetch it again
    fetch('/api/exercises').then(r=>r.json()).then(exs => {
        const ex = exs.find(e => e.id === id);
        if(!ex) return;
        editingExerciseId = id;
        document.getElementById('newExName').value = ex.name;
        document.getElementById('newExPrimary').value = ex.primary_muscle;
        document.getElementById('newExSecondary').value = ex.secondary_muscles || '';
        document.getElementById('newExEquipment').value = ex.equipment || '';
        document.getElementById('newExVideo').value = ex.video_url || '';
        
        // Modificar título del modal
        const formTitle = document.querySelector('#addExerciseModal h3');
        if(formTitle) formTitle.textContent = "Editar Ejercicio";
        
        openExerciseModal();
    });
}

// Override original open/close to reset state
const originalCloseEx = closeExerciseModal;
closeExerciseModal = function() {
    editingExerciseId = null;
    const formTitle = document.querySelector('#addExerciseModal h3');
    if(formTitle) formTitle.textContent = "Nuevo Ejercicio";
    originalCloseEx();
}

// Block Edit
const originalSubmitBlock = submitNewBlock;
submitNewBlock = async function(e) {
    if(!editingBlockId) return originalSubmitBlock(e);
    
    e.preventDefault();
    const exercises = [];
    document.querySelectorAll('.block-exercise-row').forEach((row, exIdx) => {
        exercises.push({
            exercise_id: parseInt(row.querySelector('.block-ex-id').value),
            sets_count: parseInt(row.querySelector('.ex-sets').value),
            reps_range: row.querySelector('.ex-reps').value,
            rpe_target: parseInt(row.querySelector('.ex-rpe').value) || 0,
            order_index: exIdx + 1
        });
    });
    const payload = {
        id: editingBlockId,
        name: document.getElementById('newBlockName').value,
        routine_class: document.getElementById('newBlockClass').value,
        description: document.getElementById('newBlockDesc').value,
        exercises: exercises
    };
    const res = await fetch('/api/workout_blocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
        closeBlockModal();
        e.target.reset();
        fetchGlobalBlocks();
    } else alert("Error: " + result.error);
}

function editBlock(id) {
    const block = globalBlocksCache.find(b => b.id === id);
    if(!block) return;
    editingBlockId = id;
    
    document.getElementById('newBlockName').value = block.name;
    document.getElementById('newBlockClass').value = block.routine_class;
    document.getElementById('newBlockDesc').value = block.description || '';
    
    const formTitle = document.querySelector('#addBlockModal h3');
    if(formTitle) formTitle.textContent = "Editar Bloque de Grupo Muscular";
    
    document.getElementById('addBlockModal').style.display = 'flex'; 
    document.getElementById('blockExercisesContainer').innerHTML = '';
    
    // Add existing exercises
    block.exercises.forEach(ex => {
        const container = document.getElementById('blockExercisesContainer');
        const exDiv = document.createElement('div');
        exDiv.style.display = 'flex'; exDiv.style.gap = '5px'; exDiv.style.marginBottom = '5px';
        exDiv.className = 'block-exercise-row';
        
        const selectedClass = block.routine_class;
        const filteredEx = selectedClass === "Fullbody" ? globalExercisesCache : globalExercisesCache.filter(e => e.routine_class === selectedClass || e.routine_class === "Fullbody");
        let optionsHTML = filteredEx.map(e => `<option value="${e.id}" ${e.id == ex.exercise_id ? 'selected' : ''}>${e.name} (${e.primary_muscle})</option>`).join('');
        
        exDiv.innerHTML = `
            <select class="block-ex-id" style="flex:2;" required>${optionsHTML}</select>
            <input type="number" class="ex-sets" placeholder="Series" value="${ex.sets_count}" style="flex:1;" required>
            <input type="text" class="ex-reps" placeholder="Reps" value="${ex.reps_range}" style="flex:1;" required>
            <input type="number" class="ex-rpe" placeholder="RPE" value="${ex.rpe_target || 8}" style="flex:1;">
            <button type="button" class="btn-nav" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
        `;
        container.appendChild(exDiv);
    });
}

const originalCloseBlock = closeBlockModal;
closeBlockModal = function() {
    editingBlockId = null;
    const formTitle = document.querySelector('#addBlockModal h3');
    if(formTitle) formTitle.textContent = "Nuevo Bloque de Grupo Muscular";
    originalCloseBlock();
}

// Routine Edit
const originalSubmitRoutine = submitNewRoutine;
submitNewRoutine = async function(e) {
    if(!editingRoutineId) return originalSubmitRoutine(e);
    
    e.preventDefault();
    const days = [];
    document.querySelectorAll('.day-builder-card').forEach((card, idx) => {
        const dayName = card.querySelector('.day-name').value;
        const blockIds = Array.from(card.querySelectorAll('.day-block-id')).map(sel => parseInt(sel.value));
        days.push({ day_name: dayName, order_index: idx + 1, block_ids: blockIds });
    });
    const payload = {
        id: editingRoutineId,
        title: document.getElementById('newRoutineName').value,
        description: document.getElementById('newRoutineDesc').value,
        days: days
    };
    const res = await fetch('/api/routines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
        closeRoutineModal();
        e.target.reset();
        fetchGlobalRoutines();
    } else alert("Error: " + result.error);
}

function editRoutine(id) {
    fetch('/api/routines').then(r=>r.json()).then(routines => {
        const routine = routines.find(r => r.id === id);
        if(!routine) return;
        editingRoutineId = id;
        
        document.getElementById('newRoutineName').value = routine.title;
        document.getElementById('newRoutineDesc').value = routine.description || '';
        
        const formTitle = document.querySelector('#addRoutineModal h3');
        if(formTitle) formTitle.textContent = "Editar Plantilla de Rutina";
        
        document.getElementById('addRoutineModal').style.display = 'flex'; 
        document.getElementById('daysContainer').innerHTML = '';
        dayCounter = 0;
        
        routine.days.forEach(day => {
            dayCounter++;
            const d = dayCounter;
            const card = document.createElement('div');
            card.className = 'day-builder-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <input type="text" class="day-name form-input" value="${day.day_name}" required style="width:200px;">
                    <button type="button" class="btn-nav" onclick="this.parentElement.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="day-blocks" id="dayBlocks_${d}"></div>
                <button type="button" class="btn-secondary" style="font-size:12px; margin-top:10px;" onclick="addBlockToDay(${d})"><i class="fa-solid fa-plus"></i> Añadir Bloque</button>
            `;
            document.getElementById('daysContainer').appendChild(card);
            
            day.blocks.forEach(blk => {
                const bContainer = document.getElementById(`dayBlocks_${d}`);
                const div = document.createElement('div');
                div.style.display = 'flex'; div.style.gap = '5px'; div.style.marginBottom = '5px';
                
                let optionsHtml = globalBlocksCache.map(b => `<option value="${b.id}" ${b.id == blk.id ? 'selected' : ''}>${b.name} (${b.routine_class})</option>`).join('');
                div.innerHTML = `
                    <select class="day-block-id" style="flex:1;" required>${optionsHtml}</select>
                    <button type="button" class="btn-nav" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
                `;
                bContainer.appendChild(div);
            });
        });
    });
}

const originalCloseRoutine = closeRoutineModal;
closeRoutineModal = function() {
    editingRoutineId = null;
    const formTitle = document.querySelector('#addRoutineModal h3');
    if(formTitle) formTitle.textContent = "Nueva Plantilla";
    originalCloseRoutine();
}
"""

with open("web/trainer/trainer.js", "w", encoding="utf-8") as f:
    f.write(content + "\n" + js_crud)

print("Actualización de frontend completada!")
