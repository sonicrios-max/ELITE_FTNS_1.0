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
                // Dynamic accent color disabled — blue design system uses fixed cyan palette
                // if (config.theme_color) {
                //     document.documentElement.style.setProperty('--accent-gold', config.theme_color);
                //     document.documentElement.style.setProperty('--accent-cyan', config.theme_color);
                //     document.documentElement.style.setProperty('--accent-gold-glow', `${config.theme_color}40`);
                // }
                const logoText = document.getElementById('logoText');
                if (logoText) {
                    logoText.innerText = 'ELITE COACHING';
                }
                const nameBadge = document.getElementById('trainerNameBadge');
                if (nameBadge) {
                    nameBadge.innerHTML = `<i class="fa-solid fa-user-shield"></i> ${config.name.toUpperCase()}`;
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
    await fetchTrainerUnreadCounts();
    await loadClientsList();
    connectTrainerWebSocket();
    
    // Initialize muscle map listeners
    initInteractiveMuscleMaps();
    
    // Make chat drawer draggable
    const drawer = document.getElementById("expandedFloatingChatDrawer");
    const header = document.getElementById("expandedFloatingChatHeader");
    if (drawer && header) {
        makeElementDraggable(drawer, header);
    }
    
    // Restore active global view
    const savedView = localStorage.getItem('trainerActiveGlobalView') || 'clients';
    showGlobalView(savedView);
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
        
        // Restore active client if saved
        const savedClientId = localStorage.getItem('activeUserId');
        if (savedClientId) {
            const clientExists = usersData.some(c => c.id == savedClientId);
            if (clientExists) {
                selectClient(parseInt(savedClientId));
            }
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
        
        const isOnline = trainerOnlineClients.has(user.id);
        const unreadCount = trainerUnreadCounts[user.id] || 0;
        
        let onlineIndicator = isOnline 
            ? `<span class="online-indicator-dot" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e; margin-left:5px;" title="En línea"></span>`
            : '';
            
        let unreadBadge = unreadCount > 0
            ? `<span class="unread-count-badge" style="background:#ef4444; color:white; font-size:10px; font-weight:bold; border-radius:10px; padding:2px 6px; margin-left:auto; display:inline-block; line-height:1;">${unreadCount}</span>`
            : '';
        
        card.innerHTML = `
            <div class="client-info" style="display:flex; flex-direction:column; gap:2px; width:100%;">
                <div style="display:flex; align-items:center; width:100%;">
                    <h4 style="margin:0; display:flex; align-items:center;">${user.first_name} ${user.last_name} ${onlineIndicator}</h4>
                    ${unreadBadge}
                </div>
                <p style="margin:0;"><i class="fa-solid fa-envelope"></i> ${user.email}</p>
            </div>
            <span class="${badgeClass}" style="${customStyle}; margin-top:5px; align-self:flex-start;">${badgeText} (${Math.round((score / 10) * 30)}/30 d)</span>
        `;
        listContainer.appendChild(card);
    });
}

