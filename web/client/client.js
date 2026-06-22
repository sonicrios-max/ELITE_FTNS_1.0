// Client Dashboard JavaScript Logic
(function() {
    const originalFetch = window.fetch;
    const urlParams = new URLSearchParams(window.location.search);
    const trainerId = urlParams.get('trainer') || sessionStorage.getItem('trainerId') || 'admin';
    if (trainerId) {
        sessionStorage.setItem('trainerId', trainerId);
    }
    
    window.fetch = function(url, options = {}) {
        if (typeof url === 'string' && url.includes('/api/')) {
            options.headers = options.headers || {};
            options.headers['X-Trainer-Id'] = trainerId;
        }
        return originalFetch(url, options);
    };
    
    // Apply theme color on DOMContentLoaded
    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const response = await originalFetch(`/api/trainer/config?trainer=${trainerId}`);
            const config = await response.json();
            if (config.success) {
                if (config.theme_color) {
                    document.documentElement.style.setProperty('--accent-gold', config.theme_color);
                    document.documentElement.style.setProperty('--accent-cyan', config.theme_color);
                    document.documentElement.style.setProperty('--accent-gold-glow', `${config.theme_color}40`);
                }
                const logoSpan = document.querySelector('.logo span');
                // The logo will be updated in displayClientHeader with the client's name
            }
        } catch (e) {
            console.error("Error loading theme config:", e);
        }
    });
})();

let userId = 1;
let activeTab = 'tabRutinas';
let clientFullData = null;
let globalNutritionConfig = [];

// Chart.js Instances
let weightChartInstance = null;
let stepsChartInstance = null;



// Hydration State
let currentWaterIntakeMl = 0;

async function loadNutritionConfig() {
    try {
        const res = await fetch('/api/nutrition_config');
        const data = await res.json();
        if (data.success) {
            globalNutritionConfig = data.config;
        }
    } catch (e) {
        console.error("Error loading nutrition config:", e);
    }
}

async function initClientDashboard() {
    // Parse userId from query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('userId');
    if (idParam) {
        userId = parseInt(idParam);
    }
    await loadNutritionConfig();
    loadClientData();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initClientDashboard);
} else {
    initClientDashboard();
}

async function loadClientData() {
    try {
        const response = await fetch(`/api/clients/${userId}`);
        clientFullData = await response.json();
        
        displayClientHeader();
        populateKPIs();
        renderWorkoutPlans();
        renderNutritionPlans();
        initOrUpdateCharts();
        renderClientDailyCalendar();
        setupHydrationWidget();

    } catch (err) {
        console.error("Error loading client data:", err);
        document.getElementById("clientNameHeader").innerText = "Error al cargar";
    }
}

function displayClientHeader() {
    const user = clientFullData.profile;
    document.getElementById("clientNameHeader").innerText = `${user.first_name} ${user.last_name}`;
    const logoSpan = document.querySelector('.logo span');
    if (logoSpan) {
        logoSpan.innerText = `ELITE COACHING | ${user.first_name.toUpperCase()}`;
    }
}

