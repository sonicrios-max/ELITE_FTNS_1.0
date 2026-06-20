// Trainer Dashboard JavaScript Logic
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

let activeUserId = 1;
let activeTab = 'tabFicha';
let usersData = [];
let selectedUserFullData = null;

// Chart.js Instances
let weightChartInstance = null;
let stepsChartInstance = null;
let hrvChartInstance = null;
let sleepChartInstance = null;



function initTrainerDashboard() {
    loadClientsList();

}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTrainerDashboard);
} else {
    initTrainerDashboard();
}

// Load client names into sidebar
async function loadClientsList() {
    try {
        const response = await fetch('/api/clients');
        usersData = await response.json();
        renderClientList();
        
        // Select first client by default
        if (usersData.length > 0) {
            selectClient(usersData[0].id);
        }
    } catch (err) {
        console.error("Error fetching clients list:", err);
        document.getElementById("clientList").innerHTML = `
            <div style="color: var(--accent-red); padding: 15px; text-align: center;">
                <i class="fa-solid fa-triangle-exclamation"></i> Error al cargar datos.
            </div>`;
    }
}

function renderClientList() {
    const listContainer = document.getElementById("clientList");
    listContainer.innerHTML = "";
    
    usersData.forEach(user => {
        const isActive = user.id === activeUserId;
        const card = document.createElement("div");
        card.className = `client-card-item ${isActive ? 'active' : ''}`;
        card.onclick = () => selectClient(user.id);
        
        // Calculate compliance based on real adherence score
        const score = parseFloat(user.adherence_score) || 0;
        let badgeClass = 'compliance-badge warning';
        let badgeText = 'Baja Adherencia';
        let customStyle = '';
        
        if (score >= 8.5) {
            badgeClass = 'compliance-badge';
            badgeText = 'Alta Adherencia';
        } else if (score >= 6.0) {
            badgeClass = 'compliance-badge warning';
            badgeText = 'Media Adherencia';
        } else {
            badgeClass = 'compliance-badge';
            badgeText = 'Baja Adherencia';
            customStyle = 'background: rgba(220, 38, 38, 0.2); color: var(--accent-red);';
        }
        
        card.innerHTML = `
            <div class="client-info">
                <h4>${user.first_name} ${user.last_name}</h4>
                <p><i class="fa-solid fa-envelope"></i> ${user.email}</p>
            </div>
            <span class="${badgeClass}" style="${customStyle}">${badgeText} (${score.toFixed(1)})</span>
        `;
        listContainer.appendChild(card);
    });
}