// Select a client and load detailed data
async function selectClient(userId, overrideSubTab = null) {
    const isRefreshing = (activeUserId === userId);
    activeUserId = userId;
    localStorage.setItem('activeUserId', userId);
    
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
        
        let activeSubTab = 'tabFicha';
        if (overrideSubTab) {
            activeSubTab = overrideSubTab;
            localStorage.setItem('trainerActiveSubTab', overrideSubTab);
        } else if (isRefreshing) {
            activeSubTab = localStorage.getItem('trainerActiveSubTab') || 'tabFicha';
        } else {
            localStorage.setItem('trainerActiveSubTab', 'tabFicha');
        }
        
        switchTab(activeSubTab);
        if (activeSubTab !== 'tabChat') {
            trainerActiveChatClientId = null;
        }
        
        const placeholder = document.getElementById("selectClientPlaceholder");
        if (placeholder) placeholder.style.display = "none";
        
        document.getElementById("profileHeaderCard").style.display = "block";
        document.getElementById("kpiContainer").style.display = "flex";
        document.getElementById("tabsCard").style.display = "block";
        
        // Mobile Slide-in Panel
        const mainPanel = document.getElementById("mainContentPanel");
        if (mainPanel) {
            mainPanel.classList.add("mobile-open");
            if (window.innerWidth <= 1024) {
                if (overrideSubTab) {
                    switchTab(overrideSubTab);
                } else {
                    closeMobileSubPanel(); // Cierra los tabs para mostrar el menú del perfil del cliente
                }
            } else {
                switchTab(activeSubTab);
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
    if (document.getElementById("clientEmail")) {
        document.getElementById("clientEmail").innerText = user.email;
    }
    if (document.getElementById("clientPhone")) {
        document.getElementById("clientPhone").innerText = user.phone || 'N/A';
    }
    if (document.getElementById("clientEmailPhone")) {
        document.getElementById("clientEmailPhone").innerText = `${user.email} | Tel: ${user.phone || 'N/A'}`;
    }
    
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
    localStorage.setItem('trainerActiveSubTab', tabId);
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => btn.classList.remove("active"));
    
    const panels = document.querySelectorAll(".tab-panel");
    panels.forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
    
    // Find active tab elements
    document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add("active");
    
    const panel = document.getElementById(tabId);
    if (panel) {
        panel.style.display = tabId === 'tabChat' ? 'flex' : 'block';
        panel.classList.add("active");
    }
    
    // Chat specific hook
    if (tabId === 'tabChat' && activeUserId) {
        const badge = document.getElementById("tabChatBadge");
        if (badge) badge.style.display = 'none';
        
        trainerActiveChatClientId = activeUserId;
        trainerChatHistoryOffset = 0;
        loadTrainerChatHistory(activeUserId, false);
        markTrainerChatAsRead(activeUserId);
        
        removeFloatingChatBubble(activeUserId);
        
        const clientName = document.getElementById("clientFullName") ? document.getElementById("clientFullName").innerText : "Cliente";
        document.getElementById("trainerChatClientName").innerText = clientName;
        
        const initials = clientName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById("trainerChatClientAvatar").innerText = initials;
        
        updateTrainerChatOnlineStatus(activeUserId);
    }
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
        fc_rep: fcRep,
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
            selectClient(activeUserId, activeTab);
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
            selectClient(activeUserId, activeTab);
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
            const form = document.getElementById("addClientForm");
            if (form) form.reset();
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
    localStorage.setItem('trainerActiveGlobalView', viewName);
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
        fetchGlobalRecipes();
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
let exercisesTableCollapsed = true;
let activeExerciseCategoryFilter = 'Todos';
let visibleExercisesCount = 30;

function toggleExercisesTable() {
    exercisesTableCollapsed = !exercisesTableCollapsed;
    const btn = document.getElementById('btnToggleExercisesTable');
    if (btn) {
        btn.innerHTML = exercisesTableCollapsed ? '<i class="fa-solid fa-chevron-down"></i> Mostrar Catálogo' : '<i class="fa-solid fa-chevron-up"></i> Ocultar Catálogo';
    }
    renderExercisesTable();
}

function selectExerciseCategoryFilter(category) {
    activeExerciseCategoryFilter = category;
    visibleExercisesCount = 30;
    
    const pills = document.querySelectorAll('.ex-filter-pill');
    pills.forEach(pill => {
        if (pill.dataset.category === category) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    
    if (category !== 'Todos') {
        exercisesTableCollapsed = false;
        const btn = document.getElementById('btnToggleExercisesTable');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Ocultar Catálogo';
        }
    }
    renderExercisesTable();
}

function renderExerciseCategoryFilters() {
    const container = document.getElementById('exerciseCategoryFilters');
    if (!container) return;
    
    const categories = [
        'Todos',
        'Abdominales',
        'Pecho',
        'Espalda',
        'Cuádriceps',
        'Isquiotibiales',
        'Glúteos',
        'Hombros',
        'Bíceps',
        'Tríceps',
        'Gemelos',
        'Antebrazos',
        'Trapecios',
        'Espalda Baja',
        'Espalda Media',
        'Abductores',
        'Aductores'
    ];
    
    container.innerHTML = categories.map(cat => {
        const isActive = cat === activeExerciseCategoryFilter;
        return `<span class="filter-pill ex-filter-pill ${isActive ? 'active' : ''}" data-category="${cat}" onclick="selectExerciseCategoryFilter('${cat}')">${cat}</span>`;
    }).join('');
}

function showMoreExercises() {
    visibleExercisesCount += 30;
    renderExercisesTable();
}

function showLessExercises() {
    visibleExercisesCount = 30;
    renderExercisesTable();
    const container = document.getElementById('globalExercisesTableContainer');
    if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function filterExercisesList() {
    const queryInput = document.getElementById('exerciseSearchInput');
    const levelSelect = document.getElementById('exerciseLevelFilter');
    const equipSelect = document.getElementById('exerciseEquipmentFilter');
    
    const query = queryInput ? queryInput.value.trim() : '';
    const level = levelSelect ? levelSelect.value.trim() : '';
    const equip = equipSelect ? equipSelect.value.trim() : '';

    if (query.length > 0 || level !== '' || equip !== '') {
        exercisesTableCollapsed = false;
        const btn = document.getElementById('btnToggleExercisesTable');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Ocultar Catálogo';
        }
    }
    visibleExercisesCount = 30;
    renderExercisesTable();
}

async function fetchGlobalExercises() {
    try {
        const res = await fetch('/api/exercises');
        globalExercisesCache = await res.json();
        renderExerciseCategoryFilters();
        renderExercisesTable();
    } catch (e) {
        console.error(e);
    }
}

function renderExercisesTable() {
    const tbody = document.getElementById('globalExercisesList');
    const container = document.getElementById('globalExercisesTableContainer');
    const placeholder = document.getElementById('globalExercisesTablePlaceholder');
    const moreContainer = document.getElementById('globalExercisesTableMoreContainer');
    if (!tbody) return;
    
    const searchInput = document.getElementById('exerciseSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const levelSelect = document.getElementById('exerciseLevelFilter');
    const selectedLevel = levelSelect ? levelSelect.value.trim().toLowerCase() : '';
    
    const equipSelect = document.getElementById('exerciseEquipmentFilter');
    const selectedEquip = equipSelect ? equipSelect.value.trim().toLowerCase() : '';
    
    const hasActiveFilters = query.length > 0 || activeExerciseCategoryFilter !== 'Todos' || selectedLevel !== '' || selectedEquip !== '';
    
    if (exercisesTableCollapsed && !hasActiveFilters) {
        if (container) container.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
        return;
    } else {
        if (container) container.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    }
    
    let filtered = globalExercisesCache.filter(ex => {
        const nameMatch = !query || 
            (ex.name && ex.name.toLowerCase().includes(query)) ||
            (ex.name_en && ex.name_en.toLowerCase().includes(query)) ||
            (ex.primary_muscle && ex.primary_muscle.toLowerCase().includes(query)) ||
            (ex.equipment && ex.equipment.toLowerCase().includes(query));
            
        const catMatch = activeExerciseCategoryFilter === 'Todos' || 
            (ex.primary_muscle && ex.primary_muscle.toLowerCase().includes(activeExerciseCategoryFilter.toLowerCase()));
            
        const levelMatch = !selectedLevel ||
            (ex.difficulty_level && ex.difficulty_level.toLowerCase() === selectedLevel) ||
            (ex.level && ex.level.toLowerCase() === selectedLevel);
            
        const equipMatch = !selectedEquip ||
            (ex.equipment && ex.equipment.toLowerCase().includes(selectedEquip));
            
        return nameMatch && catMatch && levelMatch && equipMatch;
    });
    
    const totalCount = filtered.length;
    const slice = filtered.slice(0, visibleExercisesCount);
    
    tbody.innerHTML = slice.map(ex => `
        <tr>
            <td>${ex.id}</td>
            <td style="font-weight: bold; color: var(--accent-cyan);">${ex.name}</td>
            <td style="color: var(--color-text-secondary);">${ex.name_en || '-'}</td>
            <td><span class="compliance-badge" style="background: rgba(14, 165, 233, 0.15); color: var(--accent-cyan);">${ex.primary_muscle}</span></td>
            <td>${ex.secondary_muscles || '-'}</td>
            <td>${ex.equipment || 'Peso corporal'}</td>
            <td>${ex.difficulty_level || ex.level || 'Intermedio'}</td>
            <td style="display: flex; gap: 5px;">
                <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-cyan);" onclick="editExercise(${ex.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-nav" style="padding: 4px 8px; font-size: 12px; color: var(--accent-red);" onclick="deleteExercise(${ex.id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
    
    if (moreContainer) {
        const btnMore = document.getElementById('btnShowMoreExercises');
        const btnLess = document.getElementById('btnShowLessExercises');
        
        if (totalCount > 0) {
            moreContainer.style.display = 'flex';
            if (visibleExercisesCount < totalCount) {
                if (btnMore) {
                    btnMore.style.display = 'inline-block';
                    btnMore.innerText = `Mostrar más ejercicios... (${visibleExercisesCount} de ${totalCount})`;
                }
            } else {
                if (btnMore) btnMore.style.display = 'none';
            }
            
            if (visibleExercisesCount > 30) {
                if (btnLess) btnLess.style.display = 'inline-block';
            } else {
                if (btnLess) btnLess.style.display = 'none';
            }
        } else {
            moreContainer.style.display = 'none';
        }
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

let unifiedBlockExercises = [];

function openBlockModal() { 
    document.getElementById('addBlockModal').style.display = 'flex'; 
    document.getElementById('newBlockName').value = '';
    unifiedBlockExercises = [];
    goToUnifiedStep1();
    populateUnifiedMuscleFilter();
    renderUnifiedCatalog();
}

function closeBlockModal() { 
    document.getElementById('addBlockModal').style.display = 'none'; 
}

function populateUnifiedMuscleFilter() {
    const sel = document.getElementById('unifiedCatalogMuscleFilter');
    if (!sel) return;
    const muscles = [...new Set(globalExercisesCache.map(ex => ex.primary_muscle).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todos</option>' + muscles.map(m => `<option value="${m}">${m}</option>`).join('');
}

function renderUnifiedCatalog() {
    const list = document.getElementById('unifiedCatalogList');
    if (!list) return;
    const search = document.getElementById('unifiedCatalogSearch')?.value.toLowerCase().trim() || '';
    const muscle = document.getElementById('unifiedCatalogMuscleFilter')?.value || '';
    
    let filtered = globalExercisesCache;
    if (search) {
        filtered = filtered.filter(ex => ex.name.toLowerCase().includes(search) || (ex.name_en && ex.name_en.toLowerCase().includes(search)));
    }
    if (muscle) {
        filtered = filtered.filter(ex => ex.primary_muscle === muscle);
    }
    
    list.innerHTML = filtered.slice(0, 45).map(ex => {
        const isAdded = unifiedBlockExercises.some(item => item.id === ex.id);
        return `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0;">
                <div style="min-width: 0; flex: 1;">
                    <strong style="font-size: 11px; color: white; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ex.name}</strong>
                    <span style="font-size: 9px; color: var(--color-text-secondary); display: block;">${ex.primary_muscle} | ${ex.equipment || 'Peso corporal'}</span>
                </div>
                <button type="button" class="btn-nav" style="padding: 4px 8px; font-size: 10px; flex-shrink: 0; min-width: 32px; ${isAdded ? 'background: rgba(16,185,129,0.15); color: #10b981; border-color: #10b981;' : 'color: var(--accent-cyan); border-color: var(--glass-border);'}" onclick="toggleUnifiedExercise(${ex.id})">
                    ${isAdded ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-plus"></i>'}
                </button>
            </div>
        `;
    }).join('');
}

function toggleUnifiedExercise(id) {
    const idx = unifiedBlockExercises.findIndex(item => item.id === id);
    if (idx >= 0) {
        unifiedBlockExercises.splice(idx, 1);
    } else {
        const ex = globalExercisesCache.find(e => e.id === id);
        if (ex) {
            unifiedBlockExercises.push({
                id: ex.id,
                name: ex.name,
                primary_muscle: ex.primary_muscle,
                equipment: ex.equipment,
                sets: 4,
                reps: '10-12',
                rpe: 8,
                rest_seconds: 90
            });
        }
    }
    renderUnifiedCatalog();
    renderUnifiedSelected();
}

function renderUnifiedSelected() {
    const list = document.getElementById('unifiedSelectedList');
    const badge = document.getElementById('unifiedSelectedCountBadge');
    const balance = document.getElementById('unifiedMuscleBalancePill');
    if (!list) return;
    
    badge.innerText = `${unifiedBlockExercises.length} Ejercicios`;
    
    if (unifiedBlockExercises.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 40px 10px; color: var(--color-text-secondary); font-size: 11px;">Pizarra vacía. Agrega ejercicios del catálogo de la izquierda.</div>`;
        balance.innerText = "Ningún ejercicio seleccionado aún.";
        return;
    }
    
    const muscleCount = {};
    let totalSets = 0;
    unifiedBlockExercises.forEach(item => {
        const m = item.primary_muscle || 'General';
        muscleCount[m] = (muscleCount[m] || 0) + item.sets;
        totalSets += item.sets;
    });
    
    const summary = Object.keys(muscleCount).map(m => {
        const pct = Math.round((muscleCount[m] / totalSets) * 100);
        return `<span style="color: var(--accent-cyan); font-weight: 600;">${m}</span>: ${pct}%`;
    }).join(' | ');
    
    balance.innerHTML = `<i class="fa-solid fa-chart-pie" style="color: var(--accent-cyan); margin-right: 5px;"></i> Distribución: ${summary}`;
    
    list.innerHTML = unifiedBlockExercises.map((item, idx) => `
        <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0;">
            <div style="min-width: 0; flex: 1;">
                <span style="font-size: 11px; font-weight: 600; color: white; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${idx + 1}. ${item.name}</span>
                <span style="font-size: 9px; color: var(--color-text-secondary); display: block;">${item.sets}x${item.reps} | RPE ${item.rpe} | ${item.rest_seconds}s</span>
            </div>
            <button type="button" class="btn-nav" style="padding: 4px 6px; color: var(--accent-red); border: none; background: transparent; cursor: pointer; flex-shrink: 0;" onclick="toggleUnifiedExercise(${item.id})">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');
}

function applyUnifiedPreset(type) {
    if (unifiedBlockExercises.length === 0) {
        alert("Agrega ejercicios a la pizarra primero.");
        return;
    }
    unifiedBlockExercises.forEach(item => {
        if (type === 'Hypertrophy') {
            item.sets = 4;
            item.reps = '10-12';
            item.rpe = 8;
            item.rest_seconds = 90;
        } else if (type === 'Strength') {
            item.sets = 5;
            item.reps = '5';
            item.rpe = 9;
            item.rest_seconds = 180;
        } else if (type === 'Endurance') {
            item.sets = 3;
            item.reps = '15-20';
            item.rpe = 7;
            item.rest_seconds = 45;
        }
    });
    renderUnifiedSelected();
}

function goToUnifiedStep1() {
    document.getElementById('unifiedBlockStep1').style.display = 'block';
    document.getElementById('unifiedBlockStep2').style.display = 'none';
    document.getElementById('unifiedBlockWizardProgress').innerText = "Paso 1 de 2: Selección y Pizarra";
    renderUnifiedCatalog();
    renderUnifiedSelected();
}

function goToUnifiedStep2() {
    const name = document.getElementById('newBlockName').value.trim();
    if (!name) {
        alert("Por favor ingresa un nombre para el bloque.");
        return;
    }
    if (unifiedBlockExercises.length === 0) {
        alert("Debes seleccionar al menos un ejercicio en la pizarra.");
        return;
    }
    document.getElementById('unifiedBlockStep1').style.display = 'none';
    document.getElementById('unifiedBlockStep2').style.display = 'block';
    document.getElementById('unifiedBlockWizardProgress').innerText = "Paso 2 de 2: Ajuste y Posición";
    renderUnifiedStep2List();
}

function renderUnifiedStep2List() {
    const list = document.getElementById('unifiedAjusteList');
    if (!list) return;
    
    list.innerHTML = unifiedBlockExercises.map((item, idx) => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 15px; display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap;">
            <!-- Left Side: Order & Exercise Info -->
            <div style="display: flex; align-items: center; gap: 15px; min-width: 220px; flex: 1;">
                <div style="display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; align-items: center;">
                    <button type="button" class="btn-nav" style="padding: 2px 6px; font-size: 11px;" onclick="moveUnifiedBlockItem(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity: 0.3;"' : ''}>▲</button>
                    <span style="font-size: 12px; font-weight: 700; color: var(--accent-cyan);">${idx + 1}</span>
                    <button type="button" class="btn-nav" style="padding: 2px 6px; font-size: 11px;" onclick="moveUnifiedBlockItem(${idx}, 1)" ${idx === unifiedBlockExercises.length - 1 ? 'disabled style="opacity: 0.3;"' : ''}>▼</button>
                </div>
                <div style="min-width: 0; word-break: break-word; flex: 1;">
                    <strong style="font-size: 13px; color: white; display: block; line-height: 1.2;">${item.name}</strong>
                    <span style="font-size: 10px; color: var(--color-text-secondary); display: block; margin-top: 3px;">${item.primary_muscle} | ${item.equipment || 'Peso corporal'}</span>
                </div>
            </div>

            <!-- Right Side: Param Adjustments -->
            <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap; justify-content: flex-end; flex: 1.5; min-width: 320px;">
                <!-- Series -->
                <div>
                    <span style="font-size: 10px; color: var(--color-text-muted); display: block; margin-bottom: 4px;"><i class="fa-solid fa-layer-group" style="color: var(--accent-cyan);"></i> Series</span>
                    <div style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 2px 6px;">
                        <button type="button" style="background: transparent; border: none; color: white; cursor: pointer; width: 22px; font-weight: bold;" onclick="adjustUnifiedParam(${idx}, 'sets', -1)">-</button>
                        <span style="font-size: 11px; font-weight: 700; color: var(--accent-cyan); min-width: 25px; text-align: center;">${item.sets}</span>
                        <button type="button" style="background: transparent; border: none; color: white; cursor: pointer; width: 22px; font-weight: bold;" onclick="adjustUnifiedParam(${idx}, 'sets', 1)">+</button>
                    </div>
                </div>

                <!-- Reps -->
                <div>
                    <span style="font-size: 10px; color: var(--color-text-muted); display: block; margin-bottom: 4px;"><i class="fa-solid fa-repeat"></i> Reps</span>
                    <div style="display: flex; gap: 4px;">
                        <button type="button" class="btn-nav ${item.reps === '5' ? 'active' : ''}" style="padding: 3px 6px; font-size: 9px;" onclick="setUnifiedReps(${idx}, '5')">5</button>
                        <button type="button" class="btn-nav ${item.reps === '10-12' ? 'active' : ''}" style="padding: 3px 6px; font-size: 9px;" onclick="setUnifiedReps(${idx}, '10-12')">10-12</button>
                        <button type="button" class="btn-nav ${item.reps === '12-15' ? 'active' : ''}" style="padding: 3px 6px; font-size: 9px;" onclick="setUnifiedReps(${idx}, '12-15')">12-15</button>
                        <button type="button" class="btn-nav ${item.reps === 'Al Fallo' ? 'active' : ''}" style="padding: 3px 6px; font-size: 9px; color: var(--accent-orange);" onclick="setUnifiedReps(${idx}, 'Al Fallo')">Fallo</button>
                    </div>
                </div>

                <!-- RPE -->
                <div>
                    <span style="font-size: 10px; color: var(--color-text-muted); display: block; margin-bottom: 4px;"><i class="fa-solid fa-fire" style="color: var(--accent-orange);"></i> RPE</span>
                    <div style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 2px 6px;">
                        <button type="button" style="background: transparent; border: none; color: white; cursor: pointer; width: 22px; font-weight: bold;" onclick="adjustUnifiedParam(${idx}, 'rpe', -1)">-</button>
                        <span style="font-size: 11px; font-weight: 700; color: var(--accent-orange); min-width: 25px; text-align: center;">${item.rpe}</span>
                        <button type="button" style="background: transparent; border: none; color: white; cursor: pointer; width: 22px; font-weight: bold;" onclick="adjustUnifiedParam(${idx}, 'rpe', 1)">+</button>
                    </div>
                </div>

                <!-- Rest -->
                <div>
                    <span style="font-size: 10px; color: var(--color-text-muted); display: block; margin-bottom: 4px;"><i class="fa-solid fa-stopwatch" style="color: #10b981;"></i> Descanso</span>
                    <div style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 2px 6px;">
                        <button type="button" style="background: transparent; border: none; color: white; cursor: pointer; width: 22px; font-weight: bold;" onclick="adjustUnifiedParam(${idx}, 'rest_seconds', -15)">-</button>
                        <span style="font-size: 11px; font-weight: 700; color: #10b981; min-width: 45px; text-align: center;">${item.rest_seconds}s</span>
                        <button type="button" style="background: transparent; border: none; color: white; cursor: pointer; width: 22px; font-weight: bold;" onclick="adjustUnifiedParam(${idx}, 'rest_seconds', 15)">+</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function moveUnifiedBlockItem(idx, direction) {
    const target = idx + direction;
    if (target < 0 || target >= unifiedBlockExercises.length) return;
    const temp = unifiedBlockExercises[idx];
    unifiedBlockExercises[idx] = unifiedBlockExercises[target];
    unifiedBlockExercises[target] = temp;
    renderUnifiedStep2List();
}

function adjustUnifiedParam(idx, param, delta) {
    if (param === 'sets') {
        unifiedBlockExercises[idx].sets = Math.max(1, unifiedBlockExercises[idx].sets + delta);
    } else if (param === 'rpe') {
        unifiedBlockExercises[idx].rpe = Math.min(10, Math.max(1, unifiedBlockExercises[idx].rpe + delta));
    } else if (param === 'rest_seconds') {
        unifiedBlockExercises[idx].rest_seconds = Math.max(0, unifiedBlockExercises[idx].rest_seconds + delta);
    }
    renderUnifiedStep2List();
}

function setUnifiedReps(idx, repsVal) {
    unifiedBlockExercises[idx].reps = repsVal;
    renderUnifiedStep2List();
}

async function saveUnifiedBlock() {
    const name = document.getElementById('newBlockName').value.trim();
    if (!name) {
        alert("Ingresa un nombre para el bloque.");
        return;
    }
    if (unifiedBlockExercises.length === 0) {
        alert("Selecciona al menos un ejercicio.");
        return;
    }
    
    const exercises = unifiedBlockExercises.map((item, exIdx) => ({
        exercise_id: item.id,
        sets_count: item.sets,
        reps_range: item.reps,
        rpe_target: item.rpe,
        rest_seconds: item.rest_seconds,
        order_index: exIdx + 1
    }));
    
    const payload = {
        name: name,
        description: `Bloque Muscular Unificado (${unifiedBlockExercises.length} ejercicios)`,
        exercises: exercises
    };
    
    if (editingBlockId) {
        payload.id = editingBlockId;
    }
    
    try {
        const url = '/api/workout_blocks';
        const method = editingBlockId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeBlockModal();
            fetchGlobalBlocks();
            alert(editingBlockId ? "¡Bloque muscular modificado exitosamente!" : "¡Bloque muscular guardado exitosamente!");
        } else {
            alert("Error: " + result.error);
        }
    } catch (e) {
        console.error(e);
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
    document.getElementById('dayDetailDate').innerText = log.date;
    
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
    if (selectedUserFullData && selectedUserFullData.workout_plan && completedExs.length > 0) {
        for (const day of selectedUserFullData.workout_plan.days) {
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
            if (selectedUserFullData && selectedUserFullData.workout_plan) {
                selectedUserFullData.workout_plan.days.forEach(day => {
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
    const meals = selectedUserFullData?.nutrition_plan?.meals || [];
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
            if (selectedUserFullData && selectedUserFullData.nutrition_plan && selectedUserFullData.nutrition_plan.meals) {
                selectedUserFullData.nutrition_plan.meals.forEach(meal => {
                    if (meal.items) {
                        const found = meal.items.find(food => food.id == foodId);
                        if (found) name = food.food_name;
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

    const content = document.getElementById('dayDetailContent');
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
    
    // Set dynamic footer actions
    const footer = document.getElementById('dayDetailFooter');
    if (footer) {
        footer.innerHTML = `
            <button type="button" class="btn-secondary" id="btnEditDayDetails" style="margin-right: auto;"><i class="fa-solid fa-pen-to-square"></i> Editar Registro</button>
            <button type="button" class="btn-primary" onclick="document.getElementById('dayDetailModal').style.display='none'">Cerrar</button>
        `;
        document.getElementById('btnEditDayDetails').onclick = () => editDayDetails(log);
    }
    
    document.getElementById('dayDetailModal').style.display = 'flex';
}

function editDayDetails(log) {
    const content = document.getElementById('dayDetailContent');
    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-weight-scale"></i> Peso (kg)</label>
                <input type="number" step="0.01" id="editWeight" class="form-input" style="width: 100%; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border); padding: 8px; border-radius: 6px;" value="${log.weight_kg !== null && log.weight_kg !== undefined ? log.weight_kg : ''}">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-person-running"></i> Pasos</label>
                <input type="number" id="editSteps" class="form-input" style="width: 100%; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border); padding: 8px; border-radius: 6px;" value="${log.steps_count !== null && log.steps_count !== undefined ? log.steps_count : ''}">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-bed"></i> Sueño (h)</label>
                <input type="number" step="0.1" id="editSleepHours" class="form-input" style="width: 100%; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border); padding: 8px; border-radius: 6px;" value="${log.sleep_hours !== null && log.sleep_hours !== undefined ? log.sleep_hours : ''}">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-star"></i> Calidad Sueño (1-10)</label>
                <input type="number" min="1" max="10" id="editSleepQuality" class="form-input" style="width: 100%; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border); padding: 8px; border-radius: 6px;" value="${log.sleep_quality !== null && log.sleep_quality !== undefined ? log.sleep_quality : ''}">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-droplet" style="color: #3b82f6;"></i> Agua (ml)</label>
                <input type="number" step="50" id="editWater" class="form-input" style="width: 100%; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border); padding: 8px; border-radius: 6px;" value="${log.water_intake_ml !== null && log.water_intake_ml !== undefined ? log.water_intake_ml : ''}">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-solid fa-apple-whole" style="color: #ef4444;"></i> Adherencia Dieta (1-10)</label>
                <input type="number" min="1" max="10" id="editDietAdherence" class="form-input" style="width: 100%; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border); padding: 8px; border-radius: 6px;" value="${log.diet_adherence !== null && log.diet_adherence !== undefined ? log.diet_adherence : ''}">
            </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%; margin-top: 8px;">
            <label style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;"><i class="fa-regular fa-comment"></i> Notas / Comentarios</label>
            <textarea id="editNotes" class="form-input" rows="3" style="width: 100%; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border); padding: 8px; border-radius: 6px; resize: none; font-family: inherit; font-size: 12px;">${log.notes || ''}</textarea>
        </div>
    `;
    
    const footer = document.getElementById('dayDetailFooter');
    if (footer) {
        footer.innerHTML = `
            <button type="button" class="btn-secondary" id="btnCancelEdit">Cancelar</button>
            <button type="button" class="btn-primary" id="btnSaveDayDetails">Guardar Cambios</button>
        `;
        document.getElementById('btnCancelEdit').onclick = () => showDayDetails(log);
        document.getElementById('btnSaveDayDetails').onclick = () => saveDayDetails(log);
    }
}

async function saveDayDetails(originalLog) {
    const weightVal = document.getElementById('editWeight').value;
    const stepsVal = document.getElementById('editSteps').value;
    const sleepHoursVal = document.getElementById('editSleepHours').value;
    const sleepQualityVal = document.getElementById('editSleepQuality').value;
    const waterVal = document.getElementById('editWater').value;
    const dietVal = document.getElementById('editDietAdherence').value;
    const notesVal = document.getElementById('editNotes').value;
    
    const payload = {
        user_id: activeUserId,
        date: originalLog.date,
        weight_kg: weightVal ? parseFloat(weightVal) : null,
        steps_count: stepsVal ? parseInt(stepsVal) : null,
        sleep_hours: sleepHoursVal ? parseFloat(sleepHoursVal) : null,
        sleep_quality: sleepQualityVal ? parseInt(sleepQualityVal) : null,
        water_intake_ml: waterVal ? parseInt(waterVal) : 0,
        diet_adherence: dietVal ? parseInt(dietVal) : null,
        notes: notesVal.trim() || null
    };
    
    try {
        const btnSave = document.getElementById('btnSaveDayDetails');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerText = "Guardando...";
        }
        
        const response = await fetch('/api/daily_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.success) {
            // Update local memory list / calendar map
            originalLog.weight_kg = payload.weight_kg;
            originalLog.steps_count = payload.steps_count;
            originalLog.sleep_hours = payload.sleep_hours;
            originalLog.sleep_quality = payload.sleep_quality;
            originalLog.water_intake_ml = payload.water_intake_ml;
            originalLog.diet_adherence = payload.diet_adherence;
            originalLog.notes = payload.notes;
            
            // Reload client data to refresh overall charts and lists immediately
            const currentSelectedClientId = activeUserId;
            await selectClient(currentSelectedClientId);
            
            // Re-render compliance details for the day
            showDayDetails(originalLog);
        } else {
            alert("Error al guardar cambios: " + (result.error || "Error desconocido"));
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerText = "Guardar Cambios";
            }
        }
    } catch (err) {
        console.error("Error saving day details:", err);
        alert("Error de conexión al guardar cambios.");
        const btnSave = document.getElementById('btnSaveDayDetails');
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerText = "Guardar Cambios";
        }
    }
}

// Hook calendar rendering into client selection
const originalSelectClient = selectClient;
selectClient = async function(userId, overrideSubTab = null) {
    await originalSelectClient(userId, overrideSubTab);
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
        <div id="assignRoutineModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 20000; display: flex; justify-content: center; align-items: center;">
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
                selectClient(activeUserId, activeTab);
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

// Block Edit & Integration with Unified Wizard

function editBlock(id) {
    const block = globalBlocksCache.find(b => b.id === id);
    if (!block) return;
    editingBlockId = id;
    
    document.getElementById('newBlockName').value = block.name;
    const formTitle = document.querySelector('#addBlockModal h3');
    if (formTitle) formTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Editar Bloque Muscular`;
    
    // Pre-populate unified draft exercises from block's current exercises
    unifiedBlockExercises = block.exercises.map(ex => {
        const fullEx = globalExercisesCache.find(e => e.id === ex.exercise_id) || {};
        return {
            id: ex.exercise_id,
            name: fullEx.name || ex.exercise_name || `Ejercicio #${ex.exercise_id}`,
            primary_muscle: fullEx.primary_muscle || 'General',
            equipment: fullEx.equipment || 'Peso corporal',
            sets: ex.sets_count,
            reps: ex.reps_range,
            rpe: ex.rpe_target || 8,
            rest_seconds: ex.rest_seconds || 90
        };
    });
    
    document.getElementById('addBlockModal').style.display = 'flex'; 
    goToUnifiedStep1();
    populateUnifiedMuscleFilter();
    renderUnifiedCatalog();
}

// Override closeBlockModal to reset edit ID and titles
const originalCloseBlockModal = closeBlockModal;
closeBlockModal = function() {
    editingBlockId = null;
    const formTitle = document.querySelector('#addBlockModal h3');
    if (formTitle) formTitle.innerHTML = `<i class="fa-solid fa-layer-group"></i> Creador de Bloques Musculares`;
    originalCloseBlockModal();
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
    updatePlanCalculatedTotals();
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
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    let fieldsHeaderHtml = "";
    activeFields.forEach(field => {
        const unitLabel = field.unit ? ` (${field.unit})` : "";
        const displayName = `${field.field_name}${unitLabel}`;
        fieldsHeaderHtml += `<div style="flex: 1; min-width: 60px; font-size: 10px; font-weight: 700; color: var(--color-text-secondary); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${displayName}">${displayName}</div>`;
    });
    const headerRowHtml = `
        <div class="food-header-row" style="display: flex; gap: 5px; margin-bottom: 5px; padding-right: 28px; opacity: 0.8;">
            <div style="flex: 2; min-width: 120px; font-size: 10px; font-weight: 700; color: var(--color-text-secondary); text-align: left;">Alimento</div>
            ${fieldsHeaderHtml}
        </div>
    `;
    
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <label style="font-size: 12px; color: var(--accent-green); font-weight: 700;">Alimentos / Ingredientes</label>
                <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn-nav" onclick="addFoodItemToMeal(${mId})" style="font-size: 11px;"><i class="fa-solid fa-plus"></i> Ingrediente</button>
                    <button type="button" class="btn-nav" onclick="openAddRecipeToMealModal(${mId})" style="font-size: 11px; color: var(--accent-purple);"><i class="fa-solid fa-layer-group"></i> Receta</button>
                </div>
            </div>
            ${headerRowHtml}
            <div id="mealFoods_${mId}">
                <!-- Alimentos -->
            </div>
        </div>
    `;
    
    container.appendChild(mealCard);
    if (prefillItems && prefillItems.length > 0) {
        const recipeGroups = {};
        prefillItems.forEach(item => {
            if (item.recipe_id) {
                const groupKey = `${item.recipe_id}_${item.recipe_name}`;
                let subContainer = recipeGroups[groupKey];
                if (!subContainer) {
                    const recipeGroupContainer = document.createElement("div");
                    recipeGroupContainer.className = "recipe-group-container";
                    recipeGroupContainer.dataset.recipeId = item.recipe_id;
                    recipeGroupContainer.dataset.recipeName = item.recipe_name;
                    
                    let multiplier = 1.0;
                    if (globalRecipesCache && globalRecipesCache.length > 0) {
                        const rec = globalRecipesCache.find(r => r.id === item.recipe_id);
                        if (rec && rec.ingredients && rec.ingredients.length > 0) {
                            const baseIng = rec.ingredients.find(i => i.food_name.toLowerCase() === item.food_name.toLowerCase());
                            if (baseIng && baseIng.weight_g > 0) {
                                multiplier = item.weight_g / baseIng.weight_g;
                            }
                        }
                    }
                    multiplier = Math.round(multiplier * 10) / 10;
                    
                    recipeGroupContainer.innerHTML = `
                        <div class="recipe-group-header">
                            <div class="recipe-group-title">
                                <i class="fa-solid fa-layer-group"></i> ${item.recipe_name}
                            </div>
                            <div class="recipe-group-multiplier">
                                <span>Porción:</span>
                                <input type="number" step="0.1" value="${multiplier}" min="0.1" oninput="scaleRecipeGroup(this.parentElement.parentElement.parentElement)">
                            </div>
                            <button type="button" class="btn-nav" style="color: var(--accent-red); padding: 2px 5px;" onclick="this.parentElement.parentElement.remove(); updatePlanCalculatedTotals();"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <div class="recipe-ingredients-sub-container"></div>
                    `;
                    document.getElementById(`mealFoods_${mId}`).appendChild(recipeGroupContainer);
                    subContainer = recipeGroupContainer.querySelector('.recipe-ingredients-sub-container');
                    recipeGroups[groupKey] = subContainer;
                }
                addFoodItemToMeal(mId, item, subContainer);
            } else {
                addFoodItemToMeal(mId, item);
            }
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

function updateFieldsReadOnlyStatus(foodRow) {
    const hasSelectedFood = !!foodRow.dataset.selectedFood;
    const fields = foodRow.querySelectorAll('.food-field');
    fields.forEach(input => {
        const fId = parseInt(input.dataset.id);
        if (fId === 1) return; // weight is always editable
        if (hasSelectedFood) {
            input.setAttribute('readonly', 'true');
            input.style.background = 'rgba(255, 255, 255, 0.03)';
            input.style.color = 'var(--color-text-muted)';
            input.style.cursor = 'not-allowed';
        } else {
            input.removeAttribute('readonly');
            input.style.background = '';
            input.style.color = '';
            input.style.cursor = '';
        }
    });
}

function addFoodItemToMeal(mId, prefillItem = null, groupContainer = null) {
    const container = groupContainer || document.getElementById(`mealFoods_${mId}`);
    if (!container) return;
    const foodRow = document.createElement("div");
    foodRow.style.display = "flex";
    foodRow.style.gap = "5px";
    foodRow.style.marginBottom = "5px";
    foodRow.className = "food-item-row" + (groupContainer ? " recipe-ingredient-row" : "");
    
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
    
    html += `<button type="button" class="btn-nav" onclick="this.parentElement.remove(); updatePlanCalculatedTotals();"><i class="fa-solid fa-xmark"></i></button>`;
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
        updateFieldsReadOnlyStatus(foodRow);
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
        } else {
            delete foodRow.dataset.selectedFood;
        }
        updateFieldsReadOnlyStatus(foodRow);
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
    
    updateFieldsReadOnlyStatus(foodRow);
    foodRow.querySelectorAll('.food-field').forEach(input => {
        input.addEventListener('input', updatePlanCalculatedTotals);
    });
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
            const recipeContainer = row.closest('.recipe-group-container');
            const recipeId = recipeContainer ? parseInt(recipeContainer.dataset.recipeId) : null;
            const recipeName = recipeContainer ? recipeContainer.dataset.recipeName : null;
            
            const item = {
                food_name: row.querySelector(".food-name").value,
                weight_g: 0,
                calories_kcal: 0,
                protein_g: 0,
                carbs_g: 0,
                fat_g: 0,
                custom_data: {},
                recipe_id: recipeId,
                recipe_name: recipeName
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
                selectClient(activeUserId, activeTab); // Recargar perfil
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
                selectClient(activeUserId, activeTab);
            }
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
    }
}

let globalRecipesCache = [];

async function fetchGlobalRecipes() {
    try {
        const res = await fetch('/api/recipes');
        globalRecipesCache = await res.json();
        renderRecipesList();
    } catch (e) {
        console.error("Error fetching recipes:", e);
    }
}

function renderRecipesList() {
    const container = document.getElementById('globalRecipesList');
    if (!container) return;
    container.innerHTML = '';
    
    if (globalRecipesCache.length === 0) {
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--color-text-secondary); font-size: 11px;">
                No hay recetas creadas. Haz clic en "Nueva Receta" para crear la primera.
            </div>`;
        return;
    }
    
    globalRecipesCache.forEach(r => {
        const ingBadges = r.ingredients.map(ing => 
            `<span class="compliance-badge" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-purple); border: 1px solid rgba(139, 92, 246, 0.3); font-size: 10px; margin-right: 4px; margin-bottom: 4px; display: inline-block;">${ing.food_name} (${ing.weight_g}g)</span>`
        ).join('');
        
        let totalCal = 0, totalPro = 0, totalCarb = 0, totalFat = 0;
        r.ingredients.forEach(ing => {
            totalCal += ing.calories_kcal || 0;
            totalPro += ing.protein_g || 0;
            totalCarb += ing.carbs_g || 0;
            totalFat += ing.fat_g || 0;
        });
        
        container.innerHTML += `
            <div class="workout-day-card" style="margin-bottom: 12px; padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.03);">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                    <h4 style="color: var(--accent-purple); margin: 0; font-size: 13px;"><i class="fa-solid fa-layer-group"></i> ${r.name}</h4>
                    <div>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-purple);" onclick="editRecipe(${r.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-red);" onclick="deleteRecipe(${r.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <p style="color: var(--color-text-secondary); font-size: 11px; margin-bottom: 8px;">${r.description || ''}</p>
                <div style="font-size: 11px; color: var(--accent-cyan); font-weight: bold; margin-bottom: 8px;">
                    Valores: ${totalCal.toFixed(0)} kcal | P: ${totalPro.toFixed(1)}g | C: ${totalCarb.toFixed(1)}g | G: ${totalFat.toFixed(1)}g (por porción)
                </div>
                <div style="display: flex; flex-wrap: wrap;">${ingBadges}</div>
            </div>
        `;
    });
}