function populateKPIs() {
    const assessments = clientFullData.assessments || [];
    const diet = clientFullData.nutrition_plan;
    
    // 1. Weight KPI
    if (assessments.length > 0) {
        const latest = assessments[assessments.length - 1];
        document.getElementById("clientKpiWeight").innerText = `${latest.weight_kg || 0} kg`;
        
        // 2. Fat KPI
        const fatPct = latest.body_fat_percentage !== null && latest.body_fat_percentage !== undefined ? latest.body_fat_percentage : 0.0;
        const leanMass = latest.lean_mass_kg !== null && latest.lean_mass_kg !== undefined ? latest.lean_mass_kg : ((latest.weight_kg || 0) - ((latest.weight_kg || 0) * (fatPct / 100.0)));
        document.getElementById("clientKpiFat").innerText = `${fatPct.toFixed(1)}%`;
        
        // Populate Latest Assessment Banner dynamically
        document.getElementById("latestAssessmentBanner").style.display = "block";
        document.getElementById("assessmentDateLabel").innerText = latest.date;
        
        const grid = document.getElementById("latestAssessmentGrid");
        grid.innerHTML = "";
        
        const displayKeys = [
            { key: 'weight_kg', label: 'Peso', color: 'var(--accent-cyan)', unit: 'kg' },
            { key: 'bmi', label: 'IMC', color: 'var(--accent-purple)', unit: '' },
            { key: 'body_fat_percentage', label: '% Grasa', color: 'var(--accent-orange)', unit: '%' },
            { key: 'lean_mass_kg', label: 'Músculo', color: 'var(--accent-green)', unit: 'kg' },
            { key: 'muscle_mass_pct', label: '% Músculo', color: 'var(--accent-green)', unit: '%' },
            { key: 'body_water_pct', label: '% Agua', color: '#3b82f6', unit: '%' },
            { key: 'visceral_fat_rating', label: 'Grasa Visceral', color: '#ef4444', unit: '' },
            { key: 'bone_mass_kg', label: 'Masa Ósea', color: '#f3f4f6', unit: 'kg' },
            { key: 'basal_metabolic_rate_kcal', label: 'TMB', color: '#f59e0b', unit: 'kcal' },
            { key: 'fc_rep', label: 'FC Reposo', color: '#ef4444', unit: 'bpm' },
            { key: 'fc_max', label: 'FC Máx', color: '#ef4444', unit: 'bpm' },
            { key: 'neck', label: 'Cuello', color: '#d1d5db', unit: 'cm' },
            { key: 'chest', label: 'Pecho', color: '#d1d5db', unit: 'cm' },
            { key: 'shoulder', label: 'Hombro', color: '#d1d5db', unit: 'cm' },
            { key: 'abdomen', label: 'Abdomen', color: '#d1d5db', unit: 'cm' },
            { key: 'iliac', label: 'Iliaco', color: '#d1d5db', unit: 'cm' },
            { key: 'trochanter', label: 'Cadera', color: '#d1d5db', unit: 'cm' },
            { key: 'right_thigh', label: 'Muslo Der', color: '#d1d5db', unit: 'cm' },
            { key: 'left_thigh', label: 'Muslo Izq', color: '#d1d5db', unit: 'cm' },
            { key: 'right_calf', label: 'Pantorrilla Der', color: '#d1d5db', unit: 'cm' },
            { key: 'left_calf', label: 'Pantorrilla Izq', color: '#d1d5db', unit: 'cm' },
            { key: 'right_bicep', label: 'Bíceps Der', color: '#d1d5db', unit: 'cm' },
            { key: 'left_bicep', label: 'Bíceps Izq', color: '#d1d5db', unit: 'cm' },
            { key: 'right_forearm', label: 'Antebrazo Der', color: '#d1d5db', unit: 'cm' },
            { key: 'left_forearm', label: 'Antebrazo Izq', color: '#d1d5db', unit: 'cm' },
            { key: 'scapular', label: 'Pl. Escapular', color: '#9ca3af', unit: 'mm' },
            { key: 'triceps', label: 'Pl. Tríceps', color: '#9ca3af', unit: 'mm' },
            { key: 'abdominal', label: 'Pl. Abdominal', color: '#9ca3af', unit: 'mm' },
            { key: 'suprailiac', label: 'Pl. Suprailiaco', color: '#9ca3af', unit: 'mm' }
        ];

        displayKeys.forEach(item => {
            let val = latest[item.key];
            if (val !== null && val !== undefined && val !== "") {
                if (typeof val === 'number') val = val.toFixed(1).replace('.0', '');
                
                const box = document.createElement("div");
                box.className = "summary-stat-box";
                box.style.padding = "8px";
                box.style.width = "100%";
                box.innerHTML = `
                    <span style="font-size: 10px; display: block;">${item.label}</span>
                    <strong style="font-size: 14px; color: ${item.color};">${val} ${item.unit}</strong>
                `;
                grid.appendChild(box);
            }
        });
        
        // Handle custom_data
        if (latest.custom_data) {
            try {
                const custom = JSON.parse(latest.custom_data);
                for (const [k, v] of Object.entries(custom)) {
                    if (v !== null && v !== "") {
                        const box = document.createElement("div");
                        box.className = "summary-stat-box";
                        box.style.padding = "8px";
                        box.style.width = "100%";
                        box.innerHTML = `
                            <span style="font-size: 10px; display: block; text-transform: capitalize;">${k.replace(/_/g, ' ')}</span>
                            <strong style="font-size: 14px; color: var(--color-text-primary);">${v}</strong>
                        `;
                        grid.appendChild(box);
                    }
                }
            } catch(e) {}
        }
        
    } else {
        document.getElementById("clientKpiWeight").innerText = "-";
        document.getElementById("clientKpiFat").innerText = "-";
        document.getElementById("latestAssessmentBanner").style.display = "none";
    }
    
    // 3. Nutrition KPI
    if (diet) {
        const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
        const hasCal = activeFields.some(f => f.db_column === 'calories_kcal');
        document.getElementById("clientKpiCalories").innerText = hasCal ? `${diet.target_calories || 0} Kcal` : '- Kcal';
    } else {
        document.getElementById("clientKpiCalories").innerText = "-";
    }
}