// Select a client and load detailed data
async function selectClient(userId) {
    activeUserId = userId;
    
    // Update active class in sidebar
    const items = document.querySelectorAll(".client-card-item");
    items.forEach((item, index) => {
        if (usersData[index] && usersData[index].id === userId) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    try {
        // Fetch detailed profile, assessments, daily logs, and nutrition/workout plans
        const response = await fetch(`/api/clients/${userId}`);
        selectedUserFullData = await response.json();
        
        displayUserProfile();
        calculateAndDisplayKPIs();
        renderAssessmentsTable();
        initOrUpdateCharts();
        renderWorkoutPlans();
        renderNutritionPlans();
        document.getElementById("profileHeaderCard").style.display = "block";
        document.getElementById("kpiContainer").style.display = "grid";
        document.getElementById("tabsCard").style.display = "block";
        
        // Clear new assessment form if open
        document.getElementById("newAssessmentFormContainer").style.display = "none";
        document.getElementById("assessmentForm").reset();
    } catch (err) {
        console.error(`Error loading client ${userId}:`, err);
    }
}

// Populate Client Personal Info
function displayUserProfile() {
    const user = selectedUserFullData.profile;
    document.getElementById("clientFullName").innerText = `${user.first_name} ${user.last_name}`;
    document.getElementById("clientEmailPhone").innerText = `${user.email} | Tel: ${user.phone || 'N/A'}`;
    
    // Compute age
    let age = "N/A";
    if (user.birthdate) {
        const birth = new Date(user.birthdate);
        const diff = Date.now() - birth.getTime();
        const ageDate = new Date(diff);
        age = Math.abs(ageDate.getUTCFullYear() - 1970);
    }
    
    document.getElementById("clientAge").innerText = `${age} años`;
    document.getElementById("clientHeight").innerText = `${user.height_cm} cm`;
    document.getElementById("clientBlood").innerText = user.blood_type || '-';
    
    let sched = "No especificada";
    if (user.availability_schedule) {
        try {
            const sch = JSON.parse(user.availability_schedule);
            // simple summary
            const keys = Object.keys(sch);
            if (keys.length > 0) {
                sched = `${keys.length} días (${sch[keys[0]]})`;
            }
        } catch(e) {
            sched = user.availability_schedule;
        }
    }
    document.getElementById("clientSchedule").innerText = sched;
    document.getElementById("clientAllergies").innerText = user.allergies || "Ninguna";
    document.getElementById("clientMedications").innerText = user.medications || "Ninguno";
}

// Compute Body Composition and Health KPIs
function calculateAndDisplayKPIs() {
    const assessments = selectedUserFullData.assessments;
    
    if (!assessments || assessments.length === 0) {
        document.getElementById("kpiFFMI").innerText = "-";
        document.getElementById("kpiFatPct").innerText = "-";
        document.getElementById("kpiWtHR").innerText = "-";
        return;
    }
    
    // Latest assessment is the last element
    const latest = assessments[assessments.length - 1];
    
    // 1. Fat %
    const fatPct = latest.body_fat_percentage || 0.0;
    document.getElementById("kpiFatPct").innerText = `${fatPct.toFixed(1)}%`;
    document.getElementById("kpiFatPctDesc").innerText = `Masa Grasa: ${(latest.fat_mass_kg || 0.0).toFixed(1)} kg`;
    
    // 2. FFMI (Masa Libre de Grasa)
    // Formula: Lean Mass / (Height in m)^2
    const heightM = latest.height_cm / 100.0;
    const leanMassKg = latest.lean_mass_kg || (latest.weight_kg - (latest.weight_kg * (fatPct / 100.0)));
    const ffmi = leanMassKg / (heightM * heightM);
    // Normalized FFMI = FFMI + 6.1 * (1.8 - Height)
    const normalizedFfmi = ffmi + 6.1 * (1.8 - heightM);
    
    document.getElementById("kpiFFMI").innerText = normalizedFfmi.toFixed(1);
    document.getElementById("kpiFFMIDesc").innerText = `Masa Magra: ${leanMassKg.toFixed(1)} kg`;
    
    // 3. Waist to Height Ratio (WtHR)
    const abdomen = latest.abdomen || 0.0;
    const wthr = abdomen / latest.height_cm;
    document.getElementById("kpiWtHR").innerText = wthr.toFixed(2);
    
    let wthrDesc = "Nivel Óptimo";
    if (wthr > 0.5) wthrDesc = "Riesgo Cardiovascular";
    document.getElementById("kpiWtHRDesc").innerText = wthrDesc;
}

// Render Assessments Table
function renderAssessmentsTable() {
    const body = document.getElementById("assessmentHistoryBody");
    body.innerHTML = "";
    
    const assessments = selectedUserFullData.assessments;
    if (!assessments || assessments.length === 0) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;">No hay registros de valoración.</td></tr>`;
        return;
    }
    
    // Render in reverse chronological order (newest first)
    const sorted = [...assessments].reverse();
    
    sorted.forEach(as => {
        const leanMass = as.lean_mass_kg || (as.weight_kg - (as.weight_kg * (as.body_fat_percentage / 100.0)));
        const sumFolds = as.sum_folds || (as.scapular + as.triceps + as.abdominal + as.suprailiac);
        
        const row = document.createElement("tr");
        row.innerHTML = `
            <td style="font-weight:700; color:var(--accent-cyan);">${as.date}</td>
            <td>${as.weight_kg} kg</td>
            <td>${as.bmi.toFixed(1)}</td>
            <td><strong>${(as.body_fat_percentage || 0).toFixed(1)}%</strong></td>
            <td>${as.abdomen || '-'} cm</td>
            <td>${as.right_bicep || '-'} cm</td>
            <td>${leanMass.toFixed(1)} kg</td>
            <td>${sumFolds ? sumFolds.toFixed(1) + ' mm' : '-'}</td>
        `;
        body.appendChild(row);
    });
}

// Render Workout Plans
function renderWorkoutPlans() {
    const container = document.getElementById("workoutPlanContainer");
    container.innerHTML = "";
    
    const workouts = selectedUserFullData.workout_plan;
    if (!workouts || workouts.days.length === 0) {
        container.innerHTML = `
            <h3>Plan de Entrenamiento Activo</h3>
            <div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">
                Este usuario no cuenta con un plan de entrenamiento asignado.
            </div>`;
        return;
    }
    
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
            <h3>Plan: ${workouts.title}</h3>
            <span style="font-size:12px; color:var(--color-text-secondary);">${workouts.start_date} a ${workouts.end_date}</span>
        </div>
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
                            <td class="exercise-name">${ex.exercise_name}</td>
                            <td><span class="compliance-badge">${ex.sets_count} Series</span></td>
                            <td><strong>${ex.reps_range}</strong></td>
                            <td>RPE ${ex.rpe_target || 'N/A'}</td>
                            <td>${ex.rest_seconds ? ex.rest_seconds + 's' : '-'}</td>
                            <td>
                                ${ex.video_url ? `<a href="#" class="exercise-video-link" onclick="playVideo(event, '${ex.video_url}', this)"><i class="fa-solid fa-circle-play"></i> Ver Técnica</a>` : '-'}
                            </td>
                        </tr>
                        <tr id="video-row-${ex.id}" style="display:none;">
                            <td colspan="6">
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
                                    <th>Ejercicio</th>
                                    <th>Series</th>
                                    <th>Rango Reps</th>
                                    <th>Esfuerzo (RPE)</th>
                                    <th>Descanso</th>
                                    <th>Multimedia Propia</th>
                                </tr>
                            </thead>
                            <tbody>${exercisesHtml}</tbody>
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
        linkElem.innerHTML = `<i class="fa-solid fa-circle-stop"></i> Cerrar Video`;
    } else {
        video.pause();
        row.style.display = 'none';
        container.style.display = 'none';
        linkElem.innerHTML = `<i class="fa-solid fa-circle-play"></i> Ver Técnica`;
    }
}