function openRecipeModal(editId = null) {
    const modal = document.getElementById('addRecipeModal');
    if (!modal) return;
    
    document.getElementById('editRecipeId').value = '';
    document.getElementById('recipeName').value = '';
    document.getElementById('recipeDescription').value = '';
    document.getElementById('recipeIngredientsContainer').innerHTML = '';
    
    document.getElementById('recipeModalTitle').innerHTML = '<i class="fa-solid fa-layer-group"></i> Nueva Receta de Cocina';
    
    if (editId) {
        const recipe = globalRecipesCache.find(r => r.id === editId);
        if (recipe) {
            document.getElementById('recipeModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Receta de Cocina';
            document.getElementById('editRecipeId').value = recipe.id;
            document.getElementById('recipeName').value = recipe.name;
            document.getElementById('recipeDescription').value = recipe.description || '';
            
            recipe.ingredients.forEach(ing => {
                addIngredientToRecipeBuilder(ing);
            });
        }
    } else {
        addIngredientToRecipeBuilder();
    }
    
    updateRecipeBuilderTotals();
    modal.style.display = 'flex';
}

function closeRecipeModal() {
    const modal = document.getElementById('addRecipeModal');
    if (modal) modal.style.display = 'none';
}

function addIngredientToRecipeBuilder(prefill = null) {
    const container = document.getElementById('recipeIngredientsContainer');
    if (!container) return;
    
    const row = document.createElement('div');
    row.className = 'food-item-row';
    row.style.display = 'flex';
    row.style.gap = '5px';
    row.style.marginBottom = '5px';
    
    row.innerHTML = `
        <div class="food-autocomplete-wrapper" style="position: relative; flex: 2; min-width: 120px; display: flex; flex-direction: column;">
            <input type="text" class="ingredient-name" placeholder="Ingrediente" value="${prefill ? prefill.food_name : ''}" required style="width: 100%; font-size: 11px; margin: 0; box-sizing: border-box;" autocomplete="off">
            <div class="food-suggestions-dropdown" style="display: none; position: absolute; top: 100%; left: 0; width: 100%; max-height: 150px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 8px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></div>
        </div>
        <input type="number" class="ing-weight food-field" data-id="1" placeholder="g" value="${prefill ? prefill.weight_g : ''}" required style="flex: 1; font-size: 11px; min-width: 50px;">
        <input type="number" step="0.1" class="ing-calories food-field" data-id="2" placeholder="kcal" value="${prefill ? prefill.calories_kcal : ''}" required readonly style="flex: 1; font-size: 11px; min-width: 50px; background: rgba(255, 255, 255, 0.03); color: var(--color-text-muted); cursor: not-allowed;">
        <input type="number" step="0.1" class="ing-protein food-field" data-id="3" placeholder="P(g)" value="${prefill ? prefill.protein_g : ''}" required readonly style="flex: 1; font-size: 11px; min-width: 50px; background: rgba(255, 255, 255, 0.03); color: var(--color-text-muted); cursor: not-allowed;">
        <input type="number" step="0.1" class="ing-carbs food-field" data-id="4" placeholder="C(g)" value="${prefill ? prefill.carbs_g : ''}" required readonly style="flex: 1; font-size: 11px; min-width: 50px; background: rgba(255, 255, 255, 0.03); color: var(--color-text-muted); cursor: not-allowed;">
        <input type="number" step="0.1" class="ing-fat food-field" data-id="5" placeholder="G(g)" value="${prefill ? prefill.fat_g : ''}" required readonly style="flex: 1; font-size: 11px; min-width: 50px; background: rgba(255, 255, 255, 0.03); color: var(--color-text-muted); cursor: not-allowed;">
        <button type="button" class="btn-nav" onclick="this.parentElement.remove(); updateRecipeBuilderTotals();"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    // Bind Autocomplete
    const nameInput = row.querySelector('.ingredient-name');
    const dropdown = row.querySelector('.food-suggestions-dropdown');
    const weightInput = row.querySelector('.ing-weight');
    
    const showSuggestions = (query = '') => {
        const filtered = globalFoodLibrary.filter(food => 
            food.name.toLowerCase().includes(query.toLowerCase())
        );
        dropdown.innerHTML = '';
        if (filtered.length === 0) {
            dropdown.style.display = 'none';
            return;
        }
        filtered.forEach((food) => {
            const item = document.createElement('div');
            item.className = 'food-suggestion-item';
            item.style.padding = '6px 8px';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
            item.style.fontSize = '11px';
            item.style.color = 'var(--color-text-primary)';
            item.innerText = food.name;
            
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectIngredient(food);
            });
            dropdown.appendChild(item);
        });
        dropdown.style.display = 'block';
    };
    
    const selectIngredient = (food) => {
        nameInput.value = food.name;
        row.dataset.selectedFood = food.name;
        if (!weightInput.value) {
            weightInput.value = food.weight_g;
        }
        scaleIngredientFields(row, food);
        dropdown.style.display = 'none';
        updateRecipeBuilderTotals();
    };
    
    nameInput.addEventListener('input', (e) => {
        const val = e.target.value;
        showSuggestions(val);
        const matched = globalFoodLibrary.find(f => f.name.toLowerCase() === val.trim().toLowerCase());
        if (matched) {
            row.dataset.selectedFood = matched.name;
            if (!weightInput.value) weightInput.value = matched.weight_g;
            scaleIngredientFields(row, matched);
        } else {
            delete row.dataset.selectedFood;
        }
        updateRecipeBuilderTotals();
    });
    
    nameInput.addEventListener('focus', () => showSuggestions(nameInput.value));
    nameInput.addEventListener('blur', () => {
        setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
    
    weightInput.addEventListener('input', () => {
        const foodName = row.dataset.selectedFood;
        if (foodName) {
            const food = globalFoodLibrary.find(f => f.name === foodName);
            if (food) scaleIngredientFields(row, food);
        }
        updateRecipeBuilderTotals();
    });
    
    if (prefill) {
        const matched = globalFoodLibrary.find(f => f.name.toLowerCase() === prefill.food_name.toLowerCase());
        if (matched) {
            row.dataset.selectedFood = matched.name;
        }
    }
    
    container.appendChild(row);
}

function scaleIngredientFields(row, food) {
    const weightInput = row.querySelector('.ing-weight');
    const currentWeight = parseFloat(weightInput.value) || 0;
    if (currentWeight <= 0) return;
    
    const factor = currentWeight / food.weight_g;
    
    const calInput = row.querySelector('.ing-calories');
    const proInput = row.querySelector('.ing-protein');
    const carbInput = row.querySelector('.ing-carbs');
    const fatInput = row.querySelector('.ing-fat');
    
    if (calInput) calInput.value = Math.round((food.calories_kcal * factor) * 10) / 10;
    if (proInput) proInput.value = Math.round((food.protein_g * factor) * 10) / 10;
    if (carbInput) carbInput.value = Math.round((food.carbs_g * factor) * 10) / 10;
    if (fatInput) fatInput.value = Math.round((food.fat_g * factor) * 10) / 10;
}

function updateRecipeBuilderTotals() {
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    const rows = document.querySelectorAll('#recipeIngredientsContainer .food-item-row');
    
    rows.forEach(row => {
        const calInput = row.querySelector('.ing-calories');
        const proInput = row.querySelector('.ing-protein');
        const carbInput = row.querySelector('.ing-carbs');
        const fatInput = row.querySelector('.ing-fat');
        
        calories += parseFloat(calInput ? calInput.value : 0) || 0;
        protein += parseFloat(proInput ? proInput.value : 0) || 0;
        carbs += parseFloat(carbInput ? carbInput.value : 0) || 0;
        fat += parseFloat(fatInput ? fatInput.value : 0) || 0;
    });
    
    document.getElementById('recipeTotalCalories').innerText = calories.toFixed(0);
    document.getElementById('recipeTotalProtein').innerText = protein.toFixed(1);
    document.getElementById('recipeTotalCarbs').innerText = carbs.toFixed(1);
    document.getElementById('recipeTotalFat').innerText = fat.toFixed(1);
}

async function submitRecipeForm(event) {
    event.preventDefault();
    
    const recipeId = document.getElementById('editRecipeId').value;
    const name = document.getElementById('recipeName').value;
    const description = document.getElementById('recipeDescription').value;
    
    const ingredients = [];
    const rows = document.querySelectorAll('#recipeIngredientsContainer .food-item-row');
    rows.forEach(row => {
        const foodName = row.querySelector('.ingredient-name').value;
        const weight = parseFloat(row.querySelector('.ing-weight').value) || 0;
        const cal = parseFloat(row.querySelector('.ing-calories').value) || 0;
        const pro = parseFloat(row.querySelector('.ing-protein').value) || 0;
        const carb = parseFloat(row.querySelector('.ing-carbs').value) || 0;
        const fat = parseFloat(row.querySelector('.ing-fat').value) || 0;
        
        if (foodName && weight > 0) {
            ingredients.push({
                food_name: foodName,
                weight_g: weight,
                calories_kcal: cal,
                protein_g: pro,
                carbs_g: carb,
                fat_g: fat,
                custom_data: {}
            });
        }
    });
    
    const payload = {
        name,
        description,
        ingredients
    };
    
    if (recipeId) payload.id = parseInt(recipeId);
    
    const method = recipeId ? 'PUT' : 'POST';
    try {
        const res = await fetch('/api/recipes', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeRecipeModal();
            fetchGlobalRecipes();
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error("Error submitting recipe:", e);
    }
}

function editRecipe(id) {
    openRecipeModal(id);
}

async function deleteRecipe(id) {
    if (!confirm("¿Estás seguro de eliminar esta receta?")) return;
    try {
        const res = await fetch('/api/recipes', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            fetchGlobalRecipes();
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error(e);
    }
}

let activeMealCardIdForRecipe = null;
function openAddRecipeToMealModal(mId) {
    activeMealCardIdForRecipe = mId;
    const select = document.getElementById('recipeToMealSelect');
    if (!select) return;
    
    select.innerHTML = '';
    if (globalRecipesCache.length === 0) {
        select.innerHTML = '<option value="">(No hay recetas guardadas)</option>';
    } else {
        globalRecipesCache.forEach(r => {
            select.innerHTML += `<option value="${r.id}">${r.name}</option>`;
        });
    }
    
    document.getElementById('recipeToMealMultiplier').value = '1.0';
    document.getElementById('addRecipeToMealModal').style.display = 'flex';
}

function closeAddRecipeToMealModal() {
    document.getElementById('addRecipeToMealModal').style.display = 'none';
}

function confirmAddRecipeToMeal() {
    const select = document.getElementById('recipeToMealSelect');
    const recipeId = parseInt(select.value);
    const multiplier = parseFloat(document.getElementById('recipeToMealMultiplier').value) || 1.0;
    
    if (!recipeId) {
        closeAddRecipeToMealModal();
        return;
    }
    
    const recipe = globalRecipesCache.find(r => r.id === recipeId);
    if (!recipe) {
        closeAddRecipeToMealModal();
        return;
    }
    
    const mealFoodsContainer = document.getElementById(`mealFoods_${activeMealCardIdForRecipe}`);
    if (!mealFoodsContainer) return;
    
    const groupDiv = document.createElement('div');
    groupDiv.className = 'recipe-group-container';
    groupDiv.dataset.recipeId = recipe.id;
    groupDiv.dataset.recipeName = recipe.name;
    
    groupDiv.innerHTML = `
        <div class="recipe-group-header">
            <div class="recipe-group-title">
                <i class="fa-solid fa-layer-group"></i> ${recipe.name}
            </div>
            <div class="recipe-group-multiplier">
                <span>Porción:</span>
                <input type="number" step="0.1" value="${multiplier}" min="0.1" oninput="scaleRecipeGroup(this.parentElement.parentElement.parentElement)">
            </div>
            <button type="button" class="btn-nav" style="color: var(--accent-red); padding: 2px 5px;" onclick="this.parentElement.parentElement.remove(); updatePlanCalculatedTotals();"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="recipe-ingredients-sub-container"></div>
    `;
    
    mealFoodsContainer.appendChild(groupDiv);
    const subContainer = groupDiv.querySelector('.recipe-ingredients-sub-container');
    
    recipe.ingredients.forEach(ing => {
        const item = {
            food_name: ing.food_name,
            weight_g: Math.round((ing.weight_g * multiplier) * 10) / 10,
            calories_kcal: Math.round(ing.calories_kcal * multiplier),
            protein_g: Math.round((ing.protein_g * multiplier) * 10) / 10,
            carbs_g: Math.round((ing.carbs_g * multiplier) * 10) / 10,
            fat_g: Math.round((ing.fat_g * multiplier) * 10) / 10,
            custom_data: JSON.parse(JSON.stringify(ing.custom_data || {})),
            recipe_id: recipe.id,
            recipe_name: recipe.name
        };
        addFoodItemToMeal(activeMealCardIdForRecipe, item, subContainer);
    });
    
    closeAddRecipeToMealModal();
    updatePlanCalculatedTotals();
}

function scaleRecipeGroup(groupContainer) {
    const multInput = groupContainer.querySelector('.recipe-group-multiplier input');
    const multiplier = parseFloat(multInput.value) || 0;
    if (multiplier <= 0) return;
    
    const recipeId = parseInt(groupContainer.dataset.recipeId);
    const recipe = globalRecipesCache.find(r => r.id === recipeId);
    if (!recipe) return;
    
    const rows = groupContainer.querySelectorAll('.food-item-row');
    rows.forEach(row => {
        const foodName = row.querySelector('.food-name').value;
        const baseIng = recipe.ingredients.find(i => i.food_name.toLowerCase() === foodName.toLowerCase());
        if (!baseIng) return;
        
        const weightInput = row.querySelector('.food-field[data-id="1"]');
        if (weightInput) {
            weightInput.value = Math.round((baseIng.weight_g * multiplier) * 10) / 10;
        }
        
        const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
        activeFields.forEach(field => {
            if (field.id === 1) return;
            const input = row.querySelector(`.food-field[data-id="${field.id}"]`);
            if (!input) return;
            
            if (field.is_default && field.db_column) {
                let baseVal = 0;
                if (field.db_column === 'calories_kcal') baseVal = baseIng.calories_kcal;
                else if (field.db_column === 'protein_g') baseVal = baseIng.protein_g;
                else if (field.db_column === 'carbs_g') baseVal = baseIng.carbs_g;
                else if (field.db_column === 'fat_g') baseVal = baseIng.fat_g;
                input.value = Math.round((baseVal * multiplier) * 10) / 10;
            } else {
                if (baseIng.custom_data && baseIng.custom_data[field.field_name] !== undefined) {
                    const baseVal = parseFloat(baseIng.custom_data[field.field_name]) || 0;
                    input.value = Math.round((baseVal * multiplier) * 10) / 10;
                }
            }
        });
    });
    
    updatePlanCalculatedTotals();
}

function updatePlanCalculatedTotals() {
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    const totals = {};
    
    activeFields.forEach(field => {
        totals[field.field_name] = 0;
    });
    
    const rows = document.querySelectorAll('#mealsContainer .food-item-row');
    rows.forEach(row => {
        activeFields.forEach(field => {
            const input = row.querySelector(`.food-field[data-id="${field.id}"]`);
            if (input) {
                const val = parseFloat(input.value) || 0;
                totals[field.field_name] += val;
            }
        });
    });
    
    const parts = [];
    const hasCal = activeFields.some(f => f.db_column === 'calories_kcal');
    const hasPro = activeFields.some(f => f.db_column === 'protein_g');
    const hasCarb = activeFields.some(f => f.db_column === 'carbs_g');
    const hasFat = activeFields.some(f => f.db_column === 'fat_g');
    
    const calField = activeFields.find(f => f.db_column === 'calories_kcal');
    const proField = activeFields.find(f => f.db_column === 'protein_g');
    const carbField = activeFields.find(f => f.db_column === 'carbs_g');
    const fatField = activeFields.find(f => f.db_column === 'fat_g');
    
    if (hasCal && calField) parts.push(`${totals[calField.field_name].toFixed(0)} Kcal`);
    if (hasPro && proField) parts.push(`P: ${totals[proField.field_name].toFixed(1)}g`);
    if (hasCarb && carbField) parts.push(`C: ${totals[carbField.field_name].toFixed(1)}g`);
    if (hasFat && fatField) parts.push(`G: ${totals[fatField.field_name].toFixed(1)}g`);
    
    const label = document.getElementById('planTotalCalculatedMacros');
    if (label) {
        label.innerHTML = `Total Plan: ${parts.join(' | ')}`;
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
        <div id="assignNutritionModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 20000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
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
        <div id="assignNutritionToClientModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 20000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
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
            selectClient(activeUserId, activeTab);
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

let foodsTableCollapsed = true;
let activeFoodCategoryFilter = 'Todos';
let visibleFoodsCount = 30;

function toggleFoodsTable() {
    foodsTableCollapsed = !foodsTableCollapsed;
    const btn = document.getElementById('btnToggleFoodsTable');
    if (btn) {
        btn.innerHTML = foodsTableCollapsed ? '<i class="fa-solid fa-chevron-down"></i> Mostrar Catálogo' : '<i class="fa-solid fa-chevron-up"></i> Ocultar Catálogo';
    }
    renderFoodsTable();
}

function selectCategoryFilter(category) {
    activeFoodCategoryFilter = category;
    visibleFoodsCount = 30;
    
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
        if (pill.dataset.category === category) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    
    if (category !== 'Todos') {
        foodsTableCollapsed = false;
        const btn = document.getElementById('btnToggleFoodsTable');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Ocultar Catálogo';
        }
    }
    renderFoodsTable();
}

function renderCategoryFilters() {
    const container = document.getElementById('foodCategoryFilters');
    if (!container) return;
    
    const categories = [
        'Todos',
        'Carnes y Pescados',
        'Frutas',
        'Verduras',
        'Granos y Cereales',
        'Lácteos y Huevos',
        'Aceites y Grasas',
        'Nueces y Semillas',
        'Otros'
    ];
    
    container.innerHTML = categories.map(cat => {
        const isActive = cat === activeFoodCategoryFilter;
        return `<span class="filter-pill ${isActive ? 'active' : ''}" data-category="${cat}" onclick="selectCategoryFilter('${cat}')">${cat}</span>`;
    }).join('');
}

function showMoreFoods() {
    visibleFoodsCount += 30;
    renderFoodsTable();
}

function showLessFoods() {
    visibleFoodsCount = 30;
    renderFoodsTable();
    const container = document.getElementById('globalFoodsTableContainer');
    if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function filterFoodsList() {
    const queryInput = document.getElementById('foodSearchInput');
    const query = queryInput ? queryInput.value.trim() : '';
    if (query.length > 0) {
        foodsTableCollapsed = false;
        const btn = document.getElementById('btnToggleFoodsTable');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Ocultar Catálogo';
        }
    }
    visibleFoodsCount = 30;
    renderFoodsTable();
}

async function fetchFoodLibraryAndRender() {
    await fetchFoodLibrary();
    renderCategoryFilters();
    renderFoodsTable();
}

function renderFoodsTable() {
    const headerRow = document.getElementById('globalFoodsHeader');
    const tbody = document.getElementById('globalFoodsList');
    const container = document.getElementById('globalFoodsTableContainer');
    const placeholder = document.getElementById('globalFoodsTablePlaceholder');
    const moreContainer = document.getElementById('globalFoodsTableMoreContainer');
    if (!headerRow || !tbody) return;
    
    const searchInput = document.getElementById('foodSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const hasActiveFilters = query.length > 0 || activeFoodCategoryFilter !== 'Todos';
    
    if (foodsTableCollapsed && !hasActiveFilters) {
        if (container) container.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
        return;
    } else {
        if (container) container.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    }
    
    let headerHtml = `
        <th style="width: 50px; text-align: left;">ID</th>
        <th style="text-align: left;">Alimento (ES)</th>
        <th style="text-align: left;">Nombre (EN)</th>
        <th style="text-align: left;">Grupo</th>
    `;
    
    const activeFields = globalNutritionConfig.filter(f => f.is_active == 1 || f.is_active === true);
    activeFields.forEach(field => {
        const unitStr = field.unit ? ` (${field.unit})` : '';
        headerHtml += `<th style="text-align: left;">${field.field_name}${unitStr}</th>`;
    });
    
    headerHtml += `<th style="width: 100px; text-align: left;">Acciones</th>`;
    headerRow.innerHTML = headerHtml;
    
    const filteredFoods = globalFoodLibrary.filter(food => {
        const matchNameEs = food.name && food.name.toLowerCase().includes(query);
        const matchNameEn = food.name_en && food.name_en.toLowerCase().includes(query);
        const matchQuery = matchNameEs || matchNameEn;
        const matchCategory = activeFoodCategoryFilter === 'Todos' || food.category === activeFoodCategoryFilter;
        return matchQuery && matchCategory;
    });
    
    const foodsToRender = filteredFoods.slice(0, visibleFoodsCount);
    
    if (moreContainer) {
        const btnMore = document.getElementById('btnShowMoreFoods');
        const btnLess = document.getElementById('btnShowLessFoods');
        const totalCount = filteredFoods.length;
        
        if (totalCount > 0) {
            moreContainer.style.display = 'flex';
            if (visibleFoodsCount < totalCount) {
                if (btnMore) {
                    btnMore.style.display = 'inline-block';
                    btnMore.innerText = `Mostrar más alimentos... (${visibleFoodsCount} de ${totalCount})`;
                }
            } else {
                if (btnMore) btnMore.style.display = 'none';
            }
            
            if (visibleFoodsCount > 30) {
                if (btnLess) btnLess.style.display = 'inline-block';
            } else {
                if (btnLess) btnLess.style.display = 'none';
            }
        } else {
            moreContainer.style.display = 'none';
        }
    }
    
    tbody.innerHTML = '';
    
    if (foodsToRender.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${5 + activeFields.length}" style="text-align: center; padding: 20px; color: var(--color-text-secondary);">
                    No se encontraron alimentos que coincidan con la búsqueda o el filtro seleccionado.
                </td>
            </tr>
        `;
        return;
    }
    
    foodsToRender.forEach(food => {
        let rowHtml = `
            <tr>
                <td style="padding: 6px;">${food.id}</td>
                <td style="font-weight: bold; color: var(--accent-green); padding: 6px;">${food.name}</td>
                <td style="color: var(--color-text-secondary); padding: 6px; font-style: italic;">${food.name_en || '-'}</td>
                <td style="padding: 6px; color: var(--accent-cyan); font-weight: 500;">${food.category || 'Otros'}</td>
        `;
        
        activeFields.forEach(field => {
            let val = '-';
            if (field.is_default && field.db_column) {
                val = food[field.db_column] !== null && food[field.db_column] !== undefined ? food[field.db_column] : '-';
            } else {
                val = food.custom_data && food.custom_data[field.field_name] !== undefined ? food.custom_data[field.field_name] : '-';
            }
            rowHtml += `<td style="padding: 6px;">${val}</td>`;
        });
        
        rowHtml += `
                <td style="padding: 6px;">
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-green);" onclick="editFood(${food.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-nav" style="padding: 4px 8px; font-size: 11px; color: var(--accent-red);" onclick="deleteFood(${food.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </div>
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
    document.getElementById('foodNameEn').value = '';
    document.getElementById('foodCategory').value = 'Carnes y Pescados';
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
            document.getElementById('foodNameEn').value = food.name_en || '';
            document.getElementById('foodCategory').value = food.category || 'Otros';
            
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
    const name_en = document.getElementById('foodNameEn').value;
    const category = document.getElementById('foodCategory').value;
    
    const payload = {
        name: name,
        name_en: name_en,
        category: category,
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
    updatePlanCalculatedTotals();
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

// handleMobileChatFabClick removed as mobile FAB was removed. Minimized chat bubbles are used instead.

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
            if (activeUserId == id) {
                activeUserId = null;
                const placeholder = document.getElementById("selectClientPlaceholder");
                if (placeholder) placeholder.style.display = "flex";
                document.getElementById("profileHeaderCard").style.display = "none";
                document.getElementById("kpiContainer").style.display = "none";
                document.getElementById("tabsCard").style.display = "none";
            }
        } else {
            alert('Error eliminando: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error in deleteClientConfig:', error);
    }
}

// --- Routine Assignment within active tabs ---
let globalRoutinesCacheForAssignment = [];
let selectedRoutineIdForAssignment = null;

function promptAssignRoutineToClient() {
    if (!activeUserId) {
        alert("Selecciona un cliente primero.");
        return;
    }
    const client = usersData.find(u => u.id === activeUserId);
    const clientName = client ? `${client.first_name} ${client.last_name}` : "Cliente";
    
    fetch('/api/routines')
        .then(r => r.json())
        .then(data => {
            globalRoutinesCacheForAssignment = data;
            showAssignRoutineToClientModal(clientName);
        })
        .catch(err => {
            console.error(err);
            alert("Error al cargar las plantillas globales de rutinas.");
        });
}

function showAssignRoutineToClientModal(clientName) {
    selectedRoutineIdForAssignment = null;
    
    let optionsHtml = globalRoutinesCacheForAssignment.map(r => `
        <div class="routine-option-item" onclick="selectRoutineOption(${r.id}, this)" style="padding: 12px; border: 1px solid var(--glass-border); border-radius: 10px; cursor: pointer; transition: var(--transition-smooth); display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); margin-bottom: 8px;" data-title="${r.title.toLowerCase()}">
            <div style="text-align: left; padding-right: 10px;">
                <strong style="color: white; display: block; font-size: 13.5px; margin-bottom: 2px;">${r.title}</strong>
                <span style="font-size: 11px; color: var(--color-text-secondary); line-height: 1.3; display: block;">${r.days ? r.days.length : 0} días • ${r.description || 'Sin descripción'}</span>
            </div>
            <i class="fa-regular fa-circle check-icon" style="color: var(--color-text-muted); font-size: 16px; flex-shrink: 0;"></i>
        </div>
    `).join('');
    
    if (globalRoutinesCacheForAssignment.length === 0) {
        optionsHtml = `<div style="text-align: center; padding: 20px; color: var(--color-text-secondary); font-size: 13px;">(No hay plantillas globales creadas)</div>`;
    }
    
    const modalHtml = `
        <div id="assignRoutineToClientModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 20000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
            <div class="glass-card" style="width: 450px; max-width: 95%; padding: 25px; display: flex; flex-direction: column; max-height: 85vh;">
                <h3 style="color: var(--accent-cyan); margin-bottom: 10px; font-size: 18px;"><i class="fa-solid fa-arrows-rotate"></i> Cambiar Rutina a ${clientName}</h3>
                <p style="margin-bottom: 15px; color: var(--color-text-secondary); font-size: 12.5px; line-height: 1.4;">Busca y selecciona una plantilla de rutina para este cliente. Si ya tiene una rutina asignada, esta será reemplazada.</p>
                
                <div class="form-group" style="margin-bottom: 12px;">
                    <input type="text" id="routineSearchInput" class="form-input" placeholder="🔍 Buscar rutina por nombre..." style="width: 100%; padding: 10px 12px; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); color: white;" oninput="filterRoutineOptions()">
                </div>
                
                <div id="routineOptionsList" style="flex: 1; overflow-y: auto; margin-bottom: 15px; padding-right: 5px; max-height: 300px;">
                    ${optionsHtml}
                    <div id="noRoutineResults" style="display: none; text-align: center; padding: 20px; color: var(--color-text-muted); font-size: 13px;">
                        No se encontraron rutinas que coincidan con tu búsqueda.
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                    <button class="btn-secondary" onclick="document.getElementById('assignRoutineToClientModal').remove()">Cancelar</button>
                    <button id="confirmAssignRoutineBtn" class="btn-primary" onclick="confirmAssignRoutineToActiveClient()" disabled>Guardar Cambios</button>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('assignRoutineToClientModal');
    if (existing) existing.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function selectRoutineOption(id, element) {
    selectedRoutineIdForAssignment = id;
    
    const items = document.querySelectorAll('.routine-option-item');
    items.forEach(item => {
        item.style.borderColor = 'var(--glass-border)';
        item.style.background = 'rgba(255,255,255,0.02)';
        const icon = item.querySelector('.check-icon');
        icon.className = 'fa-regular fa-circle check-icon';
        icon.style.color = 'var(--color-text-muted)';
    });
    
    element.style.borderColor = 'var(--accent-gold)';
    element.style.background = 'rgba(243, 202, 76, 0.05)';
    const icon = element.querySelector('.check-icon');
    icon.className = 'fa-solid fa-circle-check check-icon';
    icon.style.color = 'var(--accent-gold)';
    
    const saveBtn = document.getElementById('confirmAssignRoutineBtn');
    if (saveBtn) saveBtn.removeAttribute('disabled');
}

function filterRoutineOptions() {
    const query = document.getElementById('routineSearchInput').value.toLowerCase();
    const items = document.querySelectorAll('.routine-option-item');
    let visibleCount = 0;
    
    items.forEach(item => {
        const title = item.getAttribute('data-title');
        if (title.includes(query)) {
            item.style.display = 'flex';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });
    
    const noResults = document.getElementById('noRoutineResults');
    if (visibleCount === 0) {
        noResults.style.display = 'block';
    } else {
        noResults.style.display = 'none';
    }
}

async function confirmAssignRoutineToActiveClient() {
    const planId = selectedRoutineIdForAssignment;
    if (!planId) return;
    
    try {
        const res = await fetch('/api/routines/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId, client_id: activeUserId })
        });
        const data = await res.json();
        if (data.success) {
            alert("Rutina cambiada correctamente.");
            const modal = document.getElementById('assignRoutineToClientModal');
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
// TRAINER CHAT SYSTEM (WEBSOCKETS & FLOATING BUBBLES)
// ==========================================

let trainerSocket = null;
let trainerUnreadCounts = {}; // client_id -> count
let trainerActiveChatClientId = null; // selected client in main tab chat
let trainerFloatingChatClientId = null; // active client in floating drawer chat
let trainerChatHistoryOffset = 0;
let trainerFloatingChatHistoryOffset = 0;
const trainerChatHistoryLimit = 30;
let trainerOnlineClients = new Set(); // set of client user_ids currently online

function playTrainerChimeSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        osc.frequency.setValueAtTime(987.77, audioCtx.currentTime + 0.1); // B5
        
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.45);
    } catch(e) {
        console.error("Audio Context not supported", e);
    }
}

function connectTrainerWebSocket() {
    if (trainerSocket && trainerSocket.readyState === WebSocket.OPEN) return;
    
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = localStorage.getItem('jwtToken') || '';
    
    const trainerId = sessionStorage.getItem('trainerId') || 'admin';
    
    trainerSocket = new WebSocket(`${wsProto}//${host}/ws/chat?trainer=${trainerId}&userId=0&token=${token}`);
    
    trainerSocket.onopen = function() {
        console.log("Trainer Chat WS: Connected successfully");
    };
    
    trainerSocket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'presence') {
            if (data.user_id !== 0) {
                if (data.status === 'online') {
                    trainerOnlineClients.add(data.user_id);
                } else {
                    trainerOnlineClients.delete(data.user_id);
                }
                
                renderClientList();
                
                if (trainerActiveChatClientId === data.user_id) {
                    updateTrainerChatOnlineStatus(data.user_id);
                }
                
                if (trainerFloatingChatClientId === data.user_id) {
                    updateFloatingChatOnlineStatus(data.user_id);
                }
            }
        } else if (data.type === 'receipt') {
            if (data.receiver_id === trainerActiveChatClientId) {
                const tickEl = document.getElementById(`tick-${data.id}`);
                if (tickEl) {
                    tickEl.innerHTML = data.delivered ? '<i class="fa-solid fa-check-double" style="color: var(--color-text-secondary);"></i>' : '<i class="fa-solid fa-check"></i>';
                }
            }
            if (data.receiver_id === trainerFloatingChatClientId) {
                const floatTickEl = document.getElementById(`float-tick-${data.id}`);
                if (floatTickEl) {
                    floatTickEl.innerHTML = data.delivered ? '<i class="fa-solid fa-check-double" style="color: var(--color-text-secondary);"></i>' : '<i class="fa-solid fa-check"></i>';
                }
            }
        } else if (data.type === 'read_receipt') {
            if (data.sender_id === 0 && data.receiver_id === trainerActiveChatClientId) {
                document.querySelectorAll('.chat-tick').forEach(tick => {
                    tick.innerHTML = '<i class="fa-solid fa-check-double" style="color: var(--accent-cyan);"></i>';
                });
            }
            if (data.sender_id === 0 && data.receiver_id === trainerFloatingChatClientId) {
                document.querySelectorAll('.float-chat-tick').forEach(tick => {
                    tick.innerHTML = '<i class="fa-solid fa-check-double" style="color: var(--accent-cyan);"></i>';
                });
            }
        } else {
            const senderId = data.sender_id;
            
            const isMainTabActive = activeTab === 'tabChat' && activeUserId === senderId;
            const isFloatingActive = document.getElementById("expandedFloatingChatDrawer").style.display === 'flex' && trainerFloatingChatClientId === senderId;
            
            if (isMainTabActive) {
                renderTrainerChatMessage(data, false);
                markTrainerChatAsRead(senderId);
                scrollToBottomTrainerChat();
            } else if (isFloatingActive) {
                renderFloatingChatMessage(data, false);
                markTrainerChatAsRead(senderId);
                scrollToBottomFloatingChat();
            } else {
                playTrainerChimeSound();
                incrementUnreadCount(senderId);
            }
            
            fetchTrainerUnreadCounts();
        }
    };
    
    trainerSocket.onclose = function() {
        console.log("Trainer Chat WS: Connection closed, reconnecting in 5s...");
        setTimeout(connectTrainerWebSocket, 5000);
    };
    
    trainerSocket.onerror = function(err) {
        console.error("Trainer Chat WS Error:", err);
    };
}

function incrementUnreadCount(clientId) {
    trainerUnreadCounts[clientId] = (trainerUnreadCounts[clientId] || 0) + 1;
    
    const client = usersData.find(u => u.id === clientId);
    const clientName = client ? `${client.first_name} ${client.last_name}` : "Cliente";
    renderFloatingChatBubble(clientId, clientName, trainerUnreadCounts[clientId]);
}

async function fetchTrainerUnreadCounts() {
    try {
        const response = await fetch('/api/chat/unread_counts');
        const data = await response.json();
        if (data.success) {
            trainerUnreadCounts = data.unread_counts || {};
            
            renderClientList();
            
            let totalUnread = 0;
            for (const id in trainerUnreadCounts) {
                totalUnread += trainerUnreadCounts[id];
            }
            
            const badge = document.getElementById("globalBellBadge");
            const fabBadge = document.getElementById("mobileFabBadge");
            if (badge) {
                if (totalUnread > 0) {
                    badge.innerText = totalUnread;
                    badge.style.display = "flex";
                } else {
                    badge.style.display = "none";
                }
            }
            if (fabBadge) {
                if (totalUnread > 0) {
                    fabBadge.innerText = totalUnread;
                    fabBadge.style.display = "flex";
                } else {
                    fabBadge.style.display = "none";
                }
            }
            
            const headerCount = document.getElementById("unreadNotificationsHeaderCount");
            if (headerCount) {
                headerCount.innerText = `${totalUnread} nuevos`;
            }
            
            const tabBadge = document.getElementById("tabChatBadge");
            if (tabBadge) {
                if (activeUserId && trainerUnreadCounts[activeUserId] > 0) {
                    tabBadge.style.display = "block";
                } else {
                    tabBadge.style.display = "none";
                }
            }
        }
    } catch(e) {
        console.error("Error fetching unread counts:", e);
    }
}

function updateTrainerChatOnlineStatus(clientId) {
    const isOnline = trainerOnlineClients.has(clientId);
    const dot = document.getElementById("trainerChatClientStatusDot");
    const text = document.getElementById("trainerChatClientStatusText");
    if (dot && text) {
        if (isOnline) {
            dot.style.background = "#22c55e";
            text.innerText = "En línea";
        } else {
            dot.style.background = "#6b7280";
            text.innerText = "Desconectado";
        }
    }
}

function updateFloatingChatOnlineStatus(clientId) {
    const isOnline = trainerOnlineClients.has(clientId);
    const dot = document.getElementById("floatingChatStatusDot");
    const text = document.getElementById("floatingChatClientStatusText");
    if (dot && text) {
        if (isOnline) {
            dot.style.background = "#22c55e";
            text.innerText = "En línea";
        } else {
            dot.style.background = "#6b7280";
            text.innerText = "Desconectado";
        }
    }
}

async function loadTrainerChatHistory(clientId, appendBefore = false) {
    try {
        const response = await fetch(`/api/chat/history?userId=0&otherId=${clientId}&limit=${trainerChatHistoryLimit}&offset=${trainerChatHistoryOffset}`);
        const data = await response.json();
        
        if (data.success) {
            const container = document.getElementById("trainerChatMessagesContainer");
            const loadMoreBtn = document.getElementById("trainerChatLoadMoreBtn");
            
            if (!appendBefore) {
                container.innerHTML = "";
            }
            
            const messages = data.messages || [];
            if (messages.length < trainerChatHistoryLimit) {
                loadMoreBtn.style.display = "none";
            } else {
                loadMoreBtn.style.display = "block";
            }
            
            const oldScrollHeight = document.getElementById("trainerChatStream").scrollHeight;
            
            messages.forEach(msg => {
                renderTrainerChatMessage(msg, appendBefore);
            });
            
            if (appendBefore) {
                const newScrollHeight = document.getElementById("trainerChatStream").scrollHeight;
                document.getElementById("trainerChatStream").scrollTop += (newScrollHeight - oldScrollHeight);
            } else {
                scrollToBottomTrainerChat();
            }
            
            loadMoreBtn.onclick = function() {
                trainerChatHistoryOffset += trainerChatHistoryLimit;
                loadTrainerChatHistory(clientId, true);
            };
        }
    } catch (e) {
        console.error("Error loading trainer chat history:", e);
    }
}

function renderTrainerChatMessage(msg, appendBefore = false) {
    const container = document.getElementById("trainerChatMessagesContainer");
    if (!container) return;
    
    if (document.getElementById(`msg-${msg.id}`)) return;
    
    const isMe = msg.sender_id === 0;
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

async function sendTrainerChatMessage() {
    const input = document.getElementById("trainerChatInput");
    if (!input) return;
    
    const text = input.value.trim();
    if (!text || !activeUserId) return;
    
    const tempId = "temp-" + Date.now();
    const tempMsg = {
        id: tempId,
        sender_id: 0,
        receiver_id: activeUserId,
        message: text,
        is_read: false,
        created_at: new Date().toISOString()
    };
    
    renderTrainerChatMessage(tempMsg, false);
    scrollToBottomTrainerChat();
    input.value = "";
    
    if (trainerSocket && trainerSocket.readyState === WebSocket.OPEN) {
        trainerSocket.send(JSON.stringify({
            "receiver_id": activeUserId,
            "message": text
        }));
    } else {
        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_id: 0,
                    receiver_id: activeUserId,
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
        connectTrainerWebSocket();
    }
}

function handleTrainerChatKeydown(event) {
    if (event.key === "Enter") {
        sendTrainerChatMessage();
    }
}

async function markTrainerChatAsRead(clientId) {
    try {
        await fetch('/api/chat/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: clientId,
                receiver_id: 0
            })
        });
        
        trainerUnreadCounts[clientId] = 0;
        fetchTrainerUnreadCounts();
    } catch(e) {
        console.error("Error marking trainer chat as read:", e);
    }
}

