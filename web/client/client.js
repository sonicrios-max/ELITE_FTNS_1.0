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
    const token = localStorage.getItem('jwtToken');
    if(token) options.headers['Authorization'] = 'Bearer ' + token;
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
let assessmentConfig = [];
let todayCompletedExercises = [];
let todayCompletedMeals = [];
let activeWorkoutDay = "";

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

async function loadAssessmentConfig() {
    try {
        const res = await fetch('/api/assessment_config');
        const data = await res.json();
        if (data.success) {
            assessmentConfig = data.config || [];
        }
    } catch (e) {
        console.error("Error loading assessment config:", e);
    }
}

async function initClientDashboard() {
    // Parse userId from query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('userId');
    if (idParam) {
        userId = parseInt(idParam);
    }
    
    // Register range slider listeners
    const sleepSlider = document.getElementById("logSleepQuality");
    const sleepVal = document.getElementById("sleepQualityVal");
    if (sleepSlider && sleepVal) {
        sleepSlider.addEventListener("input", () => {
            sleepVal.innerText = sleepSlider.value;
        });
    }

    const dietSlider = document.getElementById("logDietAdherence");
    const dietVal = document.getElementById("dietAdherenceVal");
    if (dietSlider && dietVal) {
        dietSlider.addEventListener("input", () => {
            dietVal.innerText = dietSlider.value;
        });
    }
    
    await loadNutritionConfig();
    await loadAssessmentConfig();
    loadClientData();
    connectClientWebSocket();
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
        
        // Parse today's completed checklists
        const todayStr = new Date().toISOString().substring(0, 10);
        const logs = clientFullData.daily_logs || [];
        const todayLog = logs.find(l => l.date === todayStr);
        if (todayLog) {
            try {
                todayCompletedExercises = typeof todayLog.completed_exercises === 'string' 
                    ? JSON.parse(todayLog.completed_exercises) 
                    : (todayLog.completed_exercises || []);
            } catch(e) {
                todayCompletedExercises = [];
            }
            try {
                todayCompletedMeals = typeof todayLog.completed_meals === 'string' 
                    ? JSON.parse(todayLog.completed_meals) 
                    : (todayLog.completed_meals || []);
            } catch(e) {
                todayCompletedMeals = [];
            }
        } else {
            todayCompletedExercises = [];
            todayCompletedMeals = [];
        }
        
        // Auto-detect or load active workout day for today
        const storageKey = `active_workout_day_${userId}_${todayStr}`;
        let activeDay = localStorage.getItem(storageKey) || "";
        
        // If not stored but we have completed exercises, try to resolve it from the exercises
        if (!activeDay && todayCompletedExercises.length > 0 && clientFullData.workout_plan) {
            for (const day of clientFullData.workout_plan.days) {
                let matches = 0;
                if (day.blocks) {
                    for (const block of day.blocks) {
                        if (block.exercises) {
                            for (const ex of block.exercises) {
                                if (todayCompletedExercises.includes(ex.id)) {
                                    matches++;
                                }
                            }
                        }
                    }
                }
                if (matches > 0) {
                    activeDay = day.day_name;
                    localStorage.setItem(storageKey, activeDay);
                    break;
                }
            }
        }
        activeWorkoutDay = activeDay;
        
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
        
        const columnColors = {
            weight_kg: 'var(--accent-cyan)',
            bmi: 'var(--accent-purple)',
            body_fat_percentage: 'var(--accent-orange)',
            lean_mass_kg: 'var(--accent-green)',
            muscle_mass_pct: 'var(--accent-green)',
            body_water_pct: '#3b82f6',
            visceral_fat_rating: '#ef4444',
            bone_mass_kg: '#f3f4f6',
            basal_metabolic_rate_kcal: '#f59e0b',
            fc_rep: '#ef4444',
            fc_max: '#ef4444',
            scapular: '#9ca3af',
            triceps: '#9ca3af',
            abdominal: '#9ca3af',
            suprailiac: '#9ca3af'
        };

        const activeConfigs = assessmentConfig.filter(c => c.is_active == 1);
        
        if (activeConfigs.length > 0) {
            // Render according to trainer's config
            let customData = {};
            if (latest.custom_data) {
                try {
                    customData = typeof latest.custom_data === 'string' ? JSON.parse(latest.custom_data) : latest.custom_data;
                } catch(e) {
                    console.error("Error parsing custom_data:", e);
                }
            }
            if (!customData) customData = {};

            activeConfigs.forEach(c => {
                let val = null;
                if (c.is_default == 1) {
                    val = latest[c.db_column];
                } else {
                    val = customData[c.field_name];
                }
                
                if (val !== null && val !== undefined && val !== "") {
                    if (typeof val === 'number') val = val.toFixed(1).replace('.0', '');
                    
                    const box = document.createElement("div");
                    box.className = "summary-stat-box";
                    box.style.padding = "8px";
                    box.style.width = "100%";
                    box.innerHTML = `
                        <span style="font-size: 10px; display: block;">${c.field_name}</span>
                        <strong style="font-size: 14px; color: ${columnColors[c.db_column] || 'var(--accent-gold)'};">${val} ${c.unit || ''}</strong>
                    `;
                    grid.appendChild(box);
                }
            });
        } else {
            // Fallback default list
            const displayKeys = [
                { key: 'weight_kg', label: 'Peso', color: 'var(--accent-cyan)', unit: 'kg' },
                { key: 'bmi', label: 'IMC', color: 'var(--accent-purple)', unit: '' },
                { key: 'body_fat_percentage', label: '% Grasa', color: 'var(--accent-orange)', unit: '%' },
                { key: 'lean_mass_kg', label: 'Músculo', color: 'var(--accent-green)', unit: 'kg' },
                { key: 'basal_metabolic_rate_kcal', label: 'TMB', color: '#f59e0b', unit: 'kcal' }
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
        }

        // Collapsible Banner Toggle Logic
        const toggleBtn = document.getElementById("btnToggleAssessmentCollapse");
        const icon = document.getElementById("toggleAssessmentIcon");
        if (toggleBtn && grid && icon) {
            const savedState = localStorage.getItem("assessment_collapsed");
            if (savedState === "true") {
                grid.style.display = "none";
                icon.className = "fa-solid fa-chevron-down";
            } else {
                grid.style.display = "grid";
                icon.className = "fa-solid fa-chevron-up";
            }
            
            toggleBtn.onclick = () => {
                const isCollapsed = grid.style.display === "none";
                if (isCollapsed) {
                    grid.style.display = "grid";
                    icon.className = "fa-solid fa-chevron-up";
                    localStorage.setItem("assessment_collapsed", "false");
                } else {
                    grid.style.display = "none";
                    icon.className = "fa-solid fa-chevron-down";
                    localStorage.setItem("assessment_collapsed", "true");
                }
            };
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
            const sleepVal = document.getElementById("sleepQualityVal");
            const dietVal = document.getElementById("dietAdherenceVal");
            if (sleepVal) sleepVal.innerText = "8";
            if (dietVal) dietVal.innerText = "9";
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
    
    // Auto-initialize activeWorkoutDay if needed
    const todayStr = new Date().toISOString().substring(0, 10);
    const storageKey = `active_workout_day_${userId}_${todayStr}`;
    if (!activeWorkoutDay) {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            activeWorkoutDay = stored;
        } else if (todayCompletedExercises.length > 0) {
            // Auto-detect based on checked exercises
            for (const day of workouts.days) {
                let matches = 0;
                if (day.blocks) {
                    for (const block of day.blocks) {
                        if (block.exercises) {
                            for (const ex of block.exercises) {
                                if (todayCompletedExercises.includes(ex.id)) {
                                    matches++;
                                }
                            }
                        }
                    }
                }
                if (matches > 0) {
                    activeWorkoutDay = day.day_name;
                    localStorage.setItem(storageKey, activeWorkoutDay);
                    break;
                }
            }
        }
    }

    // Top Selector / Control Header
    let statusText = "";
    let buttonsHtml = "";
    if (!activeWorkoutDay) {
        statusText = `⚠️ <span style="color: var(--accent-gold); font-weight: 500;">No has seleccionado tu rutina de hoy.</span> Elige un día abajo para comenzar.`;
        buttonsHtml = `
            <button class="btn-secondary" onclick="setActiveWorkoutDay('rest')" style="padding: 5px 12px; font-size: 12px; height: 32px; display: flex; align-items: center; gap: 5px; margin: 0; cursor: pointer;">
                <i class="fa-solid fa-mug-hot"></i> Día de Descanso
            </button>
        `;
    } else if (activeWorkoutDay === 'rest') {
        statusText = `☕ <span style="color: var(--accent-green); font-weight: 600;">Hoy es tu Día de Descanso.</span> ¡Disfruta la recuperación!`;
        buttonsHtml = `
            <button class="btn-secondary" onclick="setActiveWorkoutDay('')" style="padding: 5px 12px; font-size: 12px; height: 32px; display: flex; align-items: center; gap: 5px; margin: 0; opacity: 0.8; cursor: pointer;">
                <i class="fa-solid fa-xmark"></i> Limpiar Descanso
            </button>
        `;
    } else {
        statusText = `🔥 <span style="color: var(--accent-cyan); font-weight: 700;">Entrenamiento Activo:</span> ${activeWorkoutDay}`;
        buttonsHtml = `
            <button class="btn-secondary" onclick="setActiveWorkoutDay('rest')" style="padding: 5px 12px; font-size: 12px; height: 32px; display: flex; align-items: center; gap: 5px; margin: 0; cursor: pointer;">
                <i class="fa-solid fa-mug-hot"></i> Día de Descanso
            </button>
            <button class="btn-secondary" onclick="setActiveWorkoutDay('')" style="padding: 5px 12px; font-size: 12px; height: 32px; display: flex; align-items: center; gap: 5px; margin: 0; opacity: 0.8; cursor: pointer;">
                <i class="fa-solid fa-trash-can"></i> Limpiar Registro
            </button>
        `;
    }

    const controlHeader = `
        <div class="glass-card" style="margin-bottom: 20px; padding: 15px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); border-radius: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; flex-direction: column; gap: 3px;">
                    <span style="font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); font-weight: 700; letter-spacing: 0.5px;">Registro de Hoy</span>
                    <span style="font-size: 13px; color: var(--color-text-primary);">${statusText}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${buttonsHtml}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <h3>Rutina Activa: ${workouts.title}</h3>
        <p style="color:var(--color-text-secondary); margin-bottom: 20px;">${workouts.description || ''}</p>
        ${controlHeader}
    `;
    
    workouts.days.forEach(day => {
        const dayCard = document.createElement("div");
        dayCard.className = "workout-day-card";
        dayCard.style.marginBottom = "20px";
        dayCard.style.padding = "20px";
        dayCard.style.borderRadius = "12px";
        
        const isActive = activeWorkoutDay === day.day_name;
        
        // Header actions
        let headerActionHtml = "";
        if (isActive) {
            headerActionHtml = `
                <span style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #22c55e; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-circle-check"></i> Activo Hoy
                </span>
            `;
            dayCard.style.border = "1px solid rgba(34, 197, 94, 0.3)";
            dayCard.style.background = "rgba(34, 197, 94, 0.02)";
        } else {
            if (!activeWorkoutDay) {
                headerActionHtml = `
                    <button class="btn-primary" onclick="setActiveWorkoutDay('${day.day_name}')" style="margin: 0; padding: 4px 12px; font-size: 11px; height: 28px; display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <i class="fa-solid fa-play"></i> Entrenar Hoy
                    </button>
                `;
            } else {
                headerActionHtml = `
                    <button class="btn-secondary" onclick="setActiveWorkoutDay('${day.day_name}')" style="margin: 0; padding: 4px 12px; font-size: 11px; height: 28px; display: flex; align-items: center; gap: 5px; opacity: 0.7; cursor: pointer;">
                        <i class="fa-solid fa-rotate"></i> Cambiar a este día
                    </button>
                `;
            }
        }
        
        let blocksHtml = "";
        if (day.blocks) {
            day.blocks.forEach(block => {
                let exercisesHtml = "";
                block.exercises.forEach(ex => {
                    const isChecked = todayCompletedExercises.includes(ex.id);
                    
                    let checkColumnHtml = "";
                    if (isActive) {
                        checkColumnHtml = `<input type="checkbox" id="check-exercise-${ex.id}" ${isChecked ? 'checked' : ''} onchange="toggleExerciseCheck(${ex.id}, this.checked)" style="width: 14px; height: 14px; cursor: pointer;">`;
                    } else {
                        checkColumnHtml = `<i class="fa-regular fa-circle" style="opacity: 0.35; font-size: 13px;"></i>`;
                    }
                    
                    exercisesHtml += `
                        <tr style="${!isActive ? 'opacity: 0.7;' : ''}">
                            <td style="padding: 6px 4px; text-align: center;">
                                ${checkColumnHtml}
                            </td>
                            <td class="exercise-name" style="padding: 6px 4px; font-size: 11px; font-weight: ${isChecked && isActive ? '600' : 'normal'}; color: ${isChecked && isActive ? 'var(--accent-cyan)' : 'var(--color-text-primary)'};">${ex.exercise_name}</td>
                            <td style="padding: 6px 4px;"><span class="compliance-badge" style="font-size: 10px; padding: 2px 6px;">${ex.sets_count} Series</span></td>
                            <td style="padding: 6px 4px;"><strong>${ex.reps_range}</strong></td>
                            <td style="padding: 6px 4px;">RPE ${ex.rpe_target || 'N/A'}</td>
                            <td style="padding: 6px 4px;">${ex.rest_seconds ? `${ex.rest_seconds}s` : '-'}</td>
                            <td style="padding: 6px 4px;">
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
                    <div style="margin-bottom: 12px; border-left: 2px solid var(--accent-cyan); padding-left: 10px; background: rgba(255,255,255,0.01); padding-top: 8px; padding-bottom: 8px; border-radius: 0 4px 4px 0;">
                        <h5 style="color: var(--accent-cyan); margin-bottom: 6px; font-size: 12px; margin-top: 0; font-weight: 700;">${block.name} <span style="color:var(--color-text-secondary); font-size:10px; font-weight:normal; opacity: 0.8;">[${block.routine_class}]</span></h5>
                        <div style="overflow-x: auto; width: 100%;">
                            <table class="exercise-table" style="font-size: 11px; white-space: nowrap; width: 100%;">
                                <thead>
                                    <tr>
                                        <th style="padding: 4px; width: 40px; text-align: center;">Done</th>
                                        <th style="padding: 4px; text-align: left;">Ejercicio</th>
                                        <th style="padding: 4px; text-align: left;">Series</th>
                                        <th style="padding: 4px; text-align: left;">Reps</th>
                                        <th style="padding: 4px; text-align: left;">RPE</th>
                                        <th style="padding: 4px; text-align: left;">Descanso</th>
                                        <th style="padding: 4px; text-align: left;">Video</th>
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <h4 style="margin: 0; color: ${isActive ? 'var(--accent-cyan)' : 'var(--color-text-primary)'}; font-size: 14px; font-weight: 700;">
                    <i class="fa-solid fa-dumbbell" style="margin-right: 5px;"></i> ${day.day_name}
                </h4>
                ${headerActionHtml}
            </div>
            <div style="margin-top: 10px;">
                ${blocksHtml}
            </div>
        `;
        container.appendChild(dayCard);
    });
}

async function setActiveWorkoutDay(dayName) {
    const todayStr = new Date().toISOString().substring(0, 10);
    const storageKey = `active_workout_day_${userId}_${todayStr}`;
    
    // If active day is changing and user has completed exercises today, prompt them
    if (activeWorkoutDay !== dayName && todayCompletedExercises.length > 0) {
        const confirmChange = confirm("Al cambiar el día de entrenamiento activo se limpiarán los ejercicios marcados hoy. ¿Deseas continuar?");
        if (!confirmChange) {
            renderWorkoutPlans();
            return;
        }
        // Clear checklist
        todayCompletedExercises = [];
        await saveChecklistStateToServer();
    }
    
    activeWorkoutDay = dayName;
    if (dayName) {
        localStorage.setItem(storageKey, dayName);
    } else {
        localStorage.removeItem(storageKey);
    }
    
    renderWorkoutPlans();
    renderClientDailyCalendar();
    
    // Update daily details panel if open for today
    const openPanelDate = document.getElementById('clientDayDetailDate')?.innerText;
    if (openPanelDate === todayStr) {
        const logs = clientFullData.daily_logs || [];
        const todayLog = logs.find(l => l.date === todayStr) || { date: todayStr };
        showClientDayDetails(todayLog);
    }
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
            
            const isChecked = todayCompletedMeals.includes(food.id);
            foodItemsHtml += `
                <div class="food-item" style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="check-meal-${food.id}" ${isChecked ? 'checked' : ''} onchange="toggleMealCheck(${food.id}, this.checked)" style="width: 14px; height: 14px; cursor: pointer;">
                    <div style="flex: 1;">
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
        view.style.display = tabId === 'clientChatView' ? 'flex' : 'block';
        view.classList.add('active');
    }
    
    // Highlight active nav item
    if (element) {
        element.classList.add('active');
    }
    
    // Chat specific hook
    if (tabId === 'clientChatView') {
        const badge = document.getElementById("clientChatBadge");
        if (badge) badge.style.display = 'none';
        
        chatHistoryOffset = 0;
        loadClientChatHistory(false);
        markChatAsRead();
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
    
    let completedExs = [];
    try {
        if (log.completed_exercises) {
            completedExs = typeof log.completed_exercises === 'string' ? JSON.parse(log.completed_exercises) : log.completed_exercises;
        }
    } catch (e) {
        console.error("Error parsing completed_exercises:", e);
    }
    if (!Array.isArray(completedExs)) completedExs = [];
    
    let completedMeals = [];
    try {
        if (log.completed_meals) {
            completedMeals = typeof log.completed_meals === 'string' ? JSON.parse(log.completed_meals) : log.completed_meals;
        }
    } catch (e) {
        console.error("Error parsing completed_meals:", e);
    }
    if (!Array.isArray(completedMeals)) completedMeals = [];
    
    // Resolve workout day from completed exercises
    let targetDay = null;
    if (clientFullData && clientFullData.workout_plan && completedExs.length > 0) {
        for (const day of clientFullData.workout_plan.days) {
            let matches = 0;
            if (day.blocks) {
                for (const block of day.blocks) {
                    if (block.exercises) {
                        for (const ex of block.exercises) {
                            if (completedExs.includes(ex.id) || completedExs.includes(ex.exercise_id)) {
                                matches++;
                            }
                        }
                    }
                }
            }
            if (matches > 0) {
                targetDay = day;
                break;
            }
        }
    }
    
    // Build Workout Plan Checklist HTML
    let workoutPlanHtml = "";
    if (targetDay) {
        workoutPlanHtml += `
            <div style="font-weight: 700; font-size: 12px; color: var(--accent-cyan); margin-bottom: 8px; text-transform: uppercase;">
                <i class="fa-solid fa-dumbbell"></i> Rutina: ${targetDay.day_name}
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
        `;
        targetDay.blocks.forEach(block => {
            block.exercises.forEach(ex => {
                const isCompleted = completedExs.includes(ex.id) || completedExs.includes(ex.exercise_id);
                workoutPlanHtml += `
                    <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: ${isCompleted ? 'var(--color-text-primary)' : 'var(--color-text-muted)'};">
                        <i class="${isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}" style="color: ${isCompleted ? 'var(--accent-cyan)' : 'var(--color-text-muted)'}; opacity: ${isCompleted ? '1' : '0.5'}; font-size: 14px; margin-top: 2px;"></i>
                        <div style="display: flex; flex-direction: column;">
                            <span style="${isCompleted ? 'font-weight: 500;' : 'opacity: 0.7;'}">${ex.exercise_name}</span>
                            <span style="font-size: 10px; color: var(--color-text-secondary);">${ex.sets_count}x${ex.reps_range} ${ex.rpe_target ? '(RPE ' + ex.rpe_target + ')' : ''}</span>
                        </div>
                    </div>
                `;
            });
        });
        workoutPlanHtml += `</div>`;
    } else if (completedExs.length > 0) {
        workoutPlanHtml += `
            <div style="font-weight: 700; font-size: 12px; color: var(--accent-cyan); margin-bottom: 8px; text-transform: uppercase;">
                <i class="fa-solid fa-dumbbell"></i> Ejercicios Completados (${completedExs.length})
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
        `;
        const names = completedExs.map(exId => {
            let name = null;
            if (clientFullData && clientFullData.workout_plan) {
                clientFullData.workout_plan.days.forEach(day => {
                    if (day.blocks) {
                        day.blocks.forEach(block => {
                            if (block.exercises) {
                                const found = block.exercises.find(ex => ex.id == exId || ex.exercise_id == exId);
                                if (found) name = found.exercise_name;
                            }
                        });
                    }
                });
            }
            return name || `Ejercicio #${exId}`;
        });
        names.forEach(name => {
            workoutPlanHtml += `
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-primary);">
                    <i class="fa-solid fa-circle-check" style="color: var(--accent-cyan); font-size: 14px;"></i>
                    <span>${name}</span>
                </div>
            `;
        });
        workoutPlanHtml += `</div>`;
    } else {
        workoutPlanHtml += `
            <div style="font-weight: 700; font-size: 12px; color: var(--color-text-secondary); margin-bottom: 8px; text-transform: uppercase;">
                <i class="fa-solid fa-dumbbell"></i> Ejercicios
            </div>
            <p style="margin: 0; font-size: 12px; color: var(--color-text-secondary); font-style: italic;">Sin ejercicios completados hoy.</p>
        `;
    }
    
    // Build Nutrition Plan Checklist HTML
    let nutritionPlanHtml = "";
    const meals = clientFullData?.nutrition_plan?.meals || [];
    if (meals.length > 0) {
        nutritionPlanHtml += `
            <div style="font-weight: 700; font-size: 12px; color: var(--accent-green); margin-bottom: 8px; text-transform: uppercase;">
                <i class="fa-solid fa-apple-whole"></i> Alimentación (${completedMeals.length} completados)
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto; padding-right: 4px;">
        `;
        meals.forEach(meal => {
            if (meal.items && meal.items.length > 0) {
                nutritionPlanHtml += `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-size: 10px; text-transform: uppercase; color: var(--accent-gold); font-weight: 700; border-bottom: 1px solid rgba(243, 202, 76, 0.1); padding-bottom: 2px;">${meal.meal_name}</span>
                `;
                meal.items.forEach(food => {
                    const isCompleted = completedMeals.includes(food.id);
                    nutritionPlanHtml += `
                        <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: ${isCompleted ? 'var(--color-text-primary)' : 'var(--color-text-muted)'}; margin-left: 4px;">
                            <i class="${isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}" style="color: ${isCompleted ? 'var(--accent-green)' : 'var(--color-text-muted)'}; opacity: ${isCompleted ? '1' : '0.5'}; font-size: 13px; margin-top: 2px;"></i>
                            <div style="display: flex; align-items: flex-start; flex-direction: column; flex: 1;">
                                <span style="${isCompleted ? 'font-weight: 500;' : 'opacity: 0.7;'}">${food.food_name}</span>
                                <span style="font-size: 9px; color: var(--color-text-secondary);">${food.weight_g}g | ${food.calories_kcal} Kcal</span>
                            </div>
                        </div>
                    `;
                });
                nutritionPlanHtml += `</div>`;
            }
        });
        nutritionPlanHtml += `</div>`;
    } else if (completedMeals.length > 0) {
        nutritionPlanHtml += `
            <div style="font-weight: 700; font-size: 12px; color: var(--accent-green); margin-bottom: 8px; text-transform: uppercase;">
                <i class="fa-solid fa-apple-whole"></i> Alimentos Consumidos (${completedMeals.length})
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
        `;
        const names = completedMeals.map(foodId => {
            let name = null;
            if (clientFullData && clientFullData.nutrition_plan && clientFullData.nutrition_plan.meals) {
                clientFullData.nutrition_plan.meals.forEach(meal => {
                    if (meal.items) {
                        const found = meal.items.find(food => food.id == foodId);
                        if (found) name = found.food_name;
                    }
                });
            }
            return name || `Alimento #${foodId}`;
        });
        names.forEach(name => {
            nutritionPlanHtml += `
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-primary);">
                    <i class="fa-solid fa-circle-check" style="color: var(--accent-green); font-size: 13px;"></i>
                    <span>${name}</span>
                </div>
            `;
        });
        nutritionPlanHtml += `</div>`;
    } else {
        nutritionPlanHtml += `
            <div style="font-weight: 700; font-size: 12px; color: var(--color-text-secondary); margin-bottom: 8px; text-transform: uppercase;">
                <i class="fa-solid fa-apple-whole"></i> Alimentación
            </div>
            <p style="margin: 0; font-size: 12px; color: var(--color-text-secondary); font-style: italic;">Sin alimentos completados hoy.</p>
        `;
    }

    const content = document.getElementById('clientDayDetailContent');
    content.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; margin-bottom: 4px;">
            <div class="summary-stat-box" style="padding: 8px 4px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); border-radius: 8px;">
                <span style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-weight-scale"></i> Peso</span>
                <strong style="font-size: 13px; color: var(--accent-gold); margin-top: 3px;">${log.weight_kg ? log.weight_kg + ' kg' : '-'}</strong>
            </div>
            <div class="summary-stat-box" style="padding: 8px 4px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); border-radius: 8px;">
                <span style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-person-running"></i> Pasos</span>
                <strong style="font-size: 13px; color: var(--accent-gold); margin-top: 3px;">${log.steps_count ? log.steps_count : '-'}</strong>
            </div>
            <div class="summary-stat-box" style="padding: 8px 4px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); border-radius: 8px;">
                <span style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-bed"></i> Sueño</span>
                <strong style="font-size: 13px; color: var(--accent-gold); margin-top: 3px;">${log.sleep_hours ? log.sleep_hours + 'h' : '-'}</strong>
                ${log.sleep_quality ? `<span style="font-size: 8px; color: var(--color-text-muted);">Calidad: ${log.sleep_quality}/10</span>` : ''}
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; margin-bottom: 5px;">
            <div class="summary-stat-box" style="padding: 8px 4px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); border-radius: 8px;">
                <span style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-droplet" style="color: #3b82f6;"></i> Agua</span>
                <strong style="font-size: 13px; color: var(--accent-gold); margin-top: 3px;">${log.water_intake_ml ? log.water_intake_ml + ' ml' : '-'}</strong>
            </div>
            <div class="summary-stat-box" style="padding: 8px 4px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); border-radius: 8px;">
                <span style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-apple-whole" style="color: #ef4444;"></i> Adherencia</span>
                <strong style="font-size: 13px; color: var(--accent-gold); margin-top: 3px;">${log.diet_adherence ? log.diet_adherence + '/10' : '-'}</strong>
            </div>
        </div>
        
        <div style="display: flex; flex-direction: row; gap: 15px; flex-wrap: wrap; width: 100%; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
            <div style="flex: 1; min-width: 210px; display: flex; flex-direction: column;">
                ${workoutPlanHtml}
            </div>
            <div style="flex: 1; min-width: 210px; display: flex; flex-direction: column;">
                ${nutritionPlanHtml}
            </div>
        </div>
        
        ${log.notes ? `<div style="width: 100%; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; color: var(--color-text-secondary); font-size: 12px; font-style: italic; text-align: center;">"${log.notes}"</div>` : ''}
    `;
}

// --- Checkbox toggle persistence handlers ---
async function toggleExerciseCheck(exId, checked) {
    if (checked) {
        if (!todayCompletedExercises.includes(exId)) {
            todayCompletedExercises.push(exId);
        }
    } else {
        todayCompletedExercises = todayCompletedExercises.filter(id => id !== exId);
    }
    await saveChecklistStateToServer();
}

async function toggleMealCheck(foodId, checked) {
    if (checked) {
        if (!todayCompletedMeals.includes(foodId)) {
            todayCompletedMeals.push(foodId);
        }
    } else {
        todayCompletedMeals = todayCompletedMeals.filter(id => id !== foodId);
    }
    await saveChecklistStateToServer();
}

async function saveChecklistStateToServer() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const payload = {
        user_id: userId,
        date: todayStr,
        completed_exercises: JSON.stringify(todayCompletedExercises),
        completed_meals: JSON.stringify(todayCompletedMeals)
    };
    
    try {
        await fetch('/api/daily_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (clientFullData && clientFullData.daily_logs) {
            const idx = clientFullData.daily_logs.findIndex(l => l.date === todayStr);
            if (idx !== -1) {
                clientFullData.daily_logs[idx].completed_exercises = JSON.stringify(todayCompletedExercises);
                clientFullData.daily_logs[idx].completed_meals = JSON.stringify(todayCompletedMeals);
            } else {
                clientFullData.daily_logs.push({
                    date: todayStr,
                    completed_exercises: JSON.stringify(todayCompletedExercises),
                    completed_meals: JSON.stringify(todayCompletedMeals)
                });
            }
        }
    } catch (err) {
        console.error("Error saving checklist to server:", err);
    }
}

// ==========================================
// CLIENT CHAT SYSTEM (REAL-TIME WEBSOCKET)
// ==========================================

let clientSocket = null;
let chatHistoryOffset = 0;
const chatHistoryLimit = 30;

function playChimeSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.1); // A5
        
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    } catch(e) {
        console.error("Audio Context not supported", e);
    }
}

function connectClientWebSocket() {
    if (clientSocket && clientSocket.readyState === WebSocket.OPEN) return;
    
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = localStorage.getItem('jwtToken') || '';
    
    // Retrieve trainerId from sessionStorage or url
    const trainerId = sessionStorage.getItem('trainerId') || 'admin';
    
    clientSocket = new WebSocket(`${wsProto}//${host}/ws/chat?trainer=${trainerId}&userId=${userId}&token=${token}`);
    
    clientSocket.onopen = function() {
        console.log("Chat WS: Connected successfully");
    };
    
    clientSocket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'presence') {
            const dot = document.getElementById("coachOnlineStatusDot");
            const text = document.getElementById("coachOnlineStatusText");
            if (dot && text) {
                if (data.status === 'online') {
                    dot.style.background = "#22c55e";
                    text.innerText = "En línea";
                } else {
                    dot.style.background = "#6b7280";
                    text.innerText = "Desconectado";
                }
            }
        } else if (data.type === 'receipt') {
            const tickEl = document.getElementById(`tick-${data.id}`);
            if (tickEl) {
                tickEl.innerHTML = data.delivered ? '<i class="fa-solid fa-check-double" style="color: var(--color-text-secondary);"></i>' : '<i class="fa-solid fa-check"></i>';
            }
        } else if (data.type === 'read_receipt') {
            document.querySelectorAll('.chat-tick').forEach(tick => {
                tick.innerHTML = '<i class="fa-solid fa-check-double" style="color: var(--accent-cyan);"></i>';
            });
        } else {
            const isTabActive = document.getElementById("clientChatView").classList.contains("active");
            
            if (isTabActive) {
                renderClientChatMessage(data, false);
                markChatAsRead();
                scrollToBottomClientChat();
            } else {
                const badge = document.getElementById("clientChatBadge");
                if (badge) badge.style.display = 'block';
                playChimeSound();
            }
        }
    };
    
    clientSocket.onclose = function() {
        console.log("Chat WS: Connection closed, reconnecting in 5s...");
        setTimeout(connectClientWebSocket, 5000);
    };
    
    clientSocket.onerror = function(err) {
        console.error("Chat WS Error:", err);
    };
}

async function loadClientChatHistory(appendBefore = false) {
    try {
        const response = await fetch(`/api/chat/history?userId=${userId}&otherId=0&limit=${chatHistoryLimit}&offset=${chatHistoryOffset}`);
        const data = await response.json();
        
        if (data.success) {
            const container = document.getElementById("clientChatMessagesContainer");
            const loadMoreBtn = document.getElementById("clientChatLoadMoreBtn");
            
            if (!appendBefore) {
                container.innerHTML = "";
            }
            
            const messages = data.messages || [];
            
            if (messages.length < chatHistoryLimit) {
                loadMoreBtn.style.display = "none";
            } else {
                loadMoreBtn.style.display = "block";
            }
            
            const oldScrollHeight = document.getElementById("clientChatStream").scrollHeight;
            
            messages.forEach(msg => {
                renderClientChatMessage(msg, appendBefore);
            });
            
            if (appendBefore) {
                const newScrollHeight = document.getElementById("clientChatStream").scrollHeight;
                document.getElementById("clientChatStream").scrollTop += (newScrollHeight - oldScrollHeight);
            } else {
                scrollToBottomClientChat();
            }
            
            loadMoreBtn.onclick = function() {
                chatHistoryOffset += chatHistoryLimit;
                loadClientChatHistory(true);
            };
        }
    } catch (e) {
        console.error("Error loading chat history:", e);
    }
}

function renderClientChatMessage(msg, appendBefore = false) {
    const container = document.getElementById("clientChatMessagesContainer");
    if (!container) return;
    
    if (document.getElementById(`msg-${msg.id}`)) return;
    
    const isMe = msg.sender_id === userId;
    const dateObj = new Date(msg.created_at);
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const msgDiv = document.createElement("div");
    msgDiv.id = `msg-${msg.id}`;
    msgDiv.style.display = "flex";
    msgDiv.style.flexDirection = "column";
    msgDiv.style.alignSelf = isMe ? "flex-end" : "flex-start";
    msgDiv.style.maxWidth = "75%";
    msgDiv.style.gap = "2px";
    
    const bubble = document.createElement("div");
    bubble.style.padding = "10px 14px";
    bubble.style.borderRadius = isMe ? "16px 16px 2px 16px" : "16px 16px 16px 2px";
    bubble.style.fontSize = "13px";
    bubble.style.lineHeight = "1.4";
    bubble.style.wordBreak = "break-word";
    
    if (isMe) {
        bubble.style.background = "linear-gradient(135deg, rgba(14, 165, 233, 0.4), rgba(139, 92, 246, 0.4))";
        bubble.style.border = "1px solid rgba(14, 165, 233, 0.3)";
        bubble.style.color = "white";
    } else {
        bubble.style.background = "rgba(255, 255, 255, 0.06)";
        bubble.style.border = "1px solid rgba(255, 255, 255, 0.08)";
        bubble.style.color = "#f3f4f6";
    }
    bubble.innerText = msg.message;
    
    const infoRow = document.createElement("div");
    infoRow.style.display = "flex";
    infoRow.style.alignItems = "center";
    infoRow.style.justifyContent = isMe ? "flex-end" : "flex-start";
    infoRow.style.gap = "5px";
    infoRow.style.fontSize = "10px";
    infoRow.style.color = "var(--color-text-muted)";
    
    const timeSpan = document.createElement("span");
    timeSpan.innerText = timeStr;
    infoRow.appendChild(timeSpan);
    
    if (isMe) {
        const tickSpan = document.createElement("span");
        tickSpan.id = `tick-${msg.id}`;
        tickSpan.className = "chat-tick";
        if (msg.is_read) {
            tickSpan.innerHTML = '<i class="fa-solid fa-check-double" style="color: var(--accent-cyan);"></i>';
        } else {
            tickSpan.innerHTML = '<i class="fa-solid fa-check-double" style="color: var(--color-text-secondary);"></i>';
        }
        infoRow.appendChild(tickSpan);
    }
    
    msgDiv.appendChild(bubble);
    msgDiv.appendChild(infoRow);
    
    if (appendBefore) {
        container.insertBefore(msgDiv, container.firstChild);
    } else {
        container.appendChild(msgDiv);
    }
}

async function sendClientChatMessage() {
    const input = document.getElementById("clientChatInput");
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    const tempId = "temp-" + Date.now();
    const tempMsg = {
        id: tempId,
        sender_id: userId,
        receiver_id: 0,
        message: text,
        is_read: false,
        created_at: new Date().toISOString()
    };
    
    renderClientChatMessage(tempMsg, false);
    scrollToBottomClientChat();
    input.value = "";
    
    if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({
            "receiver_id": 0,
            "message": text
        }));
    } else {
        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_id: userId,
                    receiver_id: 0,
                    message: text
                })
            });
            const data = await response.json();
            if (data.success) {
                const tempEl = document.getElementById(`msg-${tempId}`);
                if (tempEl) {
                    tempEl.id = `msg-${data.message_id}`;
                    const tick = tempEl.querySelector('.chat-tick');
                    if (tick) {
                        tick.id = `tick-${data.message_id}`;
                        tick.innerHTML = '<i class="fa-solid fa-check"></i>';
                    }
                }
            }
        } catch (e) {
            console.error("REST send fallback failed:", e);
        }
        connectClientWebSocket();
    }
}

function handleClientChatKeydown(event) {
    if (event.key === "Enter") {
        sendClientChatMessage();
    }
}

async function markChatAsRead() {
    try {
        await fetch('/api/chat/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: 0,
                receiver_id: userId
            })
        });
    } catch(e) {
        console.error("Error marking chat as read:", e);
    }
}

function scrollToBottomClientChat() {
    setTimeout(() => {
        const stream = document.getElementById("clientChatStream");
        if (stream) {
            stream.scrollTop = stream.scrollHeight;
        }
    }, 50);
}