// Render Nutrition Plans
function renderNutritionPlans() {
    const container = document.getElementById("nutritionPlanContainer");
    container.innerHTML = "";
    
    const diet = selectedUserFullData.nutrition_plan;
    if (!diet || diet.meals.length === 0) {
        container.innerHTML = `
            <h3>Plan Alimenticio Activo</h3>
            <div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">
                Este usuario no cuenta con un plan de alimentación asignado.
            </div>`;
        return;
    }
    
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
            <div style="display:flex; align-items:center; gap: 15px;">
                <h3>Plan: ${diet.title}</h3>
                <button class="btn-nav" style="color: var(--accent-red);" onclick="deleteNutritionPlan(${diet.id})"><i class="fa-solid fa-trash"></i> Eliminar Plan</button>
            </div>
            <span class="compliance-badge" style="background:rgba(139,92,246,0.15); color:var(--accent-purple); border-color:rgba(139,92,246,0.3)">
                Target: ${diet.target_calories} Kcal | P: ${diet.target_protein}g | C: ${diet.target_carbs}g | F: ${diet.target_fat}g
            </span>
        </div>
        <p style="color:var(--color-text-secondary); margin-bottom: 20px;">${diet.description || ''}</p>
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
                <span>Subtotal: ${mCal} Kcal (P: ${mPro.toFixed(1)}g | C: ${mCarb.toFixed(1)}g | G: ${mFat.toFixed(1)}g)</span>
            </h4>
            <div class="food-item-list">
                ${foodItemsHtml}
            </div>
        `;
        container.appendChild(mealBox);
    });
}

// Chart Renderings
function initOrUpdateCharts() {
    const logs = selectedUserFullData.daily_logs || [];
    
    // Sort logs by date ascending for charts
    const sortedLogs = [...logs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    const dates = sortedLogs.map(l => l.date);
    const weights = sortedLogs.map(l => l.weight_kg);
    const steps = sortedLogs.map(l => l.steps_count);
    const hrv = sortedLogs.map(l => l.hrv);
    const rhr = sortedLogs.map(l => l.resting_hr);
    const sleep = sortedLogs.map(l => l.sleep_hours);
    const adherence = sortedLogs.map(l => l.diet_adherence);
    
    const textMuted = '#bbbbbb';
    const gridColor = 'rgba(255, 255, 255, 0.05)';
    
    // 1. Weight Chart
    if (weightChartInstance) weightChartInstance.destroy();
    const ctxWeight = document.getElementById("chartWeight").getContext("2d");
    weightChartInstance = new Chart(ctxWeight, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Peso (kg)',
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
    const ctxSteps = document.getElementById("chartSteps").getContext("2d");
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

    // 3. HRV & resting Heart Rate
    if (hrvChartInstance) hrvChartInstance.destroy();
    const ctxHRV = document.getElementById("chartHRV").getContext("2d");
    hrvChartInstance = new Chart(ctxHRV, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'HRV (ms)',
                    data: hrv,
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    tension: 0.2,
                    yAxisID: 'y'
                },
                {
                    label: 'FC Reposo (bpm)',
                    data: rhr,
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    position: 'left',
                    grid: { color: gridColor },
                    ticks: { color: textMuted }
                },
                y1: {
                    position: 'right',
                    grid: { display: false },
                    ticks: { color: textMuted }
                },
                x: { grid: { display: false }, ticks: { color: textMuted } }
            }
        }
    });

    // 4. Sleep & Adherence
    if (sleepChartInstance) sleepChartInstance.destroy();
    const ctxSleep = document.getElementById("chartSleepAdherence").getContext("2d");
    sleepChartInstance = new Chart(ctxSleep, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [
                {
                    type: 'bar',
                    label: 'Horas de Sueño',
                    data: sleep,
                    backgroundColor: 'rgba(243, 202, 76, 0.35)',
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Adherencia Dieta (1-10)',
                    data: adherence,
                    borderColor: '#e09b12',
                    borderWidth: 3,
                    fill: false,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { position: 'left', ticks: { color: textMuted } },
                y1: { position: 'right', max: 10, min: 0, ticks: { color: textMuted } },
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
    
    // Find active tab elements
    document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add("active");
    document.getElementById(tabId).classList.add("active");
}

function toggleNewAssessmentForm() {
    const container = document.getElementById("newAssessmentFormContainer");
    if (container.style.display === "none") {
        container.style.display = "block";
        // Default date to today
        document.getElementById("formDate").value = new Date().toISOString().substring(0, 10);
    } else {
        container.style.display = "none";
    }
}

// Submit New Assessment (Ficha) to API
async function submitNewAssessment(event) {
    event.preventDefault();
    
    const date = document.getElementById("formDate").value;
    const weight = parseFloat(document.getElementById("formWeight").value);
    const fcRep = parseInt(document.getElementById("formFcRep").value) || 60;
    const neck = parseFloat(document.getElementById("formNeck").value);
    const chest = parseFloat(document.getElementById("formChest").value);
    const abdomen = parseFloat(document.getElementById("formAbdomen").value);
    const rightBicep = parseFloat(document.getElementById("formBicepD").value);
    const rightThigh = parseFloat(document.getElementById("formThighD").value);
    
    const triceps = parseFloat(document.getElementById("formFoldTriceps").value);
    const scapular = parseFloat(document.getElementById("formFoldScapular").value);
    const iliac = parseFloat(document.getElementById("formFoldIliac").value);
    const abdominal = parseFloat(document.getElementById("formFoldAbdominal").value);
    
    const payload = {
        user_id: activeUserId,
        date,
        weight_kg: weight,
        height_cm: selectedUserFullData.profile.height_cm,
        fc_rep: fcRep,
        neck,
        chest,
        abdomen,
        right_bicep: rightBicep,
        right_thigh: rightThigh,
        
        triceps,
        scapular,
        iliac,
        abdominal
    };
    
    try {
        const response = await fetch('/api/assessments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.success) {
            // Re-select client to update UI
            alert("Evaluación guardada exitosamente.");
            selectClient(activeUserId);
        } else {
            alert("Error al guardar: " + result.error);
        }
    } catch (err) {
        console.error("Error submitting assessment:", err);
        alert("Error de conexión al guardar.");
    }
}

// Modal handling
function openAddClientModal() {
    document.getElementById("addClientModal").style.display = "flex";
}

function closeAddClientModal() {
    document.getElementById("addClientModal").style.display = "none";
}
async function submitNewClient(event) {
    event.preventDefault();
    
    const firstName = document.getElementById("newClientFirstName").value;
    const lastName = document.getElementById("newClientLastName").value;
    const email = document.getElementById("newClientEmail").value;
    const phone = document.getElementById("newClientPhone").value;
    const birthdate = document.getElementById("newClientBirthdate").value;
    const height = parseFloat(document.getElementById("newClientHeight").value);
    const bloodType = document.getElementById("newClientBloodType").value;
    const schedule = document.getElementById("newClientSchedule").value;
    const nickname = document.getElementById("newClientNickname").value;
    const password = document.getElementById("newClientPassword").value;
    const allergies = document.getElementById("newClientAllergies").value;
    const medications = document.getElementById("newClientMedications").value;
    
    const payload = {
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        birthdate: birthdate,
        height_cm: height,
        blood_type: bloodType,
        availability_schedule: schedule,
        nickname: nickname,
        password: password,
        allergies: allergies,
        medications: medications
    };

    
    try {
        const response = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.success) {
            alert("Cliente registrado exitosamente.");
            closeAddClientModal();
            // Reload sidebar list and select the new user
            await loadClientsList();
            selectClient(result.client_id);
        } else {
            alert("Error al registrar: " + result.error);
        }
    } catch (err) {
        console.error("Error creating client:", err);
    }
}

function exportToPDF() {
    window.print();
}

// ==========================================
// NEW: Global Views Management (Librerías)
// ==========================================
function showGlobalView(viewName) {
    // Hide all containers
    document.getElementById('clientsView').style.display = 'none';
    document.getElementById('trainingLibView').style.display = 'none';
    document.getElementById('nutritionLibView').style.display = 'none';
    document.getElementById('assessmentLibView').style.display = 'none';
    
    // Deactivate nav links
    document.getElementById('navClients').classList.remove('active');
    document.getElementById('navTraining').classList.remove('active');
    document.getElementById('navNutrition').classList.remove('active');
    document.getElementById('navAssessment').classList.remove('active');
    
    if (viewName === 'clients') {
        document.getElementById('clientsView').style.display = 'block';
        document.getElementById('navClients').classList.add('active');
    } else if (viewName === 'training') {
        document.getElementById('trainingLibView').style.display = 'block';
        document.getElementById('navTraining').classList.add('active');
        fetchGlobalExercises();
        fetchGlobalBlocks();
        fetchGlobalRoutines();
    } else if (viewName === 'nutrition') {
        document.getElementById('nutritionLibView').style.display = 'block';
        document.getElementById('navNutrition').classList.add('active');
        fetchGlobalNutritionPlans();
    } else if (viewName === 'assessment') {
        document.getElementById('assessmentLibView').style.display = 'block';
        document.getElementById('navAssessment').classList.add('active');
        fetchAssessmentConfig();
    }
}

// --- Exercises ---
async function fetchGlobalExercises() {
    try {
        const res = await fetch('/api/exercises');
        globalExercisesCache = await res.json();
        const exercises = globalExercisesCache;
        const tbody = document.getElementById('globalExercisesList');
        tbody.innerHTML = '';
        
        exercises.forEach(ex => {
            tbody.innerHTML += `
                <tr>
                    <td>${ex.id}</td>
                    <td style="font-weight: bold; color: var(--accent-cyan);">${ex.name}</td>
                    <td>${ex.primary_muscle}</td>
                    <td>${ex.secondary_muscles || '-'}</td>
                    <td>${ex.equipment || 'Peso corporal'}</td>
                    <td style="display: flex; gap: 5px;">
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="editExercise(${ex.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteExercise(${ex.id})"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

function openExerciseModal() { document.getElementById('addExerciseModal').style.display = 'flex'; }
function closeExerciseModal() { document.getElementById('addExerciseModal').style.display = 'none'; }

async function submitNewExercise(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('newExName').value,
        primary_muscle: document.getElementById('newExPrimary').value,
        secondary_muscles: document.getElementById('newExSecondary').value,
        equipment: document.getElementById('newExEquipment').value,
        video_url: document.getElementById('newExVideo').value
    };
    
    const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
        closeExerciseModal();
        e.target.reset();
        fetchGlobalExercises();
    } else {
        alert("Error: " + result.error);
    }
}