function scrollToBottomTrainerChat() {
    setTimeout(() => {
        const stream = document.getElementById("trainerChatStream");
        if (stream) {
            stream.scrollTop = stream.scrollHeight;
        }
    }, 50);
}

// --- Notifications Dropdown Handling ---

function toggleChatNotificationsDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById("chatNotificationsDropdown");
    if (!dropdown) return;
    
    if (dropdown.style.display === "none") {
        dropdown.style.display = "block";
        populateChatNotificationsDropdown();
    } else {
        dropdown.style.display = "none";
    }
}

document.addEventListener("click", () => {
    const dropdown = document.getElementById("chatNotificationsDropdown");
    if (dropdown) dropdown.style.display = "none";
});

function populateChatNotificationsDropdown() {
    const list = document.getElementById("chatNotificationsDropdownList");
    if (!list) return;
    
    list.innerHTML = "";
    
    let hasNotifications = false;
    
    usersData.forEach(user => {
        const unreadCount = trainerUnreadCounts[user.id] || 0;
        if (unreadCount > 0) {
            hasNotifications = true;
            
            const item = document.createElement("div");
            item.style.padding = "10px 15px";
            item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            item.style.cursor = "pointer";
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.gap = "10px";
            item.style.background = "rgba(255,255,255,0.02)";
            
            item.onclick = (e) => {
                e.stopPropagation();
                selectClient(user.id);
                switchTab('tabChat');
                document.getElementById("chatNotificationsDropdown").style.display = "none";
            };
            
            const initials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
            
            item.innerHTML = `
                <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple)); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 11px;">
                    ${initials}
                </div>
                <div style="flex:1;">
                    <strong style="color:var(--color-text-primary);">${user.first_name} ${user.last_name}</strong>
                    <div style="color:var(--color-text-secondary); font-size:10px;">Tiene mensajes sin leer</div>
                </div>
                <span style="background:#ef4444; color:white; font-size:10px; font-weight:bold; border-radius:10px; padding:1px 5px; line-height:1;">${unreadCount}</span>
            `;
            
            list.appendChild(item);
        }
    });
    
    if (!hasNotifications) {
        list.innerHTML = `<div style="padding: 20px 15px; text-align: center; color: var(--color-text-muted);">No tienes mensajes nuevos</div>`;
    }
}