// Hydration logic
function setupHydrationWidget() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const logs = clientFullData.daily_logs || [];
    const todayLog = logs.find(l => l.date === todayStr);
    
    currentWaterIntakeMl = todayLog ? (todayLog.water_intake_ml || 0) : 0;
    updateWaterLabel();
}

function updateWaterLabel() {
    document.getElementById("waterProgressLabel").innerText = `${currentWaterIntakeMl} ml / 2500 ml`;
}

async function addWater(amountMl) {
    currentWaterIntakeMl += amountMl;
    updateWaterLabel();
    
    const todayStr = new Date().toISOString().substring(0, 10);
    const payload = {
        user_id: userId,
        date: todayStr,
        water_intake_ml: currentWaterIntakeMl
    };
    
    try {
        await fetch('/api/daily_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Error updating water database log:", err);
    }
}

// Daily Form Submission
async function submitDailyLog(event) {
    event.preventDefault();
    
    const weight = parseFloat(document.getElementById("logWeight").value) || null;
    const steps = parseInt(document.getElementById("logSteps").value) || null;
    const sleep = parseFloat(document.getElementById("logSleep").value) || null;
    const sleepQuality = parseInt(document.getElementById("logSleepQuality").value);
    const dietAdherence = parseInt(document.getElementById("logDietAdherence").value);
    const energy = parseInt(document.getElementById("logEnergy").value);
    const digestion = parseInt(document.getElementById("logDigestion").value);
    const rhr = parseInt(document.getElementById("logRhr").value) || null;
    const notes = document.getElementById("logNotes").value;
    
    const todayStr = new Date().toISOString().substring(0, 10);
    const payload = {
        user_id: userId,
        date: todayStr,
        weight_kg: weight,
        steps_count: steps,
        sleep_hours: sleep,
        sleep_quality: sleepQuality,
        diet_adherence: dietAdherence,
        energy_level: energy,
        digestion_status: digestion,
        resting_hr: rhr,
        notes: notes,
        water_intake_ml: currentWaterIntakeMl // preserve hydration
    };
    
    try {
        const response = await fetch('/api/daily_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.success) {
            alert("Registro diario guardado exitosamente.");
            // Reload all data to refresh graphs
            loadClientData();
            document.getElementById("dailyLogForm").reset();
        } else {
            alert("Error al guardar: " + result.error);
        }
    } catch (err) {
        console.error("Error submitting daily log:", err);
        alert("Error de conexión al guardar.");
    }
}

// Render active workout plan
function renderWorkoutPlans() {
    const container = document.getElementById("workoutPlanContainer");
    container.innerHTML = "";
    
    const workouts = clientFullData.workout_plan;
    if (!workouts || !workouts.days || workouts.days.length === 0) {
        container.innerHTML = `
            <h3>Mi Entrenamiento Asignado</h3>
            <div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">
                Aún no tienes rutinas de fuerza cargadas por tu entrenador.
            </div>`;
        return;
    }
    
    container.innerHTML = `
        <h3>Rutina Activa: ${workouts.title}</h3>
        <p style="color:var(--color-text-secondary); margin-bottom: 20px;">${workouts.description || ''}</p>
    `;
    
    workouts.days.forEach(day => {
        const dayCard = document.createElement("div");
        dayCard.className = "workout-day-card";
        
        let blocksHtml = "";
        if (day.blocks) {
            day.blocks.forEach(block => {
                let exercisesHtml = "";
                block.exercises.forEach(ex => {
                    exercisesHtml += `
                        <tr>
                            <td style="padding: 4px;">
                                <input type="checkbox" id="check-${ex.id}" style="width: 14px; height: 14px; cursor: pointer;">
                            </td>
                            <td class="exercise-name" style="padding: 4px; font-size: 11px;">${ex.exercise_name}</td>
                            <td style="padding: 4px;"><span class="compliance-badge" style="font-size: 10px; padding: 2px 6px;">${ex.sets_count} Series</span></td>
                            <td style="padding: 4px;"><strong>${ex.reps_range}</strong></td>
                            <td style="padding: 4px;">RPE ${ex.rpe_target || 'N/A'}</td>
                            <td style="padding: 4px;">${ex.rest_seconds ? `${ex.rest_seconds}s` : '-'}</td>
                            <td style="padding: 4px;">
                                ${ex.video_url ? `<a href="#" class="exercise-video-link" onclick="playVideo(event, '${ex.video_url}', this)" style="font-size: 11px;"><i class="fa-solid fa-circle-play"></i> Técnica</a>` : '-'}
                            </td>
                        </tr>
                        <tr id="video-row-${ex.id}" style="display:none;">
                            <td colspan="7">
                                <div class="media-preview-container" id="video-container-${ex.id}">
                                    <video controls preload="none" loop muted>
                                        <source src="${ex.video_url}" type="video/mp4">
                                        Tu navegador no soporta video.
                                    </video>
                                </div>
                            </td>
                        </tr>
                    `;
                });
                
                blocksHtml += `
                    <div style="margin-bottom: 10px; border-left: 2px solid var(--accent-cyan); padding-left: 8px; background: rgba(0,0,0,0.1); padding-top: 8px; padding-bottom: 8px; border-radius: 0 4px 4px 0;">
                        <h5 style="color: var(--accent-cyan); margin-bottom: 5px; font-size: 12px; margin-top: 0;">${block.name} <span style="color:var(--color-text-secondary); font-size:10px; font-weight:normal;">[${block.routine_class}]</span></h5>
                        <div style="overflow-x: auto; width: 100%;">
                            <table class="exercise-table" style="font-size: 11px; white-space: nowrap;">
                                <thead>
                                    <tr>
                                        <th style="padding: 4px; width: 30px;">Done</th>
                                        <th style="padding: 4px;">Ejercicio</th>
                                        <th style="padding: 4px;">Series</th>
                                        <th style="padding: 4px;">Reps</th>
                                        <th style="padding: 4px;">RPE</th>
                                        <th style="padding: 4px;">Descanso</th>
                                        <th style="padding: 4px;">Video</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${exercisesHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }
        
        dayCard.innerHTML = `
            <h4>${day.day_name}</h4>
            <div style="margin-top: 15px;">
                ${blocksHtml}
            </div>
        `;
        container.appendChild(dayCard);
    });
}

function playVideo(e, url, linkElem) {
    e.preventDefault();
    const row = linkElem.closest('tr').nextElementSibling;
    const container = row.querySelector('.media-preview-container');
    const video = container.querySelector('video');
    
    if (row.style.display === 'none') {
        row.style.display = 'table-row';
        container.style.display = 'block';
        video.play();
        linkElem.innerHTML = `<i class="fa-solid fa-circle-stop"></i> Parar`;
    } else {
        video.pause();
        row.style.display = 'none';
        container.style.display = 'none';
        linkElem.innerHTML = `<i class="fa-solid fa-circle-play"></i> Técnica`;
    }
}

// Render active nutrition plan
function renderNutritionPlans() {
    const container = document.getElementById("nutritionPlanContainer");
    container.innerHTML = "";
    
    const diet = clientFullData.nutrition_plan;
    if (!diet || !diet.meals || diet.meals.length === 0) {
        container.innerHTML = `
            <h3>Mi Plan de Alimentación</h3>
            <div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">
                Aún no tienes un plan alimenticio cargado por tu entrenador.
            </div>`;
        return;
    }
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    
    const activeTargetParts = [];
    const hasCal = activeFields.some(f => f.db_column === 'calories_kcal');
    const hasPro = activeFields.some(f => f.db_column === 'protein_g');
    const hasCarb = activeFields.some(f => f.db_column === 'carbs_g');
    const hasFat = activeFields.some(f => f.db_column === 'fat_g');
    
    if (hasCal) activeTargetParts.push(`Meta Diaria: ${diet.target_calories} Kcal`);
    if (hasPro) activeTargetParts.push(`P: ${diet.target_protein}g`);
    if (hasCarb) activeTargetParts.push(`C: ${diet.target_carbs}g`);
    if (hasFat) activeTargetParts.push(`G: ${diet.target_fat}g`);
    
    const targetLabel = activeTargetParts.length > 0 ? activeTargetParts.join(' | ') : '';
    
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
            <h3>Mi Plan: ${diet.title}</h3>
            <span style="font-size:12px; color:var(--color-text-secondary);">Activo desde: ${diet.start_date}</span>
        </div>
        <p style="color:var(--color-text-secondary); margin-bottom: 20px;">${diet.description || ''}</p>
        ${targetLabel ? `
        <div style="margin-bottom: 20px;">
            <span class="compliance-badge" style="background:rgba(139,92,246,0.15); color:var(--accent-purple); border-color:rgba(139,92,246,0.3); font-size:14px; padding: 8px 12px;">
                ${targetLabel}
            </span>
        </div>` : ''}
    `;
    
    diet.meals.forEach(meal => {
        const mealBox = document.createElement("div");
        mealBox.className = "diet-meal-box";
        
        let foodItemsHtml = "";
        let totals = {};
        
        meal.items.forEach(food => {
            let macrosParts = [];
            activeFields.forEach(field => {
                let val = null;
                if (field.is_default && field.db_column) {
                    val = food[field.db_column];
                } else if (food.custom_data && food.custom_data[field.field_name] !== undefined) {
                    val = food.custom_data[field.field_name];
                }
                
                if (typeof val === 'number') {
                    totals[field.field_name] = (totals[field.field_name] || 0) + val;
                }
                
                if (val !== null && val !== undefined) {
                    if (field.db_column === 'weight_g') return;
                    if (field.db_column === 'calories_kcal') return;
                    macrosParts.push(`${field.field_name}: ${val}${field.unit ? field.unit : ''}`);
                }
            });
            
            const hasWeight = activeFields.some(f => f.db_column === 'weight_g');
            const weightLabel = hasWeight ? ` (${food.weight_g}g)` : '';
            
            const hasCalories = activeFields.some(f => f.db_column === 'calories_kcal');
            const caloriesLabel = hasCalories ? `<strong style="color:var(--accent-purple); margin-left:10px;">${food.calories_kcal} Kcal</strong>` : '';
            
            foodItemsHtml += `
                <div class="food-item">
                    <div>
                        <span class="food-name">${food.food_name}</span>
                        <span style="color:var(--color-text-muted); font-size:12px;">${weightLabel}</span>
                    </div>
                    <div style="text-align:right;">
                        <span class="food-macros">${macrosParts.join(' | ')}</span>
                        ${caloriesLabel}
                    </div>
                </div>
            `;
        });
        
        let subtotalParts = [];
        activeFields.forEach(field => {
            if (totals[field.field_name] !== undefined) {
                subtotalParts.push(`${field.field_name}: ${totals[field.field_name].toFixed(1)}${field.unit ? field.unit : ''}`);
            }
        });
        
        mealBox.innerHTML = `
            <h4>
                <span>${meal.meal_name}</span>
                <span style="font-size:12px; font-weight:normal; color:var(--color-text-secondary);">
                    Subtotal: ${subtotalParts.join(' | ')}
                </span>
            </h4>
            <div class="food-item-list">
                ${foodItemsHtml}
            </div>
        `;
        container.appendChild(mealBox);
    });
}

// Charts for progress
function initOrUpdateCharts() {
    const logs = clientFullData.daily_logs || [];
    const sortedLogs = [...logs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    const dates = sortedLogs.map(l => l.date);
    const weights = sortedLogs.map(l => l.weight_kg).filter(w => w !== null);
    const weightsDates = sortedLogs.filter(l => l.weight_kg !== null).map(l => l.date);
    const steps = sortedLogs.map(l => l.steps_count);
    
    const textMuted = '#bbbbbb';
    const gridColor = 'rgba(255, 255, 255, 0.05)';
    
    // 1. Weight Chart
    if (weightChartInstance) weightChartInstance.destroy();
    const ctxWeight = document.getElementById("chartClientWeight").getContext("2d");
    weightChartInstance = new Chart(ctxWeight, {
        type: 'line',
        data: {
            labels: weightsDates,
            datasets: [{
                label: 'Mi Peso (kg)',
                data: weights,
                borderColor: '#f3ca4c',
                backgroundColor: 'rgba(243, 202, 76, 0.05)',
                borderWidth: 3,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: textMuted } },
                x: { grid: { display: false }, ticks: { color: textMuted } }
            }
        }
    });

    // 2. Steps Chart
    if (stepsChartInstance) stepsChartInstance.destroy();
    const ctxSteps = document.getElementById("chartClientSteps").getContext("2d");
    stepsChartInstance = new Chart(ctxSteps, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: 'Pasos',
                data: steps,
                backgroundColor: 'rgba(243, 202, 76, 0.6)',
                borderColor: '#f3ca4c',
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: textMuted } },
                x: { grid: { display: false }, ticks: { color: textMuted } }
            }
        }
    });
}



// Global Tab Switcher (matches Trainer UI)
function switchGlobalTab(tabId, element) {
    // Hide all global views
    document.querySelectorAll('.global-tab-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    
    // Remove active from nav links and bottom nav items
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.btn-nav').forEach(el => el.classList.remove('active'));
    
    // Show selected view
    const view = document.getElementById(tabId);
    if (view) {
        view.style.display = 'block';
        view.classList.add('active');
    }
    
    // Highlight active nav item
    if (element) {
        element.classList.add('active');
    }
}

function exportToPDF() {
    window.print();
}

// ==========================================
// Interactive Calendar for Client Progress
// ==========================================
let currentClientCalendarDate = new Date();

function changeClientCalendarMonth(offset) {
    currentClientCalendarDate.setMonth(currentClientCalendarDate.getMonth() + offset);
    renderClientDailyCalendar();
}

function renderClientDailyCalendar() {
    const month = currentClientCalendarDate.getMonth();
    const year = currentClientCalendarDate.getFullYear();
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    document.getElementById('clientCalendarMonthLabel').innerText = `${monthNames[month]} ${year}`;
    
    const logs = clientFullData.daily_logs || [];
    const logsMap = {};
    logs.forEach(l => { logsMap[l.date] = l; });
    
    const grid = document.getElementById('clientCalendarGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div style="padding: 10px;"></div>`;
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const log = logsMap[dateStr];
        
        const isToday = (new Date().toISOString().split('T')[0] === dateStr);
        let borderStyle = isToday ? 'border: 1px solid var(--accent-cyan);' : 'border: 1px solid transparent;';
        
        if (log) {
            grid.innerHTML += `
                <div style="background: rgba(14, 165, 233, 0.2); ${borderStyle} border-radius: 6px; padding: 5px; cursor: pointer; transition: 0.2s; display:flex; flex-direction:column; align-items:center;" 
                     onmouseover="this.style.background='rgba(14, 165, 233, 0.4)'" 
                     onmouseout="this.style.background='rgba(14, 165, 233, 0.2)'"
                     onclick='showClientDayDetails(${JSON.stringify(log)})'>
                    <div style="font-weight:bold; color: white; font-size:12px;">${d}</div>
                    <div style="font-size: 11px; color: var(--accent-cyan); margin-top:2px;"><i class="fa-solid fa-check"></i></div>
                </div>
            `;
        } else {
            grid.innerHTML += `
                <div style="background: rgba(255, 255, 255, 0.05); ${borderStyle} border-radius: 6px; padding: 5px; opacity: 0.5; display:flex; align-items:center; justify-content:center;">
                    <div style="font-weight:bold; font-size:12px;">${d}</div>
                </div>
            `;
        }
    }
}

function showClientDayDetails(log) {
    document.getElementById('clientDayDetailPanel').style.display = 'block';
    document.getElementById('clientDayDetailDate').innerText = log.date;
    
    const content = document.getElementById('clientDayDetailContent');
    content.innerHTML = `
        <div class="summary-stat-box" style="width: 100%;">
            <span>Peso</span>
            <strong>${log.weight_kg ? log.weight_kg + ' kg' : '-'}</strong>
        </div>
        <div class="summary-stat-box" style="width: 100%;">
            <span>Actividad</span>
            <strong>${log.steps_count ? log.steps_count + ' pasos' : '-'}</strong>
        </div>
        <div class="summary-stat-box" style="width: 100%;">
            <span>Descanso</span>
            <strong>${log.sleep_hours ? log.sleep_hours + ' hrs (Calidad: ' + log.sleep_quality + '/10)' : '-'}</strong>
        </div>
        <div class="summary-stat-box" style="width: 100%;">
            <span>Hidratación</span>
            <strong>${log.water_intake_ml ? log.water_intake_ml + ' ml' : '-'}</strong>
        </div>
        <div class="summary-stat-box" style="width: 100%;">
            <span>Adherencia Dieta</span>
            <strong>${log.diet_adherence ? log.diet_adherence + ' / 10' : '-'}</strong>
        </div>
        ${log.notes ? `<div style="width: 100%; margin-top: 5px; color: var(--color-text-secondary); font-size: 13px;"><em>"${log.notes}"</em></div>` : ''}
    `;
}