// --- Blocks ---
let globalExercisesCache = [];
let globalBlocksCache = [];
async function fetchGlobalBlocks() {
    try {
        const res = await fetch('/api/workout_blocks');
        globalBlocksCache = await res.json();
        const container = document.getElementById('globalBlocksList');
        container.innerHTML = '';
        
        globalBlocksCache.forEach(b => {
            const muscles = [...new Set(b.exercises.map(ex => ex.exercise_primary_muscle).filter(Boolean))];
            const muscleLabel = muscles.length ? muscles.slice(0, 4).join(' · ') : '';
            let exHtml = b.exercises.map(ex => `<span class="compliance-badge" style="background: rgba(14, 165, 233, 0.2); color: var(--accent-cyan);">${ex.exercise_name} (${ex.sets_count}x${ex.reps_range})</span>`).join(' ');
            container.innerHTML += `
                <div class="workout-day-card" style="margin-bottom: 10px; padding: 12px; background: rgba(0,0,0,0.15);">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                        <h4 style="color: var(--accent-cyan);">${b.name} <span style="font-size: 11px; color: var(--color-text-secondary); font-weight: normal;">${muscleLabel ? '· ' + muscleLabel : ''}</span></h4>
                        <div>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="editBlock(${b.id})"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteBlock(${b.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <p style="color: var(--color-text-secondary); font-size: 13px; margin-bottom: 10px;">${b.description || ''}</p>
                    <div>${exHtml}</div>
                </div>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

function openBlockModal() { 
    document.getElementById('addBlockModal').style.display = 'flex'; 
    document.getElementById('blockExercisesContainer').innerHTML = '';
    populateMuscleFilter();
    document.getElementById('exerciseMuscleFilter').value = '';
    addExerciseToBlockBuilder();
}
function closeBlockModal() { document.getElementById('addBlockModal').style.display = 'none'; }

// Pobla el filtro de músculo con todos los músculos únicos (principal + secundarios)
function populateMuscleFilter() {
    const filter = document.getElementById('exerciseMuscleFilter');
    if (!filter) return;
    const primaryMuscles = globalExercisesCache.map(ex => ex.primary_muscle).filter(Boolean);
    const secondaryMuscles = globalExercisesCache
        .flatMap(ex => ex.secondary_muscles
            ? ex.secondary_muscles.split(',').map(s => s.trim()).filter(Boolean)
            : []);
    const allMuscles = [...new Set([...primaryMuscles, ...secondaryMuscles])].sort();
    filter.innerHTML = '<option value="">Todos los músculos</option>';
    allMuscles.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        filter.appendChild(opt);
    });
}

// Filtra los selects de ejercicio según el músculo elegido (principal O secundario)
function filterExercisesByMuscle() {
    const muscle = document.getElementById('exerciseMuscleFilter')?.value || '';
    const selects = document.querySelectorAll('.block-ex-id');
    const filtered = muscle
        ? globalExercisesCache.filter(ex => {
            const isPrimary = ex.primary_muscle === muscle;
            const isSecondary = ex.secondary_muscles &&
                ex.secondary_muscles.split(',').map(s => s.trim()).includes(muscle);
            return isPrimary || isSecondary;
          })
        : globalExercisesCache;
    selects.forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = filtered.map(ex =>
            `<option value="${ex.id}">${ex.name} (${ex.primary_muscle})</option>`
        ).join('');
        if (filtered.find(e => e.id == cur)) sel.value = cur;
    });
}

function addExerciseToBlockBuilder() {
    const container = document.getElementById('blockExercisesContainer');
    const exDiv = document.createElement('div');
    exDiv.className = 'block-exercise-row';
    
    const muscle = document.getElementById('exerciseMuscleFilter')?.value || '';
    const filtered = muscle
        ? globalExercisesCache.filter(ex => {
            const isPrimary = ex.primary_muscle === muscle;
            const isSecondary = ex.secondary_muscles &&
                ex.secondary_muscles.split(',').map(s => s.trim()).includes(muscle);
            return isPrimary || isSecondary;
          })
        : globalExercisesCache;

    let optionsHTML = filtered.map(ex =>
        `<option value="${ex.id}">${ex.name} (${ex.primary_muscle})</option>`
    ).join('');
    
    exDiv.innerHTML = `
        <select class="block-ex-id" required>${optionsHTML}</select>
        <input type="number" class="ex-sets" placeholder="Series" value="3" required>
        <input type="text" class="ex-reps" placeholder="Reps" value="10-12" required>
        <input type="number" class="ex-rpe" placeholder="RPE" value="8">
        <input type="number" class="ex-rest" placeholder="Descanso (s)" value="90" required>
        <button type="button" class="btn-nav" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(exDiv);
}

async function submitNewBlock(e) {
    e.preventDefault();
    
    const exercises = [];
    const exRows = document.querySelectorAll('.block-exercise-row');
    exRows.forEach((row, exIdx) => {
        exercises.push({
            exercise_id: parseInt(row.querySelector('.block-ex-id').value),
            sets_count: parseInt(row.querySelector('.ex-sets').value),
            reps_range: row.querySelector('.ex-reps').value,
            rpe_target: parseInt(row.querySelector('.ex-rpe').value) || 0,
            rest_seconds: parseInt(row.querySelector('.ex-rest').value) || 90,
            order_index: exIdx + 1
        });
    });

    const payload = {
        name: document.getElementById('newBlockName').value,
        description: document.getElementById('newBlockDesc').value,
        exercises: exercises
    };
    
    const res = await fetch('/api/workout_blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
        closeBlockModal();
        e.target.reset();
        fetchGlobalBlocks();
    } else {
        alert("Error: " + result.error);
    }
}

// --- Routines ---
async function fetchGlobalRoutines() {
    try {
        
        const res = await fetch('/api/routines');
        const routines = await res.json();
        const container = document.getElementById('globalRoutinesList');
        container.innerHTML = '';
        
        routines.forEach(r => {
            let daysHtml = r.days.map(d => `<span class="compliance-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-orange);">${d.day_name} (${d.blocks.length} blq - ${d.total_exercises} ej)</span>`).join(' ');
            container.innerHTML += `
                <div class="workout-day-card" style="margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between;">
                        <h4>${r.title}</h4>
                        <div style="display:flex; gap: 5px;">
                            <button class="btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="assignRoutinePrompt(${r.id}, '${r.title}')"><i class="fa-solid fa-user-plus"></i> Asignar</button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="editRoutine(${r.id})"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteRoutine(${r.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <p style="color: var(--color-text-secondary); font-size: 13px; margin-bottom: 10px;">${r.description || ''}</p>
                    <div>${daysHtml}</div>
                </div>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

let dayCounter = 0;
function openRoutineModal() { 
    document.getElementById('addRoutineModal').style.display = 'flex'; 
    document.getElementById('daysContainer').innerHTML = '';
    dayCounter = 0;
    addRoutineDay(); // Add day 1 by default
}
function closeRoutineModal() { document.getElementById('addRoutineModal').style.display = 'none'; }

function addRoutineDay() {
    dayCounter++;
    const div = document.createElement('div');
    div.className = 'glass-card routine-day-builder';
    div.style.marginBottom = '10px';
    div.style.padding = '10px';
    div.style.background = 'rgba(0,0,0,0.2)';
    
    div.innerHTML = `
        <div style="display:flex; gap: 10px; margin-bottom: 10px;">
            <input type="text" class="day-name-input" placeholder="Nombre del Día (Ej. Torso)" value="Día ${dayCounter}" required style="flex: 1;">
            <button type="button" class="btn-nav" onclick="this.parentElement.parentElement.remove()" style="color: var(--accent-red);"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="day-blocks-container"></div>
        <button type="button" class="btn-nav" style="font-size: 12px; padding: 4px 8px;" onclick="addBlockToDayBuilder(this)"><i class="fa-solid fa-plus"></i> Añadir Bloque</button>
    `;
    document.getElementById('daysContainer').appendChild(div);
}

function addBlockToDayBuilder(btn) {
    const container = btn.previousElementSibling;
    const blockDiv = document.createElement('div');
    blockDiv.style.display = 'flex';
    blockDiv.style.gap = '5px';
    blockDiv.style.marginBottom = '5px';
    blockDiv.className = 'day-block-row';
    
    let optionsHTML = globalBlocksCache.map(b => `<option value="${b.id}">${b.name} (${b.routine_class})</option>`).join('');
    
    blockDiv.innerHTML = `
        <select class="block-id" style="flex:1;" required>${optionsHTML}</select>
        <button type="button" class="btn-nav" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(blockDiv);
}

async function submitNewRoutine(e) {
    e.preventDefault();
    
    const days = [];
    const dayElements = document.querySelectorAll('.routine-day-builder');
    dayElements.forEach((dayEl, index) => {
        const dayName = dayEl.querySelector('.day-name-input').value;
        const blocks = [];
        const blockRows = dayEl.querySelectorAll('.day-block-row');
        blockRows.forEach((row, bIdx) => {
            blocks.push({
                block_id: parseInt(row.querySelector('.block-id').value),
                order_index: bIdx + 1
            });
        });
        days.push({
            day_name: dayName,
            order_index: index + 1,
            blocks: blocks
        });
    });

    const payload = {
        title: document.getElementById('newRoutineTitle').value,
        description: document.getElementById('newRoutineDesc').value,
        days: days
    };
    
    const res = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
        closeRoutineModal();
        fetchGlobalRoutines();
    } else {
        alert("Error: " + result.error);
    }
}

// ==========================================
// NEW: Interactive Calendar for Trazabilidad
// ==========================================
let currentCalendarDate = new Date();

function changeCalendarMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderDailyCalendar();
}

async function renderDailyCalendar() {
    if (!activeUserId) return;
    
    const month = currentCalendarDate.getMonth();
    const year = currentCalendarDate.getFullYear();
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    document.getElementById('calendarMonthLabel').innerText = `${monthNames[month]} ${year}`;
    
    // Fetch logs for this month
    const res = await fetch(`/api/daily_logs/calendar?user_id=${activeUserId}&month=${month + 1}&year=${year}`);
    const logs = await res.json();
    
    const logsMap = {};
    logs.forEach(l => { logsMap[l.date] = l; });
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    // Days logic
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Empty slots for first week
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div style="padding: 10px;"></div>`;
    }
    
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const log = logsMap[dateStr];
        
        const isToday = (new Date().toISOString().split('T')[0] === dateStr);
        let borderStyle = isToday ? 'border: 1px solid var(--accent-cyan);' : 'border: 1px solid transparent;';
        
        if (log) {
            // Day has data
            grid.innerHTML += `
                <div style="background: rgba(14, 165, 233, 0.2); ${borderStyle} border-radius: 8px; padding: 10px; cursor: pointer; transition: 0.2s;" 
                     onmouseover="this.style.background='rgba(14, 165, 233, 0.4)'" 
                     onmouseout="this.style.background='rgba(14, 165, 233, 0.2)'"
                     onclick='showDayDetails(${JSON.stringify(log)})'>
                    <div style="font-weight:bold; color: white;">${d}</div>
                    <div style="font-size: 10px; color: var(--accent-cyan);"><i class="fa-solid fa-check"></i> Listo</div>
                </div>
            `;
        } else {
            // Empty day
            grid.innerHTML += `
                <div style="background: rgba(255, 255, 255, 0.05); ${borderStyle} border-radius: 8px; padding: 10px; opacity: 0.5;">
                    <div style="font-weight:bold;">${d}</div>
                </div>
            `;
        }
    }
}

function showDayDetails(log) {
    document.getElementById('dayDetailDate').innerText = log.date;
    
    const content = document.getElementById('dayDetailContent');
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
    
    document.getElementById('dayDetailModal').style.display = 'flex';
}

// Hook calendar rendering into client selection
const originalSelectClient = selectClient;
selectClient = async function(userId) {
    await originalSelectClient(userId);
    renderDailyCalendar();
};


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
                
                <select id="assignClientSelect" class="form-input" style="width: 100%; margin-bottom: 20px; padding: 10px; border-radius: 6px;">
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
            rest_seconds: parseInt(row.querySelector('.ex-rest').value) || 90,
            order_index: exIdx + 1
        });
    });
    const payload = {
        id: editingBlockId,
        name: document.getElementById('newBlockName').value,
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
    document.getElementById('newBlockDesc').value = block.description || '';
    
    const formTitle = document.querySelector('#addBlockModal h3');
    if(formTitle) formTitle.textContent = "Editar Bloque de Grupo Muscular";
    
    document.getElementById('addBlockModal').style.display = 'flex'; 
    document.getElementById('blockExercisesContainer').innerHTML = '';
    
    // Resetear y poblar el filtro de músculo
    populateMuscleFilter();
    document.getElementById('exerciseMuscleFilter').value = '';
    
    // Cargar ejercicios existentes — TODOS los ejercicios disponibles sin filtro de clase
    block.exercises.forEach(ex => {
        const container = document.getElementById('blockExercisesContainer');
        const exDiv = document.createElement('div');
        exDiv.className = 'block-exercise-row';
        
        let optionsHTML = globalExercisesCache.map(e =>
            `<option value="${e.id}" ${e.id == ex.exercise_id ? 'selected' : ''}>${e.name} (${e.primary_muscle})</option>`
        ).join('');
        
        exDiv.innerHTML = `
            <select class="block-ex-id" required>${optionsHTML}</select>
            <input type="number" class="ex-sets" placeholder="Series" value="${ex.sets_count}" required>
            <input type="text" class="ex-reps" placeholder="Reps" value="${ex.reps_range}" required>
            <input type="number" class="ex-rpe" placeholder="RPE" value="${ex.rpe_target || 8}">
            <input type="number" class="ex-rest" placeholder="Descanso (s)" value="${ex.rest_seconds !== undefined && ex.rest_seconds !== null ? ex.rest_seconds : 90}" required>
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
        title: document.getElementById('newRoutineTitle').value,
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
        
        document.getElementById('newRoutineTitle').value = routine.title;
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
                <button type="button" class="btn-secondary" style="font-size:12px; margin-top:10px;" onclick="addBlockToDayBuilder(this)"><i class="fa-solid fa-plus"></i> Añadir Bloque</button>
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

// ==========================================
// NUTRITION PLAN LOGIC
// ==========================================
let nutritionMealCounter = 0;

let isCreatingGlobalNutrition = false;

function openNutritionModal(isGlobal = false) {
    isCreatingGlobalNutrition = isGlobal;
    if (!isGlobal && !activeUserId) {
        alert("Selecciona un cliente primero.");
        return;
    }
    document.getElementById("addNutritionModal").style.display = "flex";
    document.getElementById("newNutStart").value = new Date().toISOString().substring(0, 10);
    
    let d = new Date();
    d.setMonth(d.getMonth() + 1);
    document.getElementById("newNutEnd").value = d.toISOString().substring(0, 10);
    
    document.getElementById("mealsContainer").innerHTML = "";
    nutritionMealCounter = 0;
    addNutritionMeal("Desayuno");
    addNutritionMeal("Almuerzo");
    addNutritionMeal("Cena");
}

function closeNutritionModal() {
    document.getElementById("addNutritionModal").style.display = "none";
}

function addNutritionMeal(defaultName = "") {
    nutritionMealCounter++;
    const mId = nutritionMealCounter;
    
    const container = document.getElementById("mealsContainer");
    const mealCard = document.createElement("div");
    mealCard.className = "workout-day-card";
    mealCard.id = `mealCard_${mId}`;
    mealCard.style.position = "relative";
    mealCard.style.padding = "10px";
    
    mealCard.innerHTML = `
        <button type="button" class="btn-nav" style="position: absolute; top: 10px; right: 10px; color: var(--accent-red);" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
        <div class="form-group" style="width: 80%;">
            <label>Nombre de la Comida</label>
            <input type="text" class="meal-name-input" placeholder="Ej. Desayuno o Snack" value="${defaultName}" required>
        </div>
        <div style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <label style="font-size: 12px; color: var(--accent-cyan);">Alimentos / Ingredientes</label>
                <button type="button" class="btn-nav" onclick="addFoodItemToMeal(${mId})" style="font-size: 11px;"><i class="fa-solid fa-plus"></i> Ingrediente</button>
            </div>
            <div id="mealFoods_${mId}">
                <!-- Alimentos -->
            </div>
        </div>
    `;
    
    container.appendChild(mealCard);
    addFoodItemToMeal(mId); // Add at least one empty food item
}

function addFoodItemToMeal(mId) {
    const container = document.getElementById(`mealFoods_${mId}`);
    const foodRow = document.createElement("div");
    foodRow.style.display = "flex";
    foodRow.style.gap = "5px";
    foodRow.style.marginBottom = "5px";
    foodRow.className = "food-item-row";
    
    foodRow.innerHTML = `
        <input type="text" class="food-name" placeholder="Alimento" required style="flex: 2; font-size: 11px;">
        <input type="number" class="food-weight" placeholder="Peso(g)" required style="flex: 1; font-size: 11px;">
        <input type="number" class="food-cal" placeholder="Kcal" required style="flex: 1; font-size: 11px;">
        <input type="number" step="0.1" class="food-pro" placeholder="Pro(g)" required style="flex: 1; font-size: 11px;">
        <input type="number" step="0.1" class="food-carb" placeholder="Car(g)" required style="flex: 1; font-size: 11px;">
        <input type="number" step="0.1" class="food-fat" placeholder="Gra(g)" required style="flex: 1; font-size: 11px;">
        <button type="button" class="btn-nav" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    container.appendChild(foodRow);
}

async function submitNewNutritionPlan(event) {
    event.preventDefault();
    
    const payload = {
        user_id: isCreatingGlobalNutrition ? 0 : activeUserId,
        title: document.getElementById("newNutTitle").value,
        description: document.getElementById("newNutDesc").value,
        start_date: document.getElementById("newNutStart").value,
        end_date: document.getElementById("newNutEnd").value,
        target_calories: parseInt(document.getElementById("newNutCal").value),
        target_protein: parseInt(document.getElementById("newNutPro").value),
        target_carbs: parseInt(document.getElementById("newNutCarb").value),
        target_fat: parseInt(document.getElementById("newNutFat").value),
        meals: []
    };
    
    const mealCards = document.querySelectorAll("#mealsContainer .workout-day-card");
    let orderIdx = 1;
    
    mealCards.forEach(card => {
        const mealName = card.querySelector(".meal-name-input").value;
        const foodRows = card.querySelectorAll(".food-item-row");
        
        let mealItems = [];
        foodRows.forEach(row => {
            mealItems.push({
                food_name: row.querySelector(".food-name").value,
                weight_g: parseFloat(row.querySelector(".food-weight").value),
                calories_kcal: parseInt(row.querySelector(".food-cal").value),
                protein_g: parseFloat(row.querySelector(".food-pro").value),
                carbs_g: parseFloat(row.querySelector(".food-carb").value),
                fat_g: parseFloat(row.querySelector(".food-fat").value)
            });
        });
        
        if(mealItems.length > 0) {
            payload.meals.push({
                meal_name: mealName,
                order_index: orderIdx++,
                items: mealItems
            });
        }
    });
    
    try {
        const res = await fetch('/api/nutrition_plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert("Plan de Nutrición guardado correctamente.");
            closeNutritionModal();
            if (isCreatingGlobalNutrition) {
                fetchGlobalNutritionPlans();
            } else {
                selectClient(activeUserId); // Recargar perfil
            }
        } else {
            alert("Error al guardar: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Error de red.");
    }
}

async function deleteNutritionPlan(planId) {
    if (!confirm("¿Seguro que deseas eliminar este plan de nutrición?")) return;
    
    try {
        const res = await fetch(`/api/nutrition_plans/${planId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            if (document.getElementById('nutritionLibView').style.display === 'block') {
                fetchGlobalNutritionPlans();
            } else {
                selectClient(activeUserId);
            }
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

let globalNutritionPlansCache = [];
async function fetchGlobalNutritionPlans() {
    try {
        const res = await fetch('/api/nutrition_plans?user_id=0');
        const data = await res.json();
        globalNutritionPlansCache = data;
        const tbody = document.getElementById('globalNutritionList');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        globalNutritionPlansCache.forEach(plan => {
            tbody.innerHTML += `
                <tr>
                    <td>${plan.id}</td>
                    <td style="font-weight: bold; color: var(--accent-green);">${plan.title}</td>
                    <td>${plan.description || '-'}</td>
                    <td>${plan.target_calories || 0} kcal</td>
                    <td>${plan.target_protein || 0}g / ${plan.target_carbs || 0}g / ${plan.target_fat || 0}g</td>
                    <td style="display: flex; gap: 5px;">
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="assignGlobalNutritionPlan(${plan.id})"><i class="fa-solid fa-share-nodes"></i> Asignar</button>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteNutritionPlan(${plan.id})"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("Error fetching global nutrition plans", err);
    }
}

function assignGlobalNutritionPlan(planId) {
    const plan = globalNutritionPlansCache.find(p => p.id === planId);
    if (!plan) return;
    
    const clientHtml = usersData.map(u => `<option value="${u.id}">${u.first_name} ${u.last_name}</option>`).join('');
    
    const modalHtml = `
        <div id="assignNutritionModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
            <div class="glass-card" style="width: 400px; max-width: 95%;">
                <h3 style="color: var(--accent-green); margin-bottom: 15px;"><i class="fa-solid fa-share-nodes"></i> Asignar Plantilla a Cliente</h3>
                <p style="margin-bottom: 15px; color: var(--color-text-secondary);">Selecciona el cliente al que deseas asignarle la plantilla <strong>${plan.title}</strong>.</p>
                <div class="form-group">
                    <label>Cliente</label>
                    <select id="assignNutritionClientSelect">
                        ${clientHtml}
                    </select>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button class="btn-nav" onclick="document.getElementById('assignNutritionModal').remove()">Cancelar</button>
                    <button class="btn-primary" onclick="confirmAssignNutritionPlan(${plan.id})">Asignar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function confirmAssignNutritionPlan(planId) {
    const select = document.getElementById('assignNutritionClientSelect');
    const clientId = select.value;
    
    try {
        const res = await fetch('/api/nutrition_plans/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId, user_id: clientId })
        });
        const data = await res.json();
        if (data.success) {
            alert("Plantilla de nutrición asignada correctamente al cliente.");
            document.getElementById('assignNutritionModal').remove();
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// NEW: Assessment Config Management
// ==========================================

let globalAssessmentConfig = [];

async function fetchAssessmentConfig() {
    try {
        const res = await fetch('/api/assessment_config');
        const data = await res.json();
        if (data.success) {
            globalAssessmentConfig = data.config;
            renderAssessmentConfigTable();
        }
    } catch (e) {
        console.error("Error fetching assessment config:", e);
    }
}

function renderAssessmentConfigTable() {
    const tbody = document.getElementById('assessmentConfigTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    globalAssessmentConfig.forEach(conf => {
        const isDefaultBadge = conf.is_default ? '<span class="compliance-badge" style="background:#555; color:white;">Base</span>' : '<span class="compliance-badge">Custom</span>';
        
        // Icon for visibility
        const eyeIcon = conf.is_active ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
        const eyeColor = conf.is_active ? 'var(--accent-green)' : 'var(--color-text-secondary)';
        
        tbody.innerHTML += `
            <tr>
                <td style="text-align: left;">${conf.order_index}</td>
                <td style="font-weight: bold; color: var(--accent-cyan); text-align: left;">${conf.field_name} ${isDefaultBadge}</td>
                <td style="text-align: left;">${conf.field_type === 'number' ? 'Número' : 'Texto'}</td>
                <td style="text-align: left;">${conf.unit || '-'}</td>
                <td style="display: flex; gap: 5px; text-align: left;">
                    <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: ${eyeColor};" onclick="toggleAssessmentConfigVisibility(${conf.id}, ${conf.is_active})" title="${conf.is_active ? 'Ocultar Campo' : 'Mostrar Campo'}">${eyeIcon}</button>
                    <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="openAssessmentConfigModal(${conf.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    ${!conf.is_default ? `<button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteAssessmentConfig(${conf.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `;
    });
}

async function toggleAssessmentConfigVisibility(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    try {
        const res = await fetch('/api/assessment_config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, is_active: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            fetchAssessmentConfig();
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

function openAssessmentConfigModal(id = null) {
    const modal = document.getElementById('assessmentConfigModal');
    const form = modal.querySelector('form');
    form.reset();
    
    document.getElementById('editAssessmentConfigId').value = '';
    document.getElementById('editAssessmentConfigIsDefault').value = '0';
    document.getElementById('editAssessmentConfigDbColumn').value = '';
    document.getElementById('assessmentConfigModalTitle').innerHTML = '<i class="fa-solid fa-plus"></i> Nuevo Campo';
    document.getElementById('configFieldName').disabled = false;
    document.getElementById('configFieldType').disabled = false;
    
    if (id) {
        const conf = globalAssessmentConfig.find(c => c.id === id);
        if (conf) {
            document.getElementById('assessmentConfigModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Campo';
            document.getElementById('editAssessmentConfigId').value = conf.id;
            document.getElementById('editAssessmentConfigIsDefault').value = conf.is_default;
            document.getElementById('editAssessmentConfigDbColumn').value = conf.db_column || '';
            
            document.getElementById('configFieldName').value = conf.field_name;
            document.getElementById('configFieldType').value = conf.field_type;
            document.getElementById('configFieldUnit').value = conf.unit || '';
            document.getElementById('configOrderIndex').value = conf.order_index;
            document.getElementById('configIsActive').checked = conf.is_active;
            
            // Si es por defecto, no dejamos cambiar nombre ni tipo para no romper la BD, solo visibilidad y orden.
            if (conf.is_default) {
                document.getElementById('configFieldName').disabled = true;
                document.getElementById('configFieldType').disabled = true;
            }
        }
    }
    
    modal.style.display = 'flex';
}

function closeAssessmentConfigModal() {
    document.getElementById('assessmentConfigModal').style.display = 'none';
}

async function submitAssessmentConfig(e) {
    e.preventDefault();
    
    const id = document.getElementById('editAssessmentConfigId').value;
    const payload = {
        field_name: document.getElementById('configFieldName').value,
        field_type: document.getElementById('configFieldType').value,
        unit: document.getElementById('configFieldUnit').value,
        order_index: parseInt(document.getElementById('configOrderIndex').value),
        is_active: document.getElementById('configIsActive').checked ? 1 : 0
    };
    
    const isDefault = document.getElementById('editAssessmentConfigIsDefault').value === '1';
    
    // Si es nuevo o no es default, pasamos los datos completos
    if (!id) {
        payload.is_default = 0;
    } else {
        payload.id = parseInt(id);
        if (isDefault) {
            // No enviar field_name/type para no sobreescribir defaults si el input estaba disabled
            delete payload.field_name;
            delete payload.field_type;
        }
    }
    
    try {
        const url = '/api/assessment_config';
        const method = id ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (data.success) {
            closeAssessmentConfigModal();
            fetchAssessmentConfig();
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteAssessmentConfig(id) {
    if (!confirm("¿Seguro que deseas eliminar permanentemente este campo? Las valoraciones existentes perderán este dato.")) return;
    
    try {
        const res = await fetch('/api/assessment_config', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json();
        if (data.success) {
            fetchAssessmentConfig();
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}