// --- Floating Bubbles & Chat Drawer Handling ---

function renderFloatingChatBubble(clientId, clientName, count) {
    removeFloatingChatBubble(clientId);
    
    const container = document.getElementById("floatingChatBubblesContainer");
    if (!container) return;
    
    const initials = clientName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const isOnline = trainerOnlineClients.has(clientId);
    
    const bubble = document.createElement("div");
    bubble.id = `chat-bubble-${clientId}`;
    bubble.style.width = "48px";
    bubble.style.height = "48px";
    bubble.style.borderRadius = "50%";
    bubble.style.background = "linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))";
    bubble.style.border = "2px solid var(--glass-border)";
    bubble.style.display = "flex";
    bubble.style.alignItems = "center";
    bubble.style.justifyContent = "center";
    bubble.style.color = "white";
    bubble.style.fontWeight = "bold";
    bubble.style.cursor = "pointer";
    bubble.style.position = "relative";
    bubble.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)";
    bubble.style.transition = "transform 0.2s ease";
    
    bubble.innerText = initials;
    bubble.title = `Chat con ${clientName}`;
    
    const dot = document.createElement("span");
    dot.style.position = "absolute";
    dot.style.bottom = "0";
    dot.style.right = "0";
    dot.style.width = "12px";
    dot.style.height = "12px";
    dot.style.borderRadius = "50%";
    dot.style.background = isOnline ? "#22c55e" : "#6b7280";
    dot.style.border = "2px solid var(--color-bg-dark)";
    bubble.appendChild(dot);
    
    if (count > 0) {
        const badge = document.createElement("span");
        badge.style.position = "absolute";
        badge.style.top = "-5px";
        badge.style.left = "-5px";
        badge.style.background = "#ef4444";
        badge.style.color = "white";
        badge.style.fontSize = "10px";
        badge.style.fontWeight = "bold";
        badge.style.borderRadius = "10px";
        badge.style.padding = "2px 6px";
        badge.style.lineHeight = "1";
        badge.innerText = count;
        bubble.appendChild(badge);
    }
    
    bubble.onclick = (e) => {
        if (container.getAttribute('data-dragged') === 'true') {
            return;
        }
        e.stopPropagation();
        openFloatingChatDrawer(clientId, clientName);
    };
    
    container.appendChild(bubble);
    
    // Enable dragging of the container when dragging this bubble
    makeElementDraggable(container, bubble);
}

