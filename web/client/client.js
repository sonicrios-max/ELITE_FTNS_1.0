// Client Dashboard JavaScript Logic

let userId = 1;
let activeTab = 'tabRutinas';
let clientFullData = null;

// Chart.js Instances
let weightChartInstance = null;
let stepsChartInstance = null;

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

// Hydration State
let currentWaterIntakeMl = 0;

document.addEventListener("DOMContentLoaded", () => {
    // Parse userId from query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('userId');
    if (idParam) {
        userId = parseInt(idParam);
    }
    
    loadClientData();
    startMannequinRotation();
});

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
        setupMannequinDimensions();
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
        document.getElementById("clientKpiWeight").innerText = `${latest.weight_kg} kg`;
        document.getElementById("clientKpiWeightDesc").innerText = `Registrado el: ${latest.date}`;
        
        // 2. Fat KPI
        document.getElementById("clientKpiFat").innerText = `${latest.body_fat_percentage.toFixed(1)}%`;
        document.getElementById("clientKpiFatDesc").innerText = `Masa magra: ${latest.lean_mass_kg.toFixed(1)} kg`;
    } else {
        document.getElementById("clientKpiWeight").innerText = "-";
        document.getElementById("clientKpiFat").innerText = "-";
    }
    
    // 3. Nutrition KPI
    if (diet) {
        document.getElementById("clientKpiCalories").innerText = `${diet.target_calories} Kcal`;
        document.getElementById("clientKpiMacrosDesc").innerText = `P: ${diet.target_protein}g | C: ${diet.target_carbs}g | G: ${diet.target_fat}g`;
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
    if (!workouts || workouts.days.length === 0) {
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
        
        let exercisesHtml = "";
        day.exercises.forEach(ex => {
            exercisesHtml += `
                <tr>
                    <td>
                        <input type="checkbox" id="check-${ex.id}" style="width: 18px; height: 18px; cursor: pointer;">
                    </td>
                    <td class="exercise-name">${ex.exercise_name}</td>
                    <td><span class="compliance-badge">${ex.sets_count} Series</span></td>
                    <td><strong>${ex.reps_range}</strong></td>
                    <td>RPE ${ex.rpe_target || 'N/A'}</td>
                    <td>
                        ${ex.video_url ? `<a href="#" class="exercise-video-link" onclick="playVideo(event, '${ex.video_url}', this)"><i class="fa-solid fa-circle-play"></i> Técnica</a>` : '-'}
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
                        <th style="width: 40px;">Hecho</th>
                        <th>Ejercicio</th>
                        <th>Series</th>
                        <th>Reps</th>
                        <th>RPE</th>
                        <th>Multimedia</th>
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
    if (!diet || diet.meals.length === 0) {
        container.innerHTML = `
            <h3>Mi Plan de Alimentación</h3>
            <div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">
                Aún no tienes un plan alimenticio cargado por tu entrenador.
            </div>`;
        return;
    }
    
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
            <h3>Mi Menú Diario</h3>
            <span style="font-size:12px; color:var(--color-text-secondary);">Activo desde: ${diet.start_date}</span>
        </div>
    `;
    
    diet.meals.forEach(meal => {
        const mealBox = document.createElement("div");
        mealBox.className = "diet-meal-box";
        
        let foodItemsHtml = "";
        meal.items.forEach(food => {
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
            <h4>${meal.meal_name}</h4>
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

// 3D Mannequin Dimensions setting
function setupMannequinDimensions() {
    const assessments = clientFullData.assessments || [];
    if (assessments.length > 0) {
        const latest = assessments[assessments.length - 1];
        mannequinData.height = latest.height_cm;
        mannequinData.chest = latest.chest || 95;
        mannequinData.waist = latest.abdomen || 80;
        mannequinData.hips = latest.trochanter || 95;
        mannequinData.bicep = latest.right_bicep || 30;
        mannequinData.fat = latest.body_fat_percentage || 12;
        
        document.getElementById("mannequinStatsChest").innerText = mannequinData.chest;
        document.getElementById("mannequinStatsAbdomen").innerText = mannequinData.waist;
        document.getElementById("mannequinStatsHip").innerText = mannequinData.hips;
        document.getElementById("mannequinStatsFat").innerText = mannequinData.fat.toFixed(1);
    }
}

// 3D Mannequin Render Loop
function startMannequinRotation() {
    const canvas = document.getElementById("mannequinCanvas");
    const ctx = canvas.getContext("2d");
    
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
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const chestScale = (mannequinData.chest / 100.0) * 20;
    const waistScale = (mannequinData.waist / 85.0) * 16;
    const hipScale = (mannequinData.hips / 100.0) * 18;
    const fatOffset = mannequinData.fat > 18 ? (mannequinData.fat - 18) * 0.2 : 0;
    
    let nodes = [
        { x: 0, y: 100, z: 0 },
        { x: 0, y: 80, z: 0 },
        { x: -chestScale - 6, y: 70, z: 0 },
        { x: chestScale + 6, y: 70, z: 0 },
        { x: -chestScale, y: 45, z: 3 + fatOffset },
        { x: chestScale, y: 45, z: 3 + fatOffset },
        { x: -chestScale, y: 45, z: -3 },
        { x: chestScale, y: 45, z: -3 },
        { x: -waistScale, y: 15, z: 2 + fatOffset * 1.5 },
        { x: waistScale, y: 15, z: 2 + fatOffset * 1.5 },
        { x: -waistScale, y: 15, z: -2 },
        { x: waistScale, y: 15, z: -2 },
        { x: -hipScale, y: -10, z: 0 },
        { x: hipScale, y: -10, z: 0 },
        { x: -hipScale * 0.9, y: -55, z: 0 },
        { x: hipScale * 0.9, y: -55, z: 0 },
        { x: -hipScale * 0.95, y: -100, z: 0 },
        { x: hipScale * 0.95, y: -100, z: 0 },
        { x: -chestScale - 15, y: 45, z: 0 },
        { x: -chestScale - 18, y: 15, z: 0 },
        { x: chestScale + 15, y: 45, z: 0 },
        { x: chestScale + 18, y: 15, z: 0 }
    ];

    const cx = w / 2;
    const cy = h / 2 - 10;
    const zoom = 1.3;
    const distance = 300;

    let projNodes = nodes.map(n => {
        const cos = Math.cos(mannequinAngle);
        const sin = Math.sin(mannequinAngle);
        const rx = n.x * cos - (n.z || 0) * sin;
        const rz = n.x * sin + (n.z || 0) * cos;
        const dScale = distance / (distance + rz);
        return {
            x: cx + rx * dScale * zoom,
            y: cy - n.y * dScale * zoom,
            z: rz
        };
    });

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

    drawVolume(2, 3, 5, 4);
    drawVolume(4, 5, 9, 8);
    drawVolume(8, 9, 13, 12);

    ctx.strokeStyle = glowColor + "0.8)";
    ctx.lineWidth = 3;

    // Head
    const headNode = projNodes[0];
    const headRadius = 14 * (distance / (distance + nodes[0].z)) * zoom;
    ctx.beginPath();
    ctx.arc(headNode.x, headNode.y, headRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Neck
    ctx.beginPath();
    ctx.moveTo(projNodes[1].x, projNodes[1].y);
    ctx.lineTo((projNodes[2].x + projNodes[3].x)/2, (projNodes[2].y + projNodes[3].y)/2);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(projNodes[2].x, projNodes[2].y);
    ctx.lineTo(projNodes[18].x, projNodes[18].y);
    ctx.lineTo(projNodes[19].x, projNodes[19].y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(projNodes[3].x, projNodes[3].y);
    ctx.lineTo(projNodes[20].x, projNodes[20].y);
    ctx.lineTo(projNodes[21].x, projNodes[21].y);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(projNodes[12].x, projNodes[12].y);
    ctx.lineTo(projNodes[14].x, projNodes[14].y);
    ctx.lineTo(projNodes[16].x, projNodes[16].y);
    ctx.stroke();

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
    
    document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add("active");
    document.getElementById(tabId).classList.add("active");
}

function exportToPDF() {
    window.print();
}

