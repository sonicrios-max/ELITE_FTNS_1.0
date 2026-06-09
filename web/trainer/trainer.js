// Trainer Dashboard JavaScript Logic

let activeUserId = 1;
let activeTab = 'tabFicha';
let usersData = [];
let selectedUserFullData = null;

// Chart.js Instances
let weightChartInstance = null;
let stepsChartInstance = null;
let hrvChartInstance = null;
let sleepChartInstance = null;

// 3D Mannequin Variables
let mannequinAngle = 0;
let mannequinInterval = null;
let mannequinData = {
    height: 172,
    chest: 97,
    waist: 80,
    hips: 97,
    bicep: 33.5,
    fat: 10
};

function initTrainerDashboard() {
    loadClientsList();
    startMannequinRotation();
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
        
        // Mock compliance based on data availability
        const isCompliant = user.id === 1; // Brayan active, Maria is mock compliant too
        const badgeClass = isCompliant ? 'compliance-badge' : 'compliance-badge warning';
        const badgeText = isCompliant ? 'Alta Adherencia' : 'Media Adherencia';
        
        card.innerHTML = `
            <div class="client-info">
                <h4>${user.first_name} ${user.last_name}</h4>
                <p><i class="fa-solid fa-envelope"></i> ${user.email}</p>
            </div>
            <span class="${badgeClass}">${badgeText}</span>
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
        initMannequinDates();
        
        // Make panels visible
        document.getElementById("profileHeaderCard").style.display = "block";
        document.getElementById("kpiContainer").style.display = "grid";
        document.getElementById("tabsCard").style.display = "block";
        document.getElementById("mannequinCard").style.display = "block";
        
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
        
        let exercisesHtml = "";
        day.exercises.forEach(ex => {
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
        
        dayCard.innerHTML = `
            <h4>${day.day_name}</h4>
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
                <tbody>
                    ${exercisesHtml}
                </tbody>
            </table>
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
            <h3>Plan: ${diet.title}</h3>
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

// 3D Morphing Mannequin Drawer
function initMannequinDates() {
    const selector = document.getElementById("mannequinDateSelector");
    selector.innerHTML = "";
    
    const assessments = selectedUserFullData.assessments || [];
    assessments.forEach(as => {
        const option = document.createElement("option");
        option.value = as.date;
        option.innerText = as.date;
        selector.appendChild(option);
    });
    
    if (assessments.length > 0) {
        selector.value = assessments[assessments.length - 1].date;
        updateMannequinDimensions();
    }
}

function updateMannequinDimensions() {
    const date = document.getElementById("mannequinDateSelector").value;
    const assessments = selectedUserFullData.assessments || [];
    const record = assessments.find(as => as.date === date);
    
    if (record) {
        mannequinData.height = record.height_cm;
        mannequinData.chest = record.chest || 95;
        mannequinData.waist = record.abdomen || 80;
        mannequinData.hips = record.trochanter || 95;
        mannequinData.bicep = record.right_bicep || 30;
        mannequinData.fat = record.body_fat_percentage || 12;
        
        document.getElementById("mannequinStatsChest").innerText = mannequinData.chest;
        document.getElementById("mannequinStatsAbdomen").innerText = mannequinData.waist;
        document.getElementById("mannequinStatsHip").innerText = mannequinData.hips;
        document.getElementById("mannequinStatsFat").innerText = mannequinData.fat.toFixed(1);
    }
}

function startMannequinRotation() {
    const canvas = document.getElementById("mannequinCanvas");
    const ctx = canvas.getContext("2d");
    
    // Hide the placeholder loader
    const loader = document.getElementById("mannequinLoading");
    if (loader) loader.style.display = "none";
    
    if (mannequinInterval) clearInterval(mannequinInterval);
    
    mannequinInterval = setInterval(() => {
        mannequinAngle += 0.02;
        drawMannequinFrame(ctx, canvas.width, canvas.height);
    }, 30);
}

function drawMannequinFrame(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    
    // Draw grid background
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Mathematical Morph Values
    // Reference average dimensions
    const chestScale = (mannequinData.chest / 100.0) * 20;
    const waistScale = (mannequinData.waist / 85.0) * 16;
    const hipScale = (mannequinData.hips / 100.0) * 18;
    const bicepScale = (mannequinData.bicep / 35.0) * 7;
    const fatOffset = mannequinData.fat > 18 ? (mannequinData.fat - 18) * 0.2 : 0;
    
    // 3D Nodes Definition (x, y, z)
    // Front and back vertices to form a 3D volume
    let nodes = [
        // Head
        { x: 0, y: 100, z: 0, r: 10 },
        // Neck
        { x: 0, y: 80, z: 0 },
        // Shoulders
        { x: -chestScale - 6, y: 70, z: 0 },
        { x: chestScale + 6, y: 70, z: 0 },
        // Chest
        { x: -chestScale, y: 45, z: 3 + fatOffset },
        { x: chestScale, y: 45, z: 3 + fatOffset },
        { x: -chestScale, y: 45, z: -3 },
        { x: chestScale, y: 45, z: -3 },
        // Waist
        { x: -waistScale, y: 15, z: 2 + fatOffset * 1.5 },
        { x: waistScale, y: 15, z: 2 + fatOffset * 1.5 },
        { x: -waistScale, y: 15, z: -2 },
        { x: waistScale, y: 15, z: -2 },
        // Hips
        { x: -hipScale, y: -10, z: 0 },
        { x: hipScale, y: -10, z: 0 },
        // Knees
        { x: -hipScale * 0.9, y: -55, z: 0 },
        { x: hipScale * 0.9, y: -55, z: 0 },
        // Feet
        { x: -hipScale * 0.95, y: -100, z: 0 },
        { x: hipScale * 0.95, y: -100, z: 0 },
        // Elbow L & Hand L
        { x: -chestScale - 15, y: 45, z: 0 },
        { x: -chestScale - 18, y: 15, z: 0 },
        // Elbow R & Hand R
        { x: chestScale + 15, y: 45, z: 0 },
        { x: chestScale + 18, y: 15, z: 0 }
    ];

    const cx = w / 2;
    const cy = h / 2 - 10;
    const zoom = 1.3;
    const distance = 300;

    // Rotate nodes in 3D (Y-axis rotation)
    let projNodes = nodes.map(n => {
        // Rotate
        const cos = Math.cos(mannequinAngle);
        const sin = Math.sin(mannequinAngle);
        const rx = n.x * cos - (n.z || 0) * sin;
        const rz = n.x * sin + (n.z || 0) * cos;
        
        // Project 3D -> 2D
        const dScale = distance / (distance + rz);
        const sx = cx + rx * dScale * zoom;
        const sy = cy - n.y * dScale * zoom;
        return { x: sx, y: sy, z: rz };
    });

    // Draw Skeleton Body
    ctx.lineWidth = 2;
    
    // Color depends on body composition. Leaner = gold highlight, more fat = warm orange-red
    const colorVal = Math.min(Math.max(10, mannequinData.fat), 30);
    const pct = (colorVal - 10) / 20.0;
    const r = Math.floor(243 - pct * 4);
    const g = Math.floor(202 - pct * 134);
    const b = Math.floor(76 - pct * 8);
    const glowColor = `rgba(${r}, ${g}, ${b}, `;
    ctx.strokeStyle = glowColor + "0.65)";
    ctx.fillStyle = glowColor + "0.15)";
    
    // Function to draw a 3D cylinder/volume block between 4 nodes (2 left, 2 right)
    function drawVolume(idxL1, idxR1, idxL2, idxR2) {
        ctx.beginPath();
        ctx.moveTo(projNodes[idxL1].x, projNodes[idxL1].y);
        ctx.lineTo(projNodes[idxR1].x, projNodes[idxR1].y);
        ctx.lineTo(projNodes[idxR2].x, projNodes[idxR2].y);
        ctx.lineTo(projNodes[idxL2].x, projNodes[idxL2].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // 1. Draw Torso
    drawVolume(2, 3, 5, 4); // shoulders to chest front
    drawVolume(4, 5, 9, 8); // chest to waist
    drawVolume(8, 9, 13, 12); // waist to hips

    // 2. Draw Limbs as skeleton bones
    ctx.strokeStyle = glowColor + "0.8)";
    ctx.lineWidth = 3;

    // Head
    const headNode = projNodes[0];
    const headRadius = 14 * (distance / (distance + nodes[0].z)) * zoom;
    ctx.beginPath();
    ctx.arc(headNode.x, headNode.y, headRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Neck to shoulders
    ctx.beginPath();
    ctx.moveTo(projNodes[1].x, projNodes[1].y);
    ctx.lineTo((projNodes[2].x + projNodes[3].x)/2, (projNodes[2].y + projNodes[3].y)/2);
    ctx.stroke();

    // Left Arm (Shoulder L -> Elbow L -> Hand L)
    ctx.beginPath();
    ctx.moveTo(projNodes[2].x, projNodes[2].y);
    ctx.lineTo(projNodes[18].x, projNodes[18].y);
    ctx.lineTo(projNodes[19].x, projNodes[19].y);
    ctx.stroke();

    // Right Arm (Shoulder R -> Elbow R -> Hand R)
    ctx.beginPath();
    ctx.moveTo(projNodes[3].x, projNodes[3].y);
    ctx.lineTo(projNodes[20].x, projNodes[20].y);
    ctx.lineTo(projNodes[21].x, projNodes[21].y);
    ctx.stroke();

    // Left Leg (Hip L -> Knee L -> Foot L)
    ctx.beginPath();
    ctx.moveTo(projNodes[12].x, projNodes[12].y);
    ctx.lineTo(projNodes[14].x, projNodes[14].y);
    ctx.lineTo(projNodes[16].x, projNodes[16].y);
    ctx.stroke();

    // Right Leg (Hip R -> Knee R -> Foot R)
    ctx.beginPath();
    ctx.moveTo(projNodes[13].x, projNodes[13].y);
    ctx.lineTo(projNodes[15].x, projNodes[15].y);
    ctx.lineTo(projNodes[17].x, projNodes[17].y);
    ctx.stroke();
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