function removeFloatingChatBubble(clientId) {
    const bubble = document.getElementById(`chat-bubble-${clientId}`);
    if (bubble) bubble.remove();
}

function openFloatingChatDrawer(clientId, clientName) {
    removeFloatingChatBubble(clientId);
    
    trainerFloatingChatClientId = clientId;
    trainerFloatingChatHistoryOffset = 0;
    
    const drawer = document.getElementById("expandedFloatingChatDrawer");
    drawer.style.display = "flex";
    
    document.getElementById("floatingChatClientName").innerText = clientName;
    const initials = clientName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById("floatingChatAvatar").innerText = initials;
    
    updateFloatingChatOnlineStatus(clientId);
    loadFloatingChatHistory(clientId, false);
    markTrainerChatAsRead(clientId);
}

function collapseFloatingChat() {
    const drawer = document.getElementById("expandedFloatingChatDrawer");
    drawer.style.display = "none";
    
    if (trainerFloatingChatClientId) {
        const client = usersData.find(u => u.id === trainerFloatingChatClientId);
        const name = client ? `${client.first_name} ${client.last_name}` : "Cliente";
        renderFloatingChatBubble(trainerFloatingChatClientId, name, 0);
        trainerFloatingChatClientId = null;
    }
}

function closeFloatingChat() {
    const drawer = document.getElementById("expandedFloatingChatDrawer");
    drawer.style.display = "none";
    trainerFloatingChatClientId = null;
}

