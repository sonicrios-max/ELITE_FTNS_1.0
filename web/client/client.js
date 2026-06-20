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
                if (logoSpan) {
                    logoSpan.innerText = config.name.toUpperCase();
                }
            }
        } catch (e) {
            console.error("Error loading theme config:", e);
        }
    });
})();

let userId = 1;
let activeTab = 'tabRutinas';
let clientFullData = null;

// Chart.js Instances
let weightChartInstance = null;
let stepsChartInstance = null;



// Hydration State
let currentWaterIntakeMl = 0;

function initClientDashboard() {
    // Parse userId from query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('userId');
    if (idParam) {
        userId = parseInt(idParam);
    }
    
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
        setupHydrationWidget();

    } catch (err) {
        console.error("Error loading client data:", err);
        document.getElementById("clientNameHeader").innerText = "Error al cargar";
    }
}

function displayClientHeader() {
    const user = clientFullData.profile;
    document.getElementById("clientNameHeader").innerText = `${user.first_name} ${user.last_name}`;
}

function populateKPIs() {
    const assessments = clientFullData.assessments || [];
    const diet = clientFullData.nutrition_plan;
    
    // 1. Weight KPI
    if (assessments.length > 0) {
        const latest = assessments[assessments.length - 1];
        document.getElementById("clientKpiWeight").innerText = `${latest.weight_kg || 0} kg`;
        document.getElementById("clientKpiWeightDesc").innerText = `Registrado el: ${latest.date}`;
        
        // 2. Fat KPI
        const fatPct = latest.body_fat_percentage !== null && latest.body_fat_percentage !== undefined ? latest.body_fat_percentage : 0.0;
        const leanMass = latest.lean_mass_kg !== null && latest.lean_mass_kg !== undefined ? latest.lean_mass_kg : ((latest.weight_kg || 0) - ((latest.weight_kg || 0) * (fatPct / 100.0)));
        document.getElementById("clientKpiFat").innerText = `${fatPct.toFixed(1)}%`;
        document.getElementById("clientKpiFatDesc").innerText = `Masa magra: ${leanMass.toFixed(1)} kg`;
    } else {
        document.getElementById("clientKpiWeight").innerText = "-";
        document.getElementById("clientKpiFat").innerText = "-";
    }
    
    // 3. Nutrition KPI
    if (diet) {
        document.getElementById("clientKpiCalories").innerText = `${diet.target_calories || 0} Kcal`;
        document.getElementById("clientKpiMacrosDesc").innerText = `P: ${diet.target_protein || 0}g | C: ${diet.target_carbs || 0}g | G: ${diet.target_fat || 0}g`;
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
                            <td>
                                <input type="checkbox" id="check-${ex.id}" style="width: 18px; height: 18px; cursor: pointer;">
                            </td>
                            <td class="exercise-name">${ex.exercise_name}</td>
                            <td><span class="compliance-badge">${ex.sets_count} Series</span></td>
                            <td><strong>${ex.reps_range}</strong></td>
                            <td>RPE ${ex.rpe_target || 'N/A'}</td>
                            <td>${ex.rest_seconds ? `${ex.rest_seconds}s` : '-'}</td>
                            <td>
                                ${ex.video_url ? `<a href="#" class="exercise-video-link" onclick="playVideo(event, '${ex.video_url}', this)"><i class="fa-solid fa-circle-play"></i> Técnica</a>` : '-'}
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
                    <div style="margin-bottom: 20px; border-left: 3px solid var(--accent-cyan); padding-left: 12px; background: rgba(0,0,0,0.1); padding-top: 10px; padding-bottom: 10px; border-radius: 0 8px 8px 0;">
                        <h5 style="color: var(--accent-cyan); margin-bottom: 10px; font-size: 14px;">Bloque: ${block.name} <span style="color:var(--color-text-secondary); font-size:11px; font-weight:normal;">[${block.routine_class}]</span></h5>
                        <table class="exercise-table">
                            <thead>
                                <tr>
                                    <th style="width: 40px;">Hecho</th>
                                    <th>Ejercicio</th>
                                    <th>Series</th>
                                    <th>Reps</th>
                                    <th>RPE</th>
                                    <th>Descanso</th>
                                    <th>Multimedia</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${exercisesHtml}
                            </tbody>
                        </table>
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
    
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
            <h3>Mi Plan: ${diet.title}</h3>
            <span style="font-size:12px; color:var(--color-text-secondary);">Activo desde: ${diet.start_date}</span>
        </div>
        <p style="color:var(--color-text-secondary); margin-bottom: 20px;">${diet.description || ''}</p>
        <div style="margin-bottom: 20px;">
            <span class="compliance-badge" style="background:rgba(139,92,246,0.15); color:var(--accent-purple); border-color:rgba(139,92,246,0.3); font-size:14px; padding: 8px 12px;">
                Meta Diaria: ${diet.target_calories} Kcal | P: ${diet.target_protein}g | C: ${diet.target_carbs}g | G: ${diet.target_fat}g
            </span>
        </div>
    `;
    
    diet.meals.forEach(meal => {
        const mealBox = document.createElement("div");
        mealBox.className = "diet-meal-box";
        
        let foodItemsHtml = "";
        let mCal = 0, mPro = 0, mCarb = 0, mFat = 0;
        
        meal.items.forEach(food => {
            mCal += food.calories_kcal;
            mPro += food.protein_g;
            mCarb += food.carbs_g;
            mFat += food.fat_g;
            
            foodItemsHtml += `
                <div class="food-item">
                    <div>
                        <span class="food-name">${food.food_name}</span>
                        <span style="color:var(--color-text-muted); font-size:12px;"> (${food.weight_g}g)</span>
                    </div>
                    <div style="text-align:right;">
                        <span class="food-macros">P: ${food.protein_g}g | C: ${food.carbs_g}g | G: ${food.fat_g}g</span>
                        <strong style="color:var(--accent-purple); margin-left:10px;">${food.calories_kcal} Kcal</strong>
                    </div>
                </div>
            `;
        });
        
        mealBox.innerHTML = `
            <h4>
                <span>${meal.meal_name}</span>
                <span style="font-size:12px; font-weight:normal; color:var(--color-text-secondary);">
                    Subtotal: ${mCal} Kcal (P: ${mPro.toFixed(1)}g | C: ${mCarb.toFixed(1)}g | G: ${mFat.toFixed(1)}g)
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



// Tab switcher
function switchTab(tabId) {
    activeTab = tabId;
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => btn.classList.remove("active"));
    
    const panels = document.querySelectorAll(".tab-panel");
    panels.forEach(p => p.classList.remove("active"));
    
    document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add("active");
    document.getElementById(tabId).classList.add("active");
}

function exportToPDF() {
    window.print();
}

