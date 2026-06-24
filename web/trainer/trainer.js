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
                if (logoSpan) {
                    logoSpan.innerText = `ELITE COACHING | ${config.name.toUpperCase()}`;
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
let globalFoodLibrary = [];

// Chart.js Instances
let weightChartInstance = null;
let stepsChartInstance = null;
let hrvChartInstance = null;
let sleepChartInstance = null;



async function initTrainerDashboard() {
    await fetchAssessmentConfig();
    await fetchNutritionConfig();
    await fetchFoodLibrary();
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
        renderNutritionPlans();
        renderWorkoutPlans(); // AÑADIDO: cargar rutinas
        document.getElementById("profileHeaderCard").style.display = "block";
        document.getElementById("kpiContainer").style.display = "flex";
        document.getElementById("tabsCard").style.display = "block";
        
        // Mobile Slide-in Panel
        const mainPanel = document.getElementById("mainContentPanel");
        if (mainPanel) {
            mainPanel.classList.add("mobile-open");
            if (window.innerWidth <= 1024) {
                closeMobileSubPanel(); // Cierra los tabs para mostrar el menú del perfil
            } else {
                switchTab('tabFicha'); // En escritorio, siempre abre la primera pestaña por defecto
            }
        }
        
        // Clear new assessment form if open
        const newFormContainer = document.getElementById("newAssessmentFormContainer");
        if (newFormContainer) newFormContainer.style.display = "none";
        
        const formEl = document.getElementById("assessmentForm");
        if (formEl) formEl.reset();
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
    if (document.getElementById("kpiFatPct")) document.getElementById("kpiFatPct").innerText = `${fatPct.toFixed(1)}%`;
    if (document.getElementById("kpiFatPctDesc")) document.getElementById("kpiFatPctDesc").innerText = `Masa Grasa: ${(latest.fat_mass_kg || 0.0).toFixed(1)} kg`;
    
    // 2. FFMI (Masa Libre de Grasa)
    // Formula: Lean Mass / (Height in m)^2
    const heightM = latest.height_cm / 100.0;
    const leanMassKg = latest.lean_mass_kg || (latest.weight_kg - (latest.weight_kg * (fatPct / 100.0)));
    const ffmi = leanMassKg / (heightM * heightM);
    // Normalized FFMI = FFMI + 6.1 * (1.8 - Height)
    const normalizedFfmi = ffmi + 6.1 * (1.8 - heightM);
    
    if (document.getElementById("kpiFFMI")) document.getElementById("kpiFFMI").innerText = normalizedFfmi.toFixed(1);
    if (document.getElementById("kpiFFMIDesc")) document.getElementById("kpiFFMIDesc").innerText = `Masa Magra: ${leanMassKg.toFixed(1)} kg`;
    
    // 3. Waist to Height Ratio (WtHR)
    const abdomen = latest.abdomen || 0.0;
    const wthr = abdomen / latest.height_cm;
    if (document.getElementById("kpiWtHR")) document.getElementById("kpiWtHR").innerText = wthr.toFixed(2);
    
    let wthrDesc = "Nivel Óptimo";
    if (wthr > 0.5) wthrDesc = "Riesgo Cardiovascular";
    if (document.getElementById("kpiWtHRDesc")) document.getElementById("kpiWtHRDesc").innerText = wthrDesc;
}

// Render Assessments Table (Dynamic based on active trainer settings)
function renderAssessmentsTable() {
    const table = document.getElementById("assessmentHistoryTable");
    const mobileContainer = document.getElementById("assessmentHistoryMobileContainer");
    
    if (!table) return;
    
    const thead = table.querySelector("thead");
    const tbody = document.getElementById("assessmentHistoryBody");
    tbody.innerHTML = "";
    if (mobileContainer) mobileContainer.innerHTML = "";
    
    const assessments = selectedUserFullData.assessments;
    const activeFields = globalAssessmentConfig.filter(f => f.is_active == 1 || f.is_active === true);
    
    // Build headers
    let headersHtml = `<tr><th>Fecha</th>`;
    activeFields.forEach(field => {
        if (field.db_column === 'body_fat_percentage') {
            headersHtml += `<th>% Grasa</th><th>Pliegues (Suma)</th>`;
        } else if (field.db_column === 'weight_kg') {
            headersHtml += `<th>Peso (kg)</th><th>IMC</th>`;
        } else {
            headersHtml += `<th>${field.field_name}${field.unit ? ' (' + field.unit + ')' : ''}</th>`;
        }
    });
    headersHtml += `<th>Acciones</th></tr>`;
    thead.innerHTML = headersHtml;
    
    if (!assessments || assessments.length === 0) {
        const colSpan = activeFields.reduce((acc, field) => {
            if (field.db_column === 'body_fat_percentage' || field.db_column === 'weight_kg') return acc + 2;
            return acc + 1;
        }, 2); // 2 for Fecha + Acciones
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;">No hay registros de valoración.</td></tr>`;
        if (mobileContainer) {
            mobileContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--color-text-secondary);">No hay historial registrado.</div>`;
        }
        return;
    }
    
    const sorted = [...assessments].reverse();
    
    sorted.forEach((as, idx) => {
        let rowHtml = `<tr><td style="font-weight:700; color:var(--accent-cyan);">${as.date}</td>`;
        let detailsHtml = '';
        
        activeFields.forEach(field => {
            if (field.db_column === 'body_fat_percentage') {
                const fatPct = as.body_fat_percentage || 0;
                const sumFolds = as.sum_folds || ((as.scapular || 0) + (as.triceps || 0) + (as.abdominal || 0) + (as.iliac || as.suprailiac || 0));
                rowHtml += `<td><strong>${fatPct.toFixed(1)}%</strong></td><td>${sumFolds ? sumFolds.toFixed(1) + ' mm' : '-'}</td>`;
                detailsHtml += `
                    <div class="assessment-detail-row"><span class="detail-label">% Grasa</span><span class="detail-value">${fatPct.toFixed(1)}%</span></div>
                    <div class="assessment-detail-row"><span class="detail-label">Suma Pliegues</span><span class="detail-value">${sumFolds ? sumFolds.toFixed(1) + ' mm' : '-'}</span></div>
                `;
            } else if (field.db_column === 'weight_kg') {
                const weight = as.weight_kg || 0;
                const bmi = as.bmi || (weight / (((as.height_cm || 170) / 100.0) ** 2));
                rowHtml += `<td>${weight} kg</td><td>${bmi.toFixed(1)}</td>`;
                detailsHtml += `
                    <div class="assessment-detail-row"><span class="detail-label">Peso</span><span class="detail-value">${weight} kg</span></div>
                    <div class="assessment-detail-row"><span class="detail-label">IMC</span><span class="detail-value">${bmi.toFixed(1)}</span></div>
                `;
            } else if (field.db_column === 'lean_mass_kg') {
                const leanMass = as.lean_mass_kg || (as.weight_kg - (as.weight_kg * ((as.body_fat_percentage || 0) / 100.0)));
                rowHtml += `<td>${leanMass.toFixed(1)} kg</td>`;
                detailsHtml += `<div class="assessment-detail-row"><span class="detail-label">Masa Magra</span><span class="detail-value">${leanMass.toFixed(1)} kg</span></div>`;
            } else if (field.is_default && field.db_column) {
                const val = as[field.db_column];
                rowHtml += `<td>${val !== null && val !== undefined ? val : '-'}</td>`;
                detailsHtml += `<div class="assessment-detail-row"><span class="detail-label">${field.field_name}</span><span class="detail-value">${val !== null && val !== undefined ? val + (field.unit ? ' ' + field.unit : '') : '-'}</span></div>`;
            } else {
                let customVal = '-';
                if (as.custom_data) {
                    try {
                        const parsed = typeof as.custom_data === 'string' ? JSON.parse(as.custom_data) : as.custom_data;
                        if (parsed && parsed[field.field_name] !== undefined) customVal = parsed[field.field_name];
                    } catch (e) {}
                }
                rowHtml += `<td>${customVal}</td>`;
                detailsHtml += `<div class="assessment-detail-row"><span class="detail-label">${field.field_name}</span><span class="detail-value">${customVal}${customVal !== '-' && field.unit ? ' ' + field.unit : ''}</span></div>`;
            }
        });
        
        rowHtml += `
            <td style="display: flex; gap: 5px;">
                <button class="btn-nav" style="color:var(--accent-cyan);" onclick="editAssessment(${as.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-nav" style="color:var(--accent-red);" onclick="deleteAssessment(${as.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += rowHtml;
        
        if (mobileContainer) {
            const card = document.createElement("div");
            card.className = "mobile-assessment-card";
            card.innerHTML = `
                <div class="mobile-assessment-header" onclick="toggleAssessmentDetails(${idx})">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fa-regular fa-calendar-check" style="color:var(--accent-cyan);"></i>
                        <span style="font-weight:700; color:var(--color-text-primary);">${as.date}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="badge-weight">${as.weight_kg ? as.weight_kg + ' kg' : '-'}</span>
                        <i class="fa-solid fa-chevron-down chevron-icon" id="chevronIcon-${idx}"></i>
                    </div>
                </div>
                <div class="mobile-assessment-details" id="assessmentDetails-${idx}" style="display:none;">
                    ${detailsHtml}
                    <div style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                        <button class="btn-nav" style="color:var(--accent-cyan); width:auto;" onclick="editAssessment(${as.id})"><i class="fa-solid fa-pen"></i> Editar</button>
                        <button class="btn-nav" style="color:var(--accent-red); width:auto;" onclick="deleteAssessment(${as.id})"><i class="fa-solid fa-trash"></i> Eliminar</button>
                    </div>
                </div>
            `;
            mobileContainer.appendChild(card);
        }
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
                            <td class="exercise-name" style="padding: 4px;">${ex.exercise_name}</td>
                            <td style="padding: 4px;"><span class="compliance-badge" style="padding: 2px 4px;">${ex.sets_count} Series</span></td>
                            <td style="padding: 4px;"><strong>${ex.reps_range}</strong></td>
                            <td style="padding: 4px;">RPE ${ex.rpe_target || 'N/A'}</td>
                            <td style="padding: 4px;">${ex.rest_seconds ? ex.rest_seconds + 's' : '-'}</td>
                            <td style="padding: 4px;">
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
                    <div style="margin-bottom: 10px; border-left: 2px solid var(--accent-cyan); padding-left: 8px; background: rgba(0,0,0,0.1); padding-top: 8px; padding-bottom: 8px; border-radius: 0 4px 4px 0;">
                        <h5 style="color: var(--accent-cyan); margin-bottom: 5px; font-size: 12px; margin-top: 0;">Bloque: ${block.name} <span style="color:var(--color-text-secondary); font-size:10px; font-weight:normal;">[${block.routine_class}]</span></h5>
                        <div style="overflow-x: auto; width: 100%;">
                            <table class="exercise-table" style="min-width: 400px; font-size: 11px; white-space: nowrap;">
                                <thead>
                                    <tr>
                                        <th style="padding: 4px;">Ejercicio</th>
                                        <th style="padding: 4px;">Series</th>
                                        <th style="padding: 4px;">Rango Reps</th>
                                        <th style="padding: 4px;">RPE</th>
                                        <th style="padding: 4px;">Descanso</th>
                                        <th style="padding: 4px;">Multimedia</th>
                                    </tr>
                                </thead>
                                <tbody>${exercisesHtml}</tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }
        
        dayCard.innerHTML = `
            <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 13px;">${day.day_name}</h4>
            ${blocksHtml}
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
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    
    const activeTargetParts = [];
    const hasCal = activeFields.some(f => f.db_column === 'calories_kcal');
    const hasPro = activeFields.some(f => f.db_column === 'protein_g');
    const hasCarb = activeFields.some(f => f.db_column === 'carbs_g');
    const hasFat = activeFields.some(f => f.db_column === 'fat_g');
    
    if (hasCal) activeTargetParts.push(`Meta Calórica: ${diet.target_calories} Kcal`);
    if (hasPro) activeTargetParts.push(`P: ${diet.target_protein}g`);
    if (hasCarb) activeTargetParts.push(`C: ${diet.target_carbs}g`);
    if (hasFat) activeTargetParts.push(`G: ${diet.target_fat}g`);
    
    const targetLabel = activeTargetParts.length > 0 ? `Target: ${activeTargetParts.join(' | ')}` : '';
    
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom: 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <h3 style="margin:0;">Plan: ${diet.title}</h3>
                <div style="display:flex; gap:5px;">
                    <button class="btn-nav" style="color: var(--accent-green); padding:5px 8px;" onclick="editNutritionPlan(${diet.id}, false)" title="Editar Plan"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-nav" style="color: var(--accent-red); padding:5px 8px;" onclick="deleteNutritionPlan(${diet.id})" title="Eliminar Plan"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            ${targetLabel ? `<div style="font-size:11px; background:rgba(139,92,246,0.15); color:var(--accent-purple); padding:5px; border-radius:4px; border:1px solid rgba(139,92,246,0.3); text-align:center;">${targetLabel}</div>` : ''}
        </div>
        <p style="color:var(--color-text-secondary); margin-bottom: 20px;">${diet.description || ''}</p>
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
                <span>Subtotal: ${subtotalParts.join(' | ')}</span>
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
        renderAssessmentForm();
        // Default date to today
        document.getElementById("formDate").value = new Date().toISOString().substring(0, 10);
    } else {
        container.style.display = "none";
    }
}

// Generate the input fields inside the assessment form dynamically based on config
function renderAssessmentForm() {
    const container = document.getElementById("assessmentFormGrid");
    if (!container) return;
    
    // Core fields: Date and resting HR are always present
    let formHtml = `
        <div class="form-group">
            <label>Fecha de Evaluación</label>
            <input type="date" id="formDate" required>
        </div>
        <div class="form-group">
            <label>Frecuencia Cardíaca Reposo (bpm)</label>
            <input type="number" id="formFcRep" value="65">
        </div>
    `;
    
    const activeFields = globalAssessmentConfig.filter(f => f.is_active == 1 || f.is_active === true);
    
    activeFields.forEach(field => {
        if (field.db_column === 'lean_mass_kg') {
            // Masa magra is calculated from weight and fat%, no input needed
            return;
        }
        
        if (field.db_column === 'body_fat_percentage') {
            // Show the 4 skinfolds inputs
            formHtml += `
                <div class="form-group">
                    <label>Pliegue Tríceps (mm)</label>
                    <input type="number" step="0.1" id="formFoldTriceps" placeholder="0.0">
                </div>
                <div class="form-group">
                    <label>Pliegue Subescapular (mm)</label>
                    <input type="number" step="0.1" id="formFoldScapular" placeholder="0.0">
                </div>
                <div class="form-group">
                    <label>Pliegue Suprailiaco (mm)</label>
                    <input type="number" step="0.1" id="formFoldIliac" placeholder="0.0">
                </div>
                <div class="form-group">
                    <label>Pliegue Abdominal (mm)</label>
                    <input type="number" step="0.1" id="formFoldAbdominal" placeholder="0.0">
                </div>
            `;
        } else {
            const inputId = `formField_${field.id}`;
            const stepAttr = field.field_type === 'number' ? 'step="0.1"' : '';
            const typeAttr = field.field_type === 'number' ? 'number' : 'text';
            const unitLabel = field.unit ? ` (${field.unit})` : '';
            
            // pre-fill height from client profile if it's Estatura
            let valueAttr = '';
            if (field.db_column === 'height_cm' && selectedUserFullData?.profile?.height_cm) {
                valueAttr = `value="${selectedUserFullData.profile.height_cm}"`;
            }
            
            formHtml += `
                <div class="form-group">
                    <label>${field.field_name}${unitLabel}</label>
                    <input type="${typeAttr}" ${stepAttr} id="${inputId}" ${valueAttr} placeholder="Ingresar valor">
                </div>
            `;
        }
    });
    
    container.innerHTML = formHtml;
}

// Submit New Assessment (Ficha) to API dynamically
async function submitNewAssessment(event) {
    event.preventDefault();
    
    const date = document.getElementById("formDate").value;
    const fcRep = parseInt(document.getElementById("formFcRep").value) || 60;
    
    const payload = {
        user_id: activeUserId,
        date,
        fc_rep,
        height_cm: selectedUserFullData?.profile?.height_cm || 170,
        custom_data: {}
    };
    
    const activeFields = globalAssessmentConfig.filter(f => f.is_active == 1 || f.is_active === true);
    
    activeFields.forEach(field => {
        if (field.db_column === 'body_fat_percentage') {
            payload.triceps = parseFloat(document.getElementById("formFoldTriceps")?.value || 0);
            payload.scapular = parseFloat(document.getElementById("formFoldScapular")?.value || 0);
            payload.iliac = parseFloat(document.getElementById("formFoldIliac")?.value || 0);
            payload.abdominal = parseFloat(document.getElementById("formFoldAbdominal")?.value || 0);
        } else if (field.db_column === 'lean_mass_kg') {
            // Calculated automatically
        } else if (field.is_default && field.db_column) {
            const inputVal = parseFloat(document.getElementById(`formField_${field.id}`)?.value || 0);
            payload[field.db_column] = inputVal;
        } else {
            const inputVal = document.getElementById(`formField_${field.id}`)?.value || '';
            payload.custom_data[field.field_name] = field.field_type === 'number' ? parseFloat(inputVal || 0) : inputVal;
        }
    });
    
    payload.custom_data = JSON.stringify(payload.custom_data);
    
    try {
        const response = await fetch('/api/assessments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.success) {
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

async function deleteAssessment(id) {
    if (!confirm("¿Eliminar esta valoración?")) return;
    try {
        const res = await fetch(`/api/assessments?id=${id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            alert("Valoración eliminada.");
            selectClient(activeUserId);
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error(e);
        alert("Error de red");
    }
}

function editAssessment(id) {
    const as = selectedUserFullData.assessments.find(a => a.id === id);
    if (!as) return;
    
    const container = document.getElementById("newAssessmentFormContainer");
    if (container.style.display === "none") {
        container.style.display = "block";
        renderAssessmentForm();
    }
    
    // Core fields: Date and resting HR
    if (document.getElementById("formDate")) document.getElementById("formDate").value = as.date;
    if (document.getElementById("formFcRep")) document.getElementById("formFcRep").value = as.fc_rep || '';
    
    const activeFields = globalAssessmentConfig.filter(f => f.is_active == 1 || f.is_active === true);
    activeFields.forEach(field => {
        if (field.db_column === 'body_fat_percentage') {
            if (document.getElementById("formFoldTriceps")) document.getElementById("formFoldTriceps").value = as.triceps || '';
            if (document.getElementById("formFoldScapular")) document.getElementById("formFoldScapular").value = as.scapular || '';
            if (document.getElementById("formFoldIliac")) document.getElementById("formFoldIliac").value = as.iliac_fold || as.iliac || '';
            if (document.getElementById("formFoldAbdominal")) document.getElementById("formFoldAbdominal").value = as.abdominal || '';
        } else if (field.is_default && field.db_column) {
            const inputEl = document.getElementById(`formField_${field.id}`);
            if (inputEl && as[field.db_column] !== undefined) {
                inputEl.value = as[field.db_column];
            }
        } else {
            const inputEl = document.getElementById(`formField_${field.id}`);
            if (inputEl && as.custom_data) {
                try {
                    const parsed = typeof as.custom_data === 'string' ? JSON.parse(as.custom_data) : as.custom_data;
                    if (parsed[field.field_name] !== undefined) {
                        inputEl.value = parsed[field.field_name];
                    }
                } catch (e) {}
            }
        }
    });
    
    document.getElementById("newAssessmentFormContainer").scrollIntoView({ behavior: 'smooth' });
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
    document.getElementById('nutritionConfigLibView').style.display = 'none';
    if(document.getElementById('settingsView')) document.getElementById('settingsView').style.display = 'none';
    
    // Deactivate nav links
    document.getElementById('navClients').classList.remove('active');
    document.getElementById('navTraining').classList.remove('active');
    document.getElementById('navNutrition').classList.remove('active');
    document.getElementById('navAssessment').classList.remove('active');
    if(document.getElementById('navSettings')) document.getElementById('navSettings').classList.remove('active');
    
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
        fetchFoodLibraryAndRender();
    } else if (viewName === 'assessment') {
        document.getElementById('assessmentLibView').style.display = 'block';
        document.getElementById('navAssessment').classList.add('active');
        fetchAssessmentConfig();
    } else if (viewName === 'nutrition_config') {
        document.getElementById('nutritionConfigLibView').style.display = 'block';
        document.getElementById('navNutrition').classList.add('active');
        fetchNutritionConfig();
    } else if (viewName === 'settings') {
        if(document.getElementById('settingsView')) document.getElementById('settingsView').style.display = 'block';
        if(document.getElementById('navSettings')) document.getElementById('navSettings').classList.add('active');
        renderSettingsClientsList();
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
            let daysHtml = r.days.map(d => `<span class="compliance-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-orange); display: inline-block; margin-bottom: 5px;">${d.day_name} (${d.blocks.length} blq - ${d.total_exercises} ej)</span>`).join(' ');
            container.innerHTML += `
                <div class="workout-day-card" style="margin-bottom: 10px; padding: 12px; background: rgba(0,0,0,0.15);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom: 8px;">
                        <h4 style="margin: 0; font-size: 14px;">${r.title}</h4>
                        <div style="display:flex; gap: 5px;">
                            <button class="btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="assignRoutinePrompt(${r.id}, '${r.title}')"><i class="fa-solid fa-user-plus"></i> Asignar</button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-cyan);" onclick="editRoutine(${r.id})"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-red);" onclick="deleteRoutine(${r.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <p style="color: var(--color-text-secondary); font-size: 12px; margin-bottom: 10px; margin-top:0;">${r.description || ''}</p>
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

function addRoutineDay(defaultName = "", prefillBlocks = null, defaultOrder = null) {
    dayCounter++;
    const dId = dayCounter;
    const container = document.getElementById('daysContainer');
    
    if (defaultOrder === null || defaultOrder === undefined) {
        const currentCards = container.querySelectorAll('.routine-day-builder').length;
        defaultOrder = currentCards + 1;
    }
    if (!defaultName) {
        defaultName = `Día ${defaultOrder}`;
    }
    
    const div = document.createElement('div');
    div.className = 'glass-card routine-day-builder';
    div.style.marginBottom = '10px';
    div.style.padding = '15px';
    div.style.background = 'rgba(0,0,0,0.2)';
    
    div.innerHTML = `
        <div style="display:flex; gap: 15px; margin-bottom: 10px; align-items: flex-end; width: 90%;">
            <div class="form-group" style="flex: 3; margin-bottom: 0;">
                <label style="font-size: 11px; color: var(--color-text-secondary);">Nombre del Día</label>
                <input type="text" class="day-name-input" placeholder="Nombre del Día (Ej. Torso)" value="${defaultName}" required style="width: 100%;">
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0; min-width: 80px; max-width: 100px;">
                <label style="font-size: 11px; color: var(--color-text-secondary);">Orden</label>
                <input type="number" class="day-order-input" placeholder="Orden" value="${defaultOrder}" required min="1" style="width: 100%;">
            </div>
            <button type="button" class="btn-nav" onclick="this.parentElement.parentElement.remove()" style="color: var(--accent-red); margin-bottom: 5px;"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="day-blocks-container" id="dayBlocks_${dId}"></div>
        <button type="button" class="btn-secondary" style="font-size: 12px; margin-top: 10px;" onclick="addBlockToDayBuilder(this)"><i class="fa-solid fa-plus"></i> Añadir Bloque</button>
    `;
    
    container.appendChild(div);
    
    if (prefillBlocks && prefillBlocks.length > 0) {
        prefillBlocks.forEach(blk => {
            const blkId = typeof blk === 'object' ? (blk.block_id || blk.id) : blk;
            addBlockToDayBuilderBtn(dId, blkId);
        });
    } else {
        addBlockToDayBuilderBtn(dId);
    }
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

function addBlockToDayBuilderBtn(dId, prefillBlockId = null) {
    const container = document.getElementById(`dayBlocks_${dId}`);
    if (!container) return;
    const blockDiv = document.createElement('div');
    blockDiv.style.display = 'flex';
    blockDiv.style.gap = '5px';
    blockDiv.style.marginBottom = '5px';
    blockDiv.className = 'day-block-row';
    
    let optionsHTML = globalBlocksCache.map(b => `<option value="${b.id}" ${b.id === prefillBlockId ? 'selected' : ''}>${b.name} (${b.routine_class})</option>`).join('');
    
    blockDiv.innerHTML = `
        <select class="block-id" style="flex:1;" required>${optionsHTML}</select>
        <button type="button" class="btn-nav" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(blockDiv);
}

async function submitNewRoutine(e) {
    e.preventDefault();
    
    const dayElements = document.querySelectorAll('.routine-day-builder');
    let tempDays = [];
    
    dayElements.forEach((dayEl, idx) => {
        const dayName = dayEl.querySelector('.day-name-input').value;
        const dayOrder = parseInt(dayEl.querySelector('.day-order-input').value) || (idx + 1);
        const blocks = [];
        const blockRows = dayEl.querySelectorAll('.day-block-row');
        blockRows.forEach((row, bIdx) => {
            blocks.push({
                block_id: parseInt(row.querySelector('.block-id').value),
                order_index: bIdx + 1
            });
        });
        
        // Shift any already added day that has order_index >= dayOrder
        tempDays.forEach(d => {
            if (d.order_index >= dayOrder) {
                d.order_index += 1;
            }
        });
        
        tempDays.push({
            day_name: dayName,
            order_index: dayOrder,
            blocks: blocks
        });
    });
    
    // Sort days by order index ascending
    tempDays.sort((a, b) => a.order_index - b.order_index);
    
    // Normalize order indices to be sequential starting from 1
    tempDays.forEach((d, index) => {
        d.order_index = index + 1;
    });

    const payload = {
        title: document.getElementById('newRoutineTitle').value,
        description: document.getElementById('newRoutineDesc').value,
        days: tempDays
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
                <div style="background: rgba(14, 165, 233, 0.2); ${borderStyle} border-radius: 8px; padding: 5px; cursor: pointer; transition: 0.2s; display:flex; flex-direction:column; align-items:center;" 
                     onmouseover="this.style.background='rgba(14, 165, 233, 0.4)'" 
                     onmouseout="this.style.background='rgba(14, 165, 233, 0.2)'"
                     onclick='showDayDetails(${JSON.stringify(log)})'>
                    <div style="font-weight:bold; color: white; font-size:12px;">${d}</div>
                    <div style="font-size: 12px; color: var(--accent-cyan); margin-top:2px;"><i class="fa-solid fa-check"></i></div>
                </div>
            `;
        } else {
            // Empty day
            grid.innerHTML += `
                <div style="background: rgba(255, 255, 255, 0.05); ${borderStyle} border-radius: 8px; padding: 5px; opacity: 0.5; display:flex; align-items:center; justify-content:center;">
                    <div style="font-weight:bold; font-size:12px;">${d}</div>
                </div>
            `;
        }
    }
}

function showDayDetails(log) {
    document.getElementById('dayDetailPanel').style.display = 'block';
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
        const url = endpoint.includes('?') ? `${endpoint}&id=${id}` : `${endpoint}?id=${id}`;
        const response = await fetch(url, {
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
    const dayElements = document.querySelectorAll('.routine-day-builder');
    let tempDays = [];
    
    dayElements.forEach((dayEl, idx) => {
        const dayName = dayEl.querySelector('.day-name-input').value;
        const dayOrder = parseInt(dayEl.querySelector('.day-order-input').value) || (idx + 1);
        const blockIds = Array.from(dayEl.querySelectorAll('.block-id')).map(sel => parseInt(sel.value));
        
        // Shift any already added day that has order_index >= dayOrder
        tempDays.forEach(d => {
            if (d.order_index >= dayOrder) {
                d.order_index += 1;
            }
        });
        
        tempDays.push({
            day_name: dayName,
            order_index: dayOrder,
            block_ids: blockIds
        });
    });
    
    // Sort days by order index ascending
    tempDays.sort((a, b) => a.order_index - b.order_index);
    
    // Normalize order indices to be sequential starting from 1
    tempDays.forEach((d, index) => {
        d.order_index = index + 1;
    });
    
    const payload = {
        id: editingRoutineId,
        title: document.getElementById('newRoutineTitle').value,
        description: document.getElementById('newRoutineDesc').value,
        days: tempDays
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
            addRoutineDay(day.day_name, day.blocks, day.order_index);
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

let editingNutritionPlanId = null;

function openNutritionModal(isGlobal = false, editPlanId = null) {
    isCreatingGlobalNutrition = isGlobal;
    editingNutritionPlanId = editPlanId;
    
    if (!isGlobal && !activeUserId) {
        alert("Selecciona un cliente primero.");
        return;
    }
    
    const modal = document.getElementById("addNutritionModal");
    const modalTitle = modal.querySelector("h3");
    
    // Reset form
    document.getElementById("newNutTitle").value = "";
    document.getElementById("newNutDesc").value = "";
    document.getElementById("newNutStart").value = new Date().toISOString().substring(0, 10);
    
    let d = new Date();
    d.setMonth(d.getMonth() + 1);
    document.getElementById("newNutEnd").value = d.toISOString().substring(0, 10);
    
    document.getElementById("mealsContainer").innerHTML = "";
    nutritionMealCounter = 0;
    
    if (editPlanId) {
        if (modalTitle) {
            modalTitle.innerHTML = `<i class="fa-solid fa-apple-whole"></i> Editar Plan de Nutrición`;
        }
        let plan = null;
        if (isGlobal) {
            plan = globalNutritionPlansCache.find(p => p.id === editPlanId);
        } else {
            plan = selectedUserFullData.nutrition_plan;
        }
        
        if (plan) {
            document.getElementById("newNutTitle").value = plan.title;
            document.getElementById("newNutDesc").value = plan.description || "";
            document.getElementById("newNutStart").value = plan.start_date || "";
            document.getElementById("newNutEnd").value = plan.end_date || "";
            
            renderTargetMacrosForm(plan);
            
            if (plan.meals && plan.meals.length > 0) {
                plan.meals.forEach(meal => {
                    addNutritionMeal(meal.meal_name, meal.items, meal.order_index);
                });
            } else {
                addNutritionMeal("Desayuno", null, 1);
                addNutritionMeal("Almuerzo", null, 2);
                addNutritionMeal("Cena", null, 3);
            }
        }
    } else {
        if (modalTitle) {
            modalTitle.innerHTML = isGlobal ? `<i class="fa-solid fa-apple-whole"></i> Nueva Plantilla de Nutrición` : `<i class="fa-solid fa-apple-whole"></i> Asignar Nuevo Plan de Nutrición`;
        }
        renderTargetMacrosForm();
        addNutritionMeal("Desayuno", null, 1);
        addNutritionMeal("Almuerzo", null, 2);
        addNutritionMeal("Cena", null, 3);
    }
    
    modal.style.display = "flex";
}

function closeNutritionModal() {
    document.getElementById("addNutritionModal").style.display = "none";
    editingNutritionPlanId = null;
}

function addNutritionMeal(defaultName = "", prefillItems = null, defaultOrder = null) {
    nutritionMealCounter++;
    const mId = nutritionMealCounter;
    
    const container = document.getElementById("mealsContainer");
    
    if (defaultOrder === null || defaultOrder === undefined) {
        const currentCards = container.querySelectorAll(".workout-day-card").length;
        defaultOrder = currentCards + 1;
    }
    
    const mealCard = document.createElement("div");
    mealCard.className = "workout-day-card";
    mealCard.id = `mealCard_${mId}`;
    mealCard.style.position = "relative";
    mealCard.style.padding = "15px";
    
    mealCard.innerHTML = `
        <button type="button" class="btn-nav" style="position: absolute; top: 10px; right: 10px; color: var(--accent-red);" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
        
        <div style="display: flex; gap: 15px; margin-bottom: 10px; align-items: flex-end; width: 90%;">
            <div class="form-group" style="flex: 3; margin-bottom: 0;">
                <label style="font-size: 11px; color: var(--color-text-secondary);">Nombre de la Comida</label>
                <input type="text" class="meal-name-input" placeholder="Ej. Desayuno o Snack" value="${defaultName}" required style="width: 100%;">
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0; min-width: 80px; max-width: 100px;">
                <label style="font-size: 11px; color: var(--color-text-secondary);">Orden</label>
                <input type="number" class="meal-order-input" placeholder="Orden" value="${defaultOrder}" required min="1" style="width: 100%;">
            </div>
        </div>

        <div style="margin-top: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <label style="font-size: 12px; color: var(--accent-green);">Alimentos / Ingredientes</label>
                <button type="button" class="btn-nav" onclick="addFoodItemToMeal(${mId})" style="font-size: 11px;"><i class="fa-solid fa-plus"></i> Ingrediente</button>
            </div>
            <div id="mealFoods_${mId}">
                <!-- Alimentos -->
            </div>
        </div>
    `;
    
    container.appendChild(mealCard);
    if (prefillItems && prefillItems.length > 0) {
        prefillItems.forEach(item => {
            addFoodItemToMeal(mId, item);
        });
    } else {
        addFoodItemToMeal(mId); // Add at least one empty food item
    }
}

function renderTargetMacrosForm(prefillPlan = null) {
    const grid = document.getElementById("targetMacrosGrid");
    if (!grid) return;
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    
    const targets = [
        { column: 'calories_kcal', label: 'Calorías (Kcal)', id: 'newNutCal', placeholder: 'Ej. 2500' },
        { column: 'protein_g', label: 'Proteína (g)', id: 'newNutPro', placeholder: 'Ej. 160' },
        { column: 'carbs_g', label: 'Carbohidratos (g)', id: 'newNutCarb', placeholder: 'Ej. 250' },
        { column: 'fat_g', label: 'Grasas (g)', id: 'newNutFat', placeholder: 'Ej. 65' }
    ];
    
    let html = '';
    let count = 0;
    targets.forEach(t => {
        const isActive = activeFields.some(f => f.db_column === t.column);
        let val = '';
        if (prefillPlan) {
            if (t.column === 'calories_kcal') val = prefillPlan.target_calories;
            else if (t.column === 'protein_g') val = prefillPlan.target_protein;
            else if (t.column === 'carbs_g') val = prefillPlan.target_carbs;
            else if (t.column === 'fat_g') val = prefillPlan.target_fat;
        }
        
        if (isActive) {
            html += `
                <div class="form-group">
                    <label>${t.label}</label>
                    <input type="number" id="${t.id}" required placeholder="${t.placeholder}" value="${val !== null && val !== undefined ? val : ''}">
                </div>
            `;
            count++;
        } else {
            html += `<input type="hidden" id="${t.id}" value="${val || 0}">`;
        }
    });
    
    const title = document.getElementById("targetMacrosTitle");
    if (title) {
        title.style.display = count > 0 ? "block" : "none";
    }
    
    grid.innerHTML = html;
}

function addFoodItemToMeal(mId, prefillItem = null) {
    const container = document.getElementById(`mealFoods_${mId}`);
    if (!container) return;
    const foodRow = document.createElement("div");
    foodRow.style.display = "flex";
    foodRow.style.gap = "5px";
    foodRow.style.marginBottom = "5px";
    foodRow.className = "food-item-row";
    
    let html = `
    <div class="food-autocomplete-wrapper" style="position: relative; flex: 2; min-width: 120px; display: flex; flex-direction: column;">
        <input type="text" class="food-name" placeholder="Alimento" value="${prefillItem ? prefillItem.food_name : ''}" required style="width: 100%; font-size: 11px; margin: 0; box-sizing: border-box;" autocomplete="off">
        <div class="food-suggestions-dropdown" style="display: none; position: absolute; top: 100%; left: 0; width: 100%; max-height: 200px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 8px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>
    </div>`;
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    activeFields.forEach(field => {
        const stepAttr = field.field_type === 'number' ? 'step="0.1"' : '';
        const typeAttr = field.field_type === 'number' ? 'number' : 'text';
        const unitLabel = field.unit ? `${field.unit}` : '';
        const placeholder = `${field.field_name.substring(0,3)}${unitLabel ? '(' + unitLabel + ')' : ''}`;
        
        let val = '';
        if (prefillItem) {
            if (field.is_default && field.db_column) {
                val = prefillItem[field.db_column] !== null && prefillItem[field.db_column] !== undefined ? prefillItem[field.db_column] : '';
            } else if (prefillItem.custom_data && prefillItem.custom_data[field.field_name] !== undefined) {
                val = prefillItem.custom_data[field.field_name];
            }
        }
        
        html += `<input type="${typeAttr}" ${stepAttr} class="food-field" data-id="${field.id}" placeholder="${placeholder}" value="${val}" required style="flex: 1; font-size: 11px; min-width: 60px;">`;
    });
    
    html += `<button type="button" class="btn-nav" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>`;
    foodRow.innerHTML = html;
    
    // Bind autocomplete & auto-calculation
    const nameInput = foodRow.querySelector('.food-name');
    const dropdown = foodRow.querySelector('.food-suggestions-dropdown');
    const wrapper = foodRow.querySelector('.food-autocomplete-wrapper');
    let currentFocus = -1;
    
    const showSuggestions = (query = '') => {
        const filtered = globalFoodLibrary.filter(food => 
            food.name.toLowerCase().includes(query.toLowerCase())
        );
        dropdown.innerHTML = '';
        currentFocus = -1;
        if (filtered.length === 0) {
            dropdown.style.display = 'none';
            return;
        }
        filtered.forEach((food, index) => {
            const item = document.createElement('div');
            item.className = 'food-suggestion-item';
            item.style.padding = '8px 10px';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
            item.style.fontSize = '12px';
            item.style.color = 'var(--color-text-primary)';
            item.innerText = food.name;
            item.dataset.index = index;
            
            item.addEventListener('mouseenter', () => {
                removeActiveSuggestions();
                currentFocus = index;
                addActiveSuggestion(item);
            });
            
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectFoodItem(food);
            });
            
            dropdown.appendChild(item);
        });
        dropdown.style.display = 'block';
    };
    
    const selectFoodItem = (food) => {
        nameInput.value = food.name;
        foodRow.dataset.selectedFood = food.name;
        
        const weightInput = foodRow.querySelector('.food-field[data-id="1"]');
        if (weightInput) {
            if (!weightInput.value) {
                weightInput.value = food.weight_g;
            }
        }
        scaleFoodFields(foodRow, food);
        dropdown.style.display = 'none';
    };
    
    const addActiveSuggestion = (x) => {
        if (!x) return false;
        x.style.background = 'rgba(243, 202, 76, 0.15)';
    };
    
    const removeActiveSuggestions = () => {
        const items = dropdown.getElementsByClassName('food-suggestion-item');
        for (let i = 0; i < items.length; i++) {
            items[i].style.background = 'transparent';
        }
    };
    
    const setActive = (items) => {
        if (!items) return false;
        removeActiveSuggestions();
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = items.length - 1;
        addActiveSuggestion(items[currentFocus]);
        if (items[currentFocus]) {
            items[currentFocus].scrollIntoView({ block: 'nearest' });
        }
    };
    
    nameInput.addEventListener('keydown', (e) => {
        const items = dropdown.getElementsByClassName('food-suggestion-item');
        if (dropdown.style.display === 'none' || items.length === 0) return;
        
        if (e.keyCode === 40) { // Arrow down
            currentFocus++;
            setActive(items);
        } else if (e.keyCode === 38) { // Arrow up
            currentFocus--;
            setActive(items);
        } else if (e.keyCode === 13) { // Enter
            e.preventDefault();
            if (currentFocus > -1) {
                if (items[currentFocus]) {
                    const selectedName = items[currentFocus].innerText;
                    const food = globalFoodLibrary.find(f => f.name === selectedName);
                    if (food) selectFoodItem(food);
                }
            }
        }
    });
    
    nameInput.addEventListener('focus', () => {
        showSuggestions(nameInput.value);
    });
    
    nameInput.addEventListener('click', () => {
        showSuggestions(nameInput.value);
    });
    
    nameInput.addEventListener('input', (e) => {
        const val = e.target.value;
        showSuggestions(val);
        
        const matchedFood = globalFoodLibrary.find(f => f.name.toLowerCase() === val.trim().toLowerCase());
        if (matchedFood) {
            foodRow.dataset.selectedFood = matchedFood.name;
            const weightInput = foodRow.querySelector('.food-field[data-id="1"]');
            if (weightInput) {
                if (!weightInput.value) {
                    weightInput.value = matchedFood.weight_g;
                }
            }
            scaleFoodFields(foodRow, matchedFood);
        }
    });
    
    nameInput.addEventListener('blur', () => {
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 200);
    });
    
    const weightInput = foodRow.querySelector('.food-field[data-id="1"]');
    if (weightInput) {
        weightInput.addEventListener('input', () => {
            const foodName = foodRow.dataset.selectedFood;
            if (foodName) {
                const matchedFood = globalFoodLibrary.find(f => f.name === foodName);
                if (matchedFood) {
                    scaleFoodFields(foodRow, matchedFood);
                }
            }
        });
    }
    
    if (prefillItem) {
        const matched = globalFoodLibrary.find(f => f.name.toLowerCase() === prefillItem.food_name.toLowerCase());
        if (matched) {
            foodRow.dataset.selectedFood = matched.name;
        }
    }
    
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
        target_calories: parseInt(document.getElementById("newNutCal").value) || 0,
        target_protein: parseInt(document.getElementById("newNutPro").value) || 0,
        target_carbs: parseInt(document.getElementById("newNutCarb").value) || 0,
        target_fat: parseInt(document.getElementById("newNutFat").value) || 0,
        meals: []
    };
    
    const mealCards = document.querySelectorAll("#mealsContainer .workout-day-card");
    let tempMeals = [];
    let orderIdx = 1;
    
    mealCards.forEach((card, idx) => {
        const mealName = card.querySelector(".meal-name-input").value;
        const mealOrder = parseInt(card.querySelector(".meal-order-input").value) || (idx + 1);
        const foodRows = card.querySelectorAll(".food-item-row");
        
        let mealItems = [];
        foodRows.forEach(row => {
            const item = {
                food_name: row.querySelector(".food-name").value,
                weight_g: 0,
                calories_kcal: 0,
                protein_g: 0,
                carbs_g: 0,
                fat_g: 0,
                custom_data: {}
            };
            
            const fieldInputs = row.querySelectorAll(".food-field");
            fieldInputs.forEach(input => {
                const fId = parseInt(input.dataset.id);
                const field = globalNutritionConfig.find(f => f.id === fId);
                if (field) {
                    const rawVal = input.value;
                    const val = field.field_type === 'number' ? (parseFloat(rawVal) || 0) : rawVal;
                    if (field.is_default && field.db_column) {
                        item[field.db_column] = val;
                    } else {
                        item.custom_data[field.field_name] = val;
                    }
                }
            });
            
            mealItems.push(item);
        });
        
        if (mealItems.length > 0) {
            // Shift any already added meal that has order_index >= mealOrder
            tempMeals.forEach(m => {
                if (m.order_index >= mealOrder) {
                    m.order_index += 1;
                }
            });
            
            tempMeals.push({
                meal_name: mealName,
                order_index: mealOrder,
                items: mealItems
            });
        }
    });
    
    // Sort meals by order index ascending
    tempMeals.sort((a, b) => a.order_index - b.order_index);
    
    // Normalize order indices to be sequential starting from 1
    tempMeals.forEach((m, index) => {
        m.order_index = index + 1;
    });
    
    payload.meals = tempMeals;
    
    if (editingNutritionPlanId) {
        payload.id = editingNutritionPlanId;
    }
    
    try {
        const res = await fetch('/api/nutrition_plans', {
            method: editingNutritionPlanId ? 'PUT' : 'POST',
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
        const res = await fetch(`/api/nutrition_plans?id=${planId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: planId })
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
                    <td style="padding: 4px;">${plan.id}</td>
                    <td style="font-weight: bold; color: var(--accent-green); padding: 4px;">${plan.title}</td>
                    <td style="padding: 4px;">${plan.description || '-'}</td>
                    <td style="padding: 4px;">${plan.target_calories || 0} kcal</td>
                    <td style="padding: 4px;">${plan.target_protein || 0}g / ${plan.target_carbs || 0}g / ${plan.target_fat || 0}g</td>
                    <td style="display: flex; gap: 5px; padding: 4px;">
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-cyan);" onclick="assignGlobalNutritionPlan(${plan.id})"><i class="fa-solid fa-share-nodes"></i> Asignar</button>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-green);" onclick="editNutritionPlan(${plan.id}, true)" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-red);" onclick="deleteNutritionPlan(${plan.id})"><i class="fa-solid fa-trash"></i></button>
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

function editNutritionPlan(id, isGlobal) {
    openNutritionModal(isGlobal, id);
}

function promptAssignNutritionToClient() {
    if (!activeUserId) {
        alert("Selecciona un cliente primero.");
        return;
    }
    const client = usersData.find(u => u.id === activeUserId);
    const clientName = client ? `${client.first_name} ${client.last_name}` : "Cliente";
    
    if (globalNutritionPlansCache.length === 0) {
        fetch('/api/nutrition_plans?user_id=0')
            .then(r => r.json())
            .then(data => {
                globalNutritionPlansCache = data;
                showAssignNutritionToClientModal(clientName);
            })
            .catch(err => {
                console.error(err);
                alert("Error al cargar las plantillas globales.");
            });
    } else {
        showAssignNutritionToClientModal(clientName);
    }
}

function showAssignNutritionToClientModal(clientName) {
    let optionsHtml = globalNutritionPlansCache.map(p => `<option value="${p.id}">${p.title} (${p.target_calories || 0} kcal)</option>`).join('');
    
    if (globalNutritionPlansCache.length === 0) {
        optionsHtml = `<option value="">(No hay plantillas globales creadas)</option>`;
    }
    
    const modalHtml = `
        <div id="assignNutritionToClientModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
            <div class="glass-card" style="width: 450px; max-width: 95%; padding: 25px;">
                <h3 style="color: var(--accent-green); margin-bottom: 15px;"><i class="fa-solid fa-apple-whole"></i> Asignar Plan a ${clientName}</h3>
                <p style="margin-bottom: 20px; color: var(--color-text-secondary); font-size: 14px;">Selecciona una plantilla global existente para asignársela a este cliente, o crea un plan personalizado desde cero.</p>
                
                <div class="form-group" style="margin-bottom: 20px;">
                    <label>Plantillas Disponibles</label>
                    <select id="assignNutritionTemplateSelect" class="form-input" style="width: 100%;" ${globalNutritionPlansCache.length === 0 ? 'disabled' : ''}>
                        ${optionsHtml}
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center;">
                    <button class="btn-secondary" onclick="document.getElementById('assignNutritionToClientModal').remove()">Cancelar</button>
                    <button class="btn-primary" style="background: var(--accent-purple); border-color: var(--accent-purple);" onclick="createNewCustomNutritionPlan()">Crear desde Cero</button>
                    <button class="btn-primary" onclick="confirmAssignNutritionToActiveClient()" ${globalNutritionPlansCache.length === 0 ? 'disabled' : ''}>Asignar Plantilla</button>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('assignNutritionToClientModal');
    if (existing) existing.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function createNewCustomNutritionPlan() {
    const modal = document.getElementById('assignNutritionToClientModal');
    if (modal) modal.remove();
    openNutritionModal(false);
}

async function confirmAssignNutritionToActiveClient() {
    const select = document.getElementById('assignNutritionTemplateSelect');
    const planId = select.value;
    if (!planId) return;
    
    try {
        const res = await fetch('/api/nutrition_plans/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId, user_id: activeUserId })
        });
        const data = await res.json();
        if (data.success) {
            alert("Plan de nutrición asignado correctamente al cliente.");
            const modal = document.getElementById('assignNutritionToClientModal');
            if (modal) modal.remove();
            selectClient(activeUserId);
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error(e);
        alert("Error al conectar con el servidor.");
    }
}

// ==========================================
// NEW: Assessment Config Management
// ==========================================

let globalAssessmentConfig = [];
let globalNutritionConfig = [];

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
            await fetchAssessmentConfig();
            if (activeUserId && selectedUserFullData) {
                selectClient(activeUserId);
            }
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
            await fetchAssessmentConfig();
            if (activeUserId && selectedUserFullData) {
                selectClient(activeUserId);
            }
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
        const res = await fetch(`/api/assessment_config?id=${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json();
        if (data.success) {
            await fetchAssessmentConfig();
            if (activeUserId && selectedUserFullData) {
                selectClient(activeUserId);
            }
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

// ==========================================
// NEW: Nutrition Config Management
// ==========================================

async function fetchNutritionConfig() {
    try {
        const res = await fetch('/api/nutrition_config');
        const data = await res.json();
        if (data.success) {
            globalNutritionConfig = data.config;
            renderNutritionConfigTable();
        }
    } catch (e) {
        console.error("Error fetching nutrition config:", e);
    }
}

function renderNutritionConfigTable() {
    const tbody = document.getElementById('nutritionConfigTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    globalNutritionConfig.forEach(conf => {
        const isDefaultBadge = conf.is_default ? '<span class="compliance-badge" style="background:#555; color:white;">Base</span>' : '<span class="compliance-badge">Custom</span>';
        
        // Icon for visibility
        const eyeIcon = conf.is_active ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
        const eyeColor = conf.is_active ? 'var(--accent-green)' : 'var(--color-text-secondary)';
        
        tbody.innerHTML += `
            <tr>
                <td style="text-align: left;">${conf.order_index}</td>
                <td style="font-weight: bold; color: var(--accent-green); text-align: left;">${conf.field_name} ${isDefaultBadge}</td>
                <td style="text-align: left;">${conf.field_type === 'number' ? 'Número' : 'Texto'}</td>
                <td style="text-align: left;">${conf.unit || '-'}</td>
                <td style="display: flex; gap: 5px; text-align: left;">
                    <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: ${eyeColor};" onclick="toggleNutritionConfigVisibility(${conf.id}, ${conf.is_active})" title="${conf.is_active ? 'Ocultar Campo' : 'Mostrar Campo'}">${eyeIcon}</button>
                    <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="openNutritionConfigModal(${conf.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    ${!conf.is_default ? `<button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteNutritionConfig(${conf.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `;
    });
}

async function toggleNutritionConfigVisibility(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    try {
        const res = await fetch('/api/nutrition_config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, is_active: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            await fetchNutritionConfig();
            if (activeUserId && selectedUserFullData) {
                selectClient(activeUserId);
            }
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

function openNutritionConfigModal(id = null) {
    const modal = document.getElementById('nutritionConfigModal');
    const form = modal.querySelector('form');
    form.reset();
    
    document.getElementById('editNutritionConfigId').value = '';
    document.getElementById('editNutritionConfigIsDefault').value = '0';
    document.getElementById('editNutritionConfigDbColumn').value = '';
    document.getElementById('nutritionConfigModalTitle').innerHTML = '<i class="fa-solid fa-plus"></i> Nuevo Campo';
    document.getElementById('nutConfigFieldName').disabled = false;
    document.getElementById('nutConfigFieldType').disabled = false;
    
    if (id) {
        const conf = globalNutritionConfig.find(c => c.id === id);
        if (conf) {
            document.getElementById('nutritionConfigModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Campo';
            document.getElementById('editNutritionConfigId').value = conf.id;
            document.getElementById('editNutritionConfigIsDefault').value = conf.is_default;
            document.getElementById('editNutritionConfigDbColumn').value = conf.db_column || '';
            
            document.getElementById('nutConfigFieldName').value = conf.field_name;
            document.getElementById('nutConfigFieldType').value = conf.field_type;
            document.getElementById('nutConfigFieldUnit').value = conf.unit || '';
            document.getElementById('nutConfigOrderIndex').value = conf.order_index;
            document.getElementById('nutConfigIsActive').checked = conf.is_active;
            
            if (conf.is_default) {
                document.getElementById('nutConfigFieldName').disabled = true;
                document.getElementById('nutConfigFieldType').disabled = true;
            }
        }
    }
    
    modal.style.display = 'flex';
}

function closeNutritionConfigModal() {
    document.getElementById('nutritionConfigModal').style.display = 'none';
}

async function submitNutritionConfig(e) {
    e.preventDefault();
    
    const id = document.getElementById('editNutritionConfigId').value;
    const payload = {
        field_name: document.getElementById('nutConfigFieldName').value,
        field_type: document.getElementById('nutConfigFieldType').value,
        unit: document.getElementById('nutConfigFieldUnit').value,
        order_index: parseInt(document.getElementById('nutConfigOrderIndex').value),
        is_active: document.getElementById('nutConfigIsActive').checked ? 1 : 0
    };
    
    const isDefault = document.getElementById('editNutritionConfigIsDefault').value === '1';
    
    if (!id) {
        payload.is_default = 0;
    } else {
        payload.id = parseInt(id);
        if (isDefault) {
            delete payload.field_name;
            delete payload.field_type;
        }
    }
    
    try {
        const url = '/api/nutrition_config';
        const method = id ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (data.success) {
            closeNutritionConfigModal();
            await fetchNutritionConfig();
            if (activeUserId && selectedUserFullData) {
                selectClient(activeUserId);
            }
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteNutritionConfig(id) {
    if (!confirm("¿Seguro que deseas eliminar permanentemente este campo? Las plantillas y dietas existentes perderán este dato.")) return;
    
    try {
        const res = await fetch(`/api/nutrition_config?id=${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json();
        if (data.success) {
            await fetchNutritionConfig();
            if (activeUserId && selectedUserFullData) {
                selectClient(activeUserId);
            }
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

async function fetchFoodLibrary() {
    try {
        const res = await fetch('/api/foods');
        const data = await res.json();
        if (data.success) {
            globalFoodLibrary = data.foods;
            
            // Build datalist dynamically
            let dl = document.getElementById('defaultFoodsList');
            if (!dl) {
                dl = document.createElement('datalist');
                dl.id = 'defaultFoodsList';
                document.body.appendChild(dl);
            }
            dl.innerHTML = '';
            globalFoodLibrary.forEach(food => {
                const opt = document.createElement('option');
                opt.value = food.name;
                dl.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error fetching food library:", e);
    }
}

async function fetchFoodLibraryAndRender() {
    await fetchFoodLibrary();
    renderFoodsTable();
}

function renderFoodsTable() {
    const headerRow = document.getElementById('globalFoodsHeader');
    const tbody = document.getElementById('globalFoodsList');
    if (!headerRow || !tbody) return;
    
    // Build Headers
    let headerHtml = `
        <th style="width: 50px; text-align: left;">ID</th>
        <th style="text-align: left;">Alimento</th>
    `;
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    activeFields.forEach(field => {
        const unitStr = field.unit ? ` (${field.unit})` : '';
        headerHtml += `<th style="text-align: left;">${field.field_name}${unitStr}</th>`;
    });
    
    headerHtml += `<th style="width: 120px; text-align: left;">Acciones</th>`;
    headerRow.innerHTML = headerHtml;
    
    // Build Body
    tbody.innerHTML = '';
    globalFoodLibrary.forEach(food => {
        let rowHtml = `
            <tr>
                <td style="padding: 4px;">${food.id}</td>
                <td style="font-weight: bold; color: var(--accent-green); padding: 4px;">${food.name}</td>
        `;
        
        activeFields.forEach(field => {
            let val = '-';
            if (field.is_default && field.db_column) {
                val = food[field.db_column] !== null && food[field.db_column] !== undefined ? food[field.db_column] : '-';
            } else {
                val = food.custom_data && food.custom_data[field.field_name] !== undefined ? food.custom_data[field.field_name] : '-';
            }
            rowHtml += `<td style="padding: 4px;">${val}</td>`;
        });
        
        rowHtml += `
                <td style="display: flex; gap: 5px; padding: 4px;">
                    <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-green);" onclick="editFood(${food.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-red);" onclick="deleteFood(${food.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
        tbody.innerHTML += rowHtml;
    });
}

function openFoodModal(id = null) {
    const modal = document.getElementById('foodModal');
    const form = modal.querySelector('form');
    form.reset();
    
    document.getElementById('editFoodId').value = '';
    document.getElementById('foodModalTitle').innerHTML = '<i class="fa-solid fa-apple-whole"></i> Nuevo Alimento';
    
    const grid = document.getElementById('foodNutritionFieldsGrid');
    grid.innerHTML = '';
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    activeFields.forEach(field => {
        const typeAttr = field.field_type === 'number' ? 'number' : 'text';
        const stepAttr = field.field_type === 'number' ? 'step="0.1"' : '';
        const unitLabel = field.unit ? ` (${field.unit})` : '';
        
        grid.innerHTML += `
            <div class="form-group">
                <label>${field.field_name}${unitLabel}</label>
                <input type="${typeAttr}" ${stepAttr} class="modal-food-field" data-id="${field.id}" data-name="${field.field_name}" data-db-col="${field.db_column || ''}" required placeholder="Ingrese valor">
            </div>
        `;
    });
    
    if (id) {
        const food = globalFoodLibrary.find(f => f.id === id);
        if (food) {
            document.getElementById('foodModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Alimento';
            document.getElementById('editFoodId').value = food.id;
            document.getElementById('foodName').value = food.name;
            
            activeFields.forEach(field => {
                const input = grid.querySelector(`.modal-food-field[data-id="${field.id}"]`);
                if (input) {
                    if (field.is_default && field.db_column) {
                        input.value = food[field.db_column] !== null && food[field.db_column] !== undefined ? food[field.db_column] : '';
                    } else if (food.custom_data && food.custom_data[field.field_name] !== undefined) {
                        input.value = food.custom_data[field.field_name];
                    }
                }
            });
        }
    }
    
    modal.style.display = 'flex';
}

function closeFoodModal() {
    document.getElementById('foodModal').style.display = 'none';
}

async function submitFoodForm(event) {
    event.preventDefault();
    
    const foodId = document.getElementById('editFoodId').value;
    const name = document.getElementById('foodName').value;
    
    const payload = {
        name: name,
        custom_data: {}
    };
    
    if (foodId) {
        payload.id = parseInt(foodId);
    }
    
    const inputs = document.querySelectorAll('.modal-food-field');
    inputs.forEach(input => {
        const dbCol = input.dataset.dbCol;
        const fieldName = input.dataset.name;
        const val = input.type === 'number' ? parseFloat(input.value) : input.value;
        
        if (dbCol) {
            payload[dbCol] = val;
        } else {
            payload.custom_data[fieldName] = val;
        }
    });
    
    const method = foodId ? 'PUT' : 'POST';
    
    try {
        const res = await fetch('/api/foods', {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeFoodModal();
            await fetchFoodLibraryAndRender();
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error("Error submitting food:", e);
    }
}

function editFood(id) {
    openFoodModal(id);
}

async function deleteFood(id) {
    if (!confirm("¿Seguro que deseas eliminar este alimento de la biblioteca?")) return;
    
    try {
        const res = await fetch(`/api/foods?id=${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json();
        if (data.success) {
            await fetchFoodLibraryAndRender();
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error("Error deleting food:", e);
    }
}

function scaleFoodFields(foodRow, food) {
    const weightInput = foodRow.querySelector('.food-field[data-id="1"]');
    if (!weightInput) return;
    const currentWeight = parseFloat(weightInput.value) || 0;
    if (currentWeight <= 0) return;
    
    const factor = currentWeight / food.weight_g;
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    activeFields.forEach(field => {
        if (field.id === 1) return; 
        
        const input = foodRow.querySelector(`.food-field[data-id="${field.id}"]`);
        if (!input) return;
        
        if (field.is_default && field.db_column) {
            let baseVal = 0;
            if (field.db_column === 'calories_kcal') baseVal = food.calories_kcal;
            else if (field.db_column === 'protein_g') baseVal = food.protein_g;
            else if (field.db_column === 'carbs_g') baseVal = food.carbs_g;
            else if (field.db_column === 'fat_g') baseVal = food.fat_g;
            
            input.value = Math.round((baseVal * factor) * 10) / 10;
        } else {
            if (food.custom_data && food.custom_data[field.field_name] !== undefined) {
                const baseVal = parseFloat(food.custom_data[field.field_name]) || 0;
                input.value = Math.round((baseVal * factor) * 10) / 10;
            }
        }
    });
}

// ==========================================
// MOBILE NATIVE EXPERIENCE HANDLERS
// ==========================================

function closeMobileSlidePanel() {
    const panel = document.getElementById("mainContentPanel");
    if (panel) {
        panel.classList.remove("mobile-open");
    }
}

function closeMobileSubPanel() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => btn.classList.remove("active"));
    
    const panels = document.querySelectorAll(".tab-panel");
    panels.forEach(p => p.classList.remove("active"));
}

function toggleAssessmentDetails(index) {
    const details = document.getElementById(`assessmentDetails-${index}`);
    const chevron = document.getElementById(`chevronIcon-${index}`);
    if (!details) return;
    
    if (details.style.display === "none") {
        details.style.display = "flex";
        if (chevron) chevron.style.transform = "rotate(180deg)";
    } else {
        details.style.display = "none";
        if (chevron) chevron.style.transform = "rotate(0deg)";
    }
}

function handleBottomNav(viewId) {
    // Hide mobile details panel if it was open
    closeMobileSlidePanel();
    
    // Call the original desktop view switcher
    if (typeof showGlobalView === 'function') {
        showGlobalView(viewId);
    }
    
    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(btn => btn.classList.remove('active'));
    let botNavId = '';
    if (viewId === 'clients') botNavId = 'botNavClients';
    else if (viewId === 'assessment') botNavId = 'botNavAssessment';
    else if (viewId === 'training') botNavId = 'botNavTraining';
    else if (viewId === 'nutrition') botNavId = 'botNavNutrition';
    
    if (botNavId) {
        const botBtn = document.getElementById(botNavId);
        if (botBtn) botBtn.classList.add('active');
    }
}

function handleFabClick() {
    const clientsView = document.getElementById("clientsView");
    const trainingLibView = document.getElementById("trainingLibView");
    const nutritionLibView = document.getElementById("nutritionLibView");
    const assessmentLibView = document.getElementById("assessmentLibView");

    if (clientsView && clientsView.style.display !== 'none' && clientsView.style.display !== '') {
        if (typeof openAddClientModal === 'function') openAddClientModal();
    } else if (trainingLibView && trainingLibView.style.display !== 'none') {
        if (typeof openExerciseModal === 'function') openExerciseModal();
    } else if (nutritionLibView && nutritionLibView.style.display !== 'none') {
        if (typeof openNutritionModal === 'function') openNutritionModal(true);
    } else if (assessmentLibView && assessmentLibView.style.display !== 'none') {
        if (typeof openAssessmentConfigModal === 'function') openAssessmentConfigModal();
    }
}

// ==========================================
// NEW: Settings & Client Management Logic
// ==========================================

let globalClientsForSettings = [];

async function renderSettingsClientsList() {
    try {
        const res = await fetch('/api/clients', {
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        const tbody = document.getElementById('settingsClientsTableBody');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        let clientsList = [];
        if (Array.isArray(data)) {
            clientsList = data;
        } else if (data && data.success && Array.isArray(data.clients)) {
            clientsList = data.clients;
        }
        
        globalClientsForSettings = clientsList;
        if (globalClientsForSettings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--color-text-secondary);padding:20px;">No hay clientes registrados.</td></tr>';
            return;
        }
        
        globalClientsForSettings.forEach(client => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${client.id}</td>
                <td><div style="font-weight: 500; color: #fff;">${client.first_name} ${client.last_name}</div></td>
                <td><div style="color: var(--accent-cyan); font-size: 13px;">@${client.nickname}</div><div style="color: var(--color-text-secondary); font-size: 12px;">${client.email}</div></td>
                <td>
                    <button class="btn-icon" onclick="openEditClientModal(${client.id})" title="Editar Perfil" style="color: var(--accent-cyan); margin-right: 8px;"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon" onclick="openResetClientPasswordModal(${client.id}, '${client.first_name} ${client.last_name}')" title="Resetear Contraseña" style="color: #f59e0b; margin-right: 8px;"><i class="fa-solid fa-key"></i></button>
                    <button class="btn-icon" onclick="deleteClientConfig(${client.id})" title="Eliminar Cliente" style="color: #ef4444;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error fetching clients for settings:', error);
    }
}

function openEditClientModal(clientId) {
    const client = globalClientsForSettings.find(c => c.id === clientId);
    if (!client) return;
    
    document.getElementById('editClientId').value = client.id;
    document.getElementById('editClientFirstName').value = client.first_name || '';
    document.getElementById('editClientLastName').value = client.last_name || '';
    document.getElementById('editClientEmail').value = client.email || '';
    document.getElementById('editClientNickname').value = client.nickname || '';
    document.getElementById('editClientHeight').value = client.height_cm || 170;
    document.getElementById('editClientPhone').value = client.phone || '';
    document.getElementById('editClientAllergies').value = client.allergies || '';
    document.getElementById('editClientMedications').value = client.medications || '';
    
    document.getElementById('editClientModal').style.display = 'flex';
}

function closeEditClientModal() {
    document.getElementById('editClientModal').style.display = 'none';
}

async function submitEditClient(e) {
    e.preventDefault();
    const clientId = document.getElementById('editClientId').value;
    
    const payload = {
        id: clientId,
        first_name: document.getElementById('editClientFirstName').value,
        last_name: document.getElementById('editClientLastName').value,
        email: document.getElementById('editClientEmail').value,
        nickname: document.getElementById('editClientNickname').value,
        height_cm: document.getElementById('editClientHeight').value,
        phone: document.getElementById('editClientPhone').value,
        allergies: document.getElementById('editClientAllergies').value,
        medications: document.getElementById('editClientMedications').value
    };
    
    try {
        const res = await fetch('/api/clients', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeEditClientModal();
            renderSettingsClientsList();
            if (typeof renderClientList === 'function') renderClientList();
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Error actualizando cliente.");
    }
}

function openResetClientPasswordModal(clientId, clientName) {
    document.getElementById('resetClientId').value = clientId;
    document.getElementById('resetClientName').textContent = clientName;
    document.getElementById('resetClientNewPassword').value = '';
    document.getElementById('resetClientPasswordModal').style.display = 'flex';
}

function closeResetClientPasswordModal() {
    document.getElementById('resetClientPasswordModal').style.display = 'none';
}

async function submitResetClientPassword(e) {
    e.preventDefault();
    const clientId = document.getElementById('resetClientId').value;
    const client = globalClientsForSettings.find(c => c.id == clientId);
    if (!client) return;
    
    const newPassword = document.getElementById('resetClientNewPassword').value;
    if (!newPassword) {
        alert("La contraseña no puede estar vacía.");
        return;
    }
    
    const payload = {
        id: client.id,
        first_name: client.first_name,
        last_name: client.last_name,
        email: client.email,
        password: newPassword
    };
    
    try {
        const res = await fetch('/api/clients', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert("Contraseña actualizada con éxito.");
            closeResetClientPasswordModal();
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Error cambiando contraseña.");
    }
}

async function deleteClientConfig(id) {
    if (!confirm('¿Estás SEGURO de eliminar este cliente de forma permanente? Se borrarán todos sus datos y progresos.')) return;
    try {
        const res = await fetch('/api/clients?id=' + id, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            renderSettingsClientsList();
            if (typeof renderClientList === 'function') renderClientList();
            if (typeof currentClientId !== 'undefined' && currentClientId == id) {
                currentClientId = null;
                const mainContent = document.getElementById("mainContent");
                if (mainContent) {
                    mainContent.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color: var(--color-text-secondary);">
                            <i class="fa-solid fa-user-check" style="font-size: 40px; margin-bottom: 20px; opacity:0.3;"></i>
                            <p>Selecciona un cliente de la lista para ver sus detalles</p>
                        </div>`;
                }
            }
        } else {
            alert('Error eliminando: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error in deleteClientConfig:', error);
    }
}