function maximizeFromFloatingChat() {
    if (trainerFloatingChatClientId) {
        const cid = trainerFloatingChatClientId;
        closeFloatingChat();
        selectClient(cid, 'tabChat');
    }
}

function minimizeTrainerChat() {
    if (activeUserId) {
        const client = usersData.find(u => u.id === activeUserId);
        const name = client ? `${client.first_name} ${client.last_name}` : "Cliente";
        
        switchTab('tabFicha');
        
        renderFloatingChatBubble(activeUserId, name, 0);
    }
}

async function loadFloatingChatHistory(clientId, appendBefore = false) {
    try {
        const response = await fetch(`/api/chat/history?userId=0&otherId=${clientId}&limit=${trainerChatHistoryLimit}&offset=${trainerFloatingChatHistoryOffset}`);
        const data = await response.json();
        
        if (data.success) {
            const container = document.getElementById("floatingChatMessagesContainer");
            const loadMoreBtn = document.getElementById("floatingChatLoadMoreBtn");
            
            if (!appendBefore) {
                container.innerHTML = "";
            }
            
            const messages = data.messages || [];
            if (messages.length < trainerChatHistoryLimit) {
                loadMoreBtn.style.display = "none";
            } else {
                loadMoreBtn.style.display = "block";
            }
            
            const oldScrollHeight = document.getElementById("floatingChatStream").scrollHeight;
            
            messages.forEach(msg => {
                renderFloatingChatMessage(msg, appendBefore);
            });
            
            if (appendBefore) {
                const newScrollHeight = document.getElementById("floatingChatStream").scrollHeight;
                document.getElementById("floatingChatStream").scrollTop += (newScrollHeight - oldScrollHeight);
            } else {
                scrollToBottomFloatingChat();
            }
            
            loadMoreBtn.onclick = function() {
                trainerFloatingChatHistoryOffset += trainerChatHistoryLimit;
                loadFloatingChatHistory(clientId, true);
            };
        }
    } catch(e) {
        console.error("Error loading floating chat history:", e);
    }
}

function renderFloatingChatMessage(msg, appendBefore = false) {
    const container = document.getElementById("floatingChatMessagesContainer");
    if (!container) return;
    
    if (document.getElementById(`float-msg-${msg.id}`)) return;
    
    const isMe = msg.sender_id === 0;
    const dateObj = new Date(msg.created_at);
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const msgDiv = document.createElement("div");
    msgDiv.id = `float-msg-${msg.id}`;
    msgDiv.style.display = "flex";
    msgDiv.style.flexDirection = "column";
    msgDiv.style.alignSelf = isMe ? "flex-end" : "flex-start";
    msgDiv.style.maxWidth = "80%";
    msgDiv.style.gap = "1px";
    
    const bubble = document.createElement("div");
    bubble.style.padding = "6px 10px";
    bubble.style.borderRadius = isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px";
    bubble.style.fontSize = "11px";
    bubble.style.lineHeight = "1.3";
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
    infoRow.style.gap = "4px";
    infoRow.style.fontSize = "9px";
    infoRow.style.color = "var(--color-text-muted)";
    
    const timeSpan = document.createElement("span");
    timeSpan.innerText = timeStr;
    infoRow.appendChild(timeSpan);
    
    if (isMe) {
        const tickSpan = document.createElement("span");
        tickSpan.id = `float-tick-${msg.id}`;
        tickSpan.className = "float-chat-tick";
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

async function sendFloatingChatMessage() {
    const input = document.getElementById("floatingChatInput");
    if (!input) return;
    
    const text = input.value.trim();
    if (!text || !trainerFloatingChatClientId) return;
    
    const tempId = "temp-float-" + Date.now();
    const tempMsg = {
        id: tempId,
        sender_id: 0,
        receiver_id: trainerFloatingChatClientId,
        message: text,
        is_read: false,
        created_at: new Date().toISOString()
    };
    
    renderFloatingChatMessage(tempMsg, false);
    scrollToBottomFloatingChat();
    input.value = "";
    
    if (trainerSocket && trainerSocket.readyState === WebSocket.OPEN) {
        trainerSocket.send(JSON.stringify({
            "receiver_id": trainerFloatingChatClientId,
            "message": text
        }));
    } else {
        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_id: 0,
                    receiver_id: trainerFloatingChatClientId,
                    message: text
                })
            });
            const data = await response.json();
            if (data.success) {
                const tempEl = document.getElementById(`float-msg-${tempId}`);
                if (tempEl) {
                    tempEl.id = `float-msg-${data.message_id}`;
                    const tick = tempEl.querySelector('.float-chat-tick');
                    if (tick) {
                        tick.id = `float-tick-${data.message_id}`;
                        tick.innerHTML = '<i class="fa-solid fa-check"></i>';
                    }
                }
            }
        } catch (e) {
            console.error("REST float send fallback failed:", e);
        }
        connectTrainerWebSocket();
    }
}

function handleFloatingChatKeydown(event) {
    if (event.key === "Enter") {
        sendFloatingChatMessage();
    }
}

function scrollToBottomFloatingChat() {
    setTimeout(() => {
        const stream = document.getElementById("floatingChatStream");
        if (stream) {
            stream.scrollTop = stream.scrollHeight;
        }
    }, 50);
}

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input && icon) {
        if (input.type === "password") {
            input.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        } else {
            input.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }
    }
}

function makeElementDraggable(el, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let startX = 0, startY = 0;
    let hasDragged = false;
    
    header.onmousedown = dragMouseDown;
    header.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        startX = e.clientX;
        startY = e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        hasDragged = false;
        el.removeAttribute('data-dragged');
        
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;
        hasDragged = false;
        el.removeAttribute('data-dragged');
        
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementTouchDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasDragged = true;
            el.setAttribute('data-dragged', 'true');
        }
        
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        updatePosition(el.offsetTop - pos2, el.offsetLeft - pos1);
    }

    function elementTouchDrag(e) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasDragged = true;
            el.setAttribute('data-dragged', 'true');
            if (e.cancelable) e.preventDefault();
        }
        
        pos1 = pos3 - e.touches[0].clientX;
        pos2 = pos4 - e.touches[0].clientY;
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;
        
        updatePosition(el.offsetTop - pos2, el.offsetLeft - pos1);
    }
    
    function updatePosition(newTop, newLeft) {
        const buffer = 10;
        const maxTop = window.innerHeight - (el.offsetHeight || 50) - buffer;
        const maxLeft = window.innerWidth - (el.offsetWidth || 50) - buffer;
        
        let constrainedTop = newTop;
        let constrainedLeft = newLeft;
        
        if (maxTop > buffer) {
            constrainedTop = Math.max(buffer, Math.min(newTop, maxTop));
        }
        if (maxLeft > buffer) {
            constrainedLeft = Math.max(buffer, Math.min(newLeft, maxLeft));
        }
        
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        el.style.top = constrainedTop + "px";
        el.style.left = constrainedLeft + "px";
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
        
        if (hasDragged) {
            setTimeout(() => {
                el.removeAttribute('data-dragged');
            }, 100);
        }
    }
}

/* ==========================================================================
   INTERACTIVE MUSCLE MAP FILTER LOGIC
   ========================================================================== */

let muscleMapVisible = false;
let unifiedMuscleViewFront = true;

function initInteractiveMuscleMaps() {
    // 1. Initialize global exercise library muscle map click listeners
    const globalPaths = document.querySelectorAll('#globalMuscleMapContainer .muscle-group-path');
    globalPaths.forEach(path => {
        path.addEventListener('click', () => {
            const muscle = path.getAttribute('data-muscle');
            selectMuscleFromMap(muscle);
        });
    });

    // 2. Initialize block creator wizard muscle map click listeners
    const unifiedPaths = document.querySelectorAll('#unifiedFrontView .muscle-group-path, #unifiedBackView .muscle-group-path');
    unifiedPaths.forEach(path => {
        path.addEventListener('click', () => {
            const muscle = path.getAttribute('data-muscle');
            selectUnifiedMuscleFromMap(muscle);
        });
    });

    // 3. Hover sync logic for Zona Core (Front and Back)
    const allPaths = document.querySelectorAll('.muscle-group-path');
    allPaths.forEach(path => {
        path.addEventListener('mouseenter', () => {
            const muscle = path.getAttribute('data-muscle');
            if (muscle === 'Zona Core') {
                allPaths.forEach(p => {
                    const m = p.getAttribute('data-muscle');
                    if (m === 'Zona Core' || m === 'Abdominales' || m === 'Oblicuos' || m === 'Espalda Baja') {
                        p.classList.add('map-hover-sync');
                    }
                });
            }
        });
        path.addEventListener('mouseleave', () => {
            allPaths.forEach(p => p.classList.remove('map-hover-sync'));
        });
    });
}

function toggleMuscleMap() {
    muscleMapVisible = !muscleMapVisible;
    const container = document.getElementById('globalMuscleMapContainer');
    const btn = document.getElementById('btnToggleMuscleMap');
    if (container) {
        container.style.display = muscleMapVisible ? 'flex' : 'none';
    }
    if (btn) {
        btn.innerHTML = muscleMapVisible ? '<i class="fa-solid fa-person"></i> Ocultar Mapa' : '<i class="fa-solid fa-person"></i> Mapa de Músculos';
        if (muscleMapVisible) {
            btn.style.background = 'rgba(14, 165, 233, 0.15)';
            btn.style.borderColor = 'var(--accent-cyan)';
        } else {
            btn.style.background = 'rgba(14, 165, 233, 0.05)';
            btn.style.borderColor = 'rgba(14, 165, 233, 0.25)';
        }
    }
}

function selectMuscleFromMap(muscle) {
    if (activeExerciseCategoryFilter === muscle) {
        clearMuscleMapSelection();
        return;
    }
    
    const paths = document.querySelectorAll('#globalMuscleMapContainer .muscle-group-path');
    paths.forEach(p => {
        const m = p.getAttribute('data-muscle');
        if (m === muscle || (muscle === 'Zona Core' && (m === 'Abdominales' || m === 'Oblicuos' || m === 'Espalda Baja'))) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
    
    const label = document.getElementById('activeMuscleLabel');
    if (label) {
        label.textContent = `Músculo: ${muscle}`;
        label.style.borderColor = 'var(--accent-cyan)';
        label.style.color = 'var(--accent-cyan)';
    }
    
    activeExerciseCategoryFilter = muscle;
    visibleExercisesCount = 30;
    
    const pills = document.querySelectorAll('.ex-filter-pill');
    pills.forEach(pill => {
        if (pill.dataset.category === muscle) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    
    exercisesTableCollapsed = false;
    const btn = document.getElementById('btnToggleExercisesTable');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Ocultar Catálogo';
    }
    
    renderExercisesTable();
}

function clearMuscleMapSelection() {
    const paths = document.querySelectorAll('#globalMuscleMapContainer .muscle-group-path');
    paths.forEach(p => p.classList.remove('active'));
    
    const label = document.getElementById('activeMuscleLabel');
    if (label) {
        label.textContent = 'Músculo: Todos';
        label.style.borderColor = 'rgba(255, 255, 255, 0.04)';
        label.style.color = 'var(--color-text-secondary)';
    }
    
    selectExerciseCategoryFilter('Todos');
}

function toggleUnifiedMuscleView() {
    unifiedMuscleViewFront = !unifiedMuscleViewFront;
    const front = document.getElementById('unifiedFrontView');
    const back = document.getElementById('unifiedBackView');
    const btn = document.getElementById('btnToggleUnifiedView');
    if (front && back) {
        front.style.display = unifiedMuscleViewFront ? 'flex' : 'none';
        back.style.display = unifiedMuscleViewFront ? 'none' : 'flex';
    }
    if (btn) {
        btn.innerHTML = unifiedMuscleViewFront ? '<i class="fa-solid fa-arrows-rotate"></i> Frente / Espalda' : '<i class="fa-solid fa-arrows-rotate"></i> Frente / Espalda';
    }
}

function selectUnifiedMuscleFromMap(muscle) {
    const select = document.getElementById('unifiedCatalogMuscleFilter');
    if (!select) return;
    
    if (select.value === muscle) {
        clearUnifiedMuscleSelection();
        return;
    }
    
    const paths = document.querySelectorAll('#unifiedFrontView .muscle-group-path, #unifiedBackView .muscle-group-path');
    paths.forEach(p => {
        const m = p.getAttribute('data-muscle');
        if (m === muscle || (muscle === 'Zona Core' && (m === 'Abdominales' || m === 'Oblicuos' || m === 'Espalda Baja'))) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
    
    const label = document.getElementById('unifiedActiveMuscleLabel');
    if (label) {
        label.textContent = `Músculo: ${muscle}`;
        label.style.borderColor = 'var(--accent-cyan)';
        label.style.color = 'var(--accent-cyan)';
    }
    
    select.value = muscle;
    renderUnifiedCatalog();
}

function clearUnifiedMuscleSelection() {
    const paths = document.querySelectorAll('#unifiedFrontView .muscle-group-path, #unifiedBackView .muscle-group-path');
    paths.forEach(p => p.classList.remove('active'));
    
    const label = document.getElementById('unifiedActiveMuscleLabel');
    if (label) {
        label.textContent = 'Músculo: Todos';
        label.style.borderColor = 'rgba(0, 0, 0, 0.15)';
        label.style.color = 'var(--color-text-secondary)';
    }
    
    const select = document.getElementById('unifiedCatalogMuscleFilter');
    if (select) {
        select.value = '';
    }
    renderUnifiedCatalog();
}

function syncUnifiedMuscleDropdownToMap() {
    const select = document.getElementById('unifiedCatalogMuscleFilter');
    if (!select) return;
    const muscle = select.value;
    
    const paths = document.querySelectorAll('#unifiedFrontView .muscle-group-path, #unifiedBackView .muscle-group-path');
    paths.forEach(p => {
        const m = p.getAttribute('data-muscle');
        if (muscle && (m === muscle || (muscle === 'Zona Core' && (m === 'Abdominales' || m === 'Oblicuos' || m === 'Espalda Baja')))) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
    
    const label = document.getElementById('unifiedActiveMuscleLabel');
    if (label) {
        if (muscle) {
            label.textContent = `Músculo: ${muscle}`;
            label.style.borderColor = 'var(--accent-cyan)';
            label.style.color = 'var(--accent-cyan)';
        } else {
            label.textContent = 'Músculo: Todos';
            label.style.borderColor = 'rgba(0, 0, 0, 0.15)';
            label.style.color = 'var(--color-text-secondary)';
        }
    }
}

