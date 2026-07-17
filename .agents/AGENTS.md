# Antigravity Developer Instructions - Migration v2.0.12

Welcome, Antigravity. You are pair programming with the user in this workspace. The project has been migrated and updated to **v2.0.12**. Please read these instructions carefully to maintain consistency and understand what was done and what needs to be verified or developed next.

---

## 🎯 Context & Active State
We are working on the **Elite Coaching** platform (a fitness coaching multi-tenant system with FastAPI backend and Vanilla JS/PWA client and trainer frontends). 

A test suite compendium has been written in Spanish Gherkin format at [compendio_casos_prueba.feature](file:///c:/Users/sonic/OneDrive/Escritorio/PR/documents/compendio_casos_prueba.feature).

---

## 🆕 Key Changes in v2.0.12

### 1. UX Prototype Environment (`test_ux/`) — New Design System
A fully isolated UX prototype was created at [`test_ux/`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/test_ux/) running on port `8081`. It shares the same SQLite database as production (port `8080`) but has a completely redesigned visual layer.

**Files created/modified:**
- [`test_ux/style_blue.css`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/test_ux/style_blue.css) — New design system with blue obsidian background (`#080916`), cobalt/cyan accents, Poppins typography throughout
- [`test_ux/trainer_blue.html`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/test_ux/trainer_blue.html) — Trainer portal prototype
- [`test_ux/trainer_blue.js`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/test_ux/trainer_blue.js) — Trainer portal prototype logic
- [`test_ux/client_blue.html`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/test_ux/client_blue.html) — Client portal prototype
- [`test_ux/client_blue.js`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/test_ux/client_blue.js) — Client portal prototype logic
- [`restart_server_blue.bat`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/restart_server_blue.bat) — Helper script to free ports and relaunch prototype server

### 2. Typography — Poppins Unified (Decision: Permanent)
- **Decision:** After comparing Plus Jakarta Sans, Poppins, Outfit, Source Sans Pro, and Nunito, the user selected **Poppins** as the single global typeface.
- Poppins is now applied to: body text, headings, nav buttons, modals, form inputs, and table cells across the entire prototype.
- The old `Anton` (display) and `Inter` (body) stack was completely removed from the prototype.

### 3. Header Navigation Redesign
The header (`<header>`) in both trainer and client portals was restructured with a 3-column layout:
- **Left:** Logo icon + `ELITE COACHING` wordmark (gradient cyan-to-white) + trainer/client identity badge (`.trainer-badge` pill component)
- **Center:** Navigation links (`.btn-nav`) with active state highlight (cyan background)
- **Right:** Notification bell, action button (Nuevo Cliente / PDF), and `.btn-salir` logout button

**Key CSS classes added:**
- `.logo-container` — flex wrapper for logo + badge
- `.trainer-badge` — cyan-bordered pill showing coach or client name with icon
- `.btn-salir` — red-toned ghost button for session logout

### 4. Client Profile Card — DNI Format Redesign
The client profile header was redesigned from a flat text block into a premium identity card inspired by ID/passport layout:
- **Left column:** Avatar circle (72px, cyan glow border) + client name (25px, weight 800) + "HISTORIAL CLÍNICO" label
- **Right column:** 4-column grid of 8 data fields (Email, Teléfono, Edad, Estatura, Grupo Sanguíneo, Alergias, Medicamentos, Disponibilidad)
- **Bottom strip:** KPI badges for Peso, % Grasa, Cintura with larger font sizes (17px) and hover glow effect

**CSS classes:** `.dni-container`, `.dni-left`, `.dni-avatar`, `.dni-identity`, `.dni-name`, `.dni-right`, `.dni-grid`, `.dni-field`, `.dni-field-label`, `.dni-field-value`, `.dni-kpis`, `.dni-kpi-item`, `.dni-kpi-label`, `.dni-kpi-value`

### 5. Admin Dev Console — Password Security Fix
**Bug fixed:** The `password` column was missing from the `SELECT` queries in `server.py`, causing `undefined` to appear in the admin console PASSWORD column.

**Security decision:** Passwords are ONLY included in the API response when the request carries a valid `X-Admin-Passcode` header. Regular trainer portal calls to `/api/clients` never receive the password hash.

- [`server.py`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/server.py) — `handle_admin_get_trainers()`: `password` added to SELECT (endpoint is admin-auth-gated)
- [`server.py`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/server.py) — `handle_get_clients()`: conditional SELECT — includes `password` only when `check_admin_auth()` returns `True`
- [`web/admin/index.html`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/admin/index.html) — `loadClients()` now sends `X-Admin-Passcode: adminPasscode` header to unlock privileged response

---

## 🛠️ Verification & Testing Checkpoints

1. **Prototype UX — Port 8081:**
   - Run server: `python server.py`
   - Access: `http://localhost:8081/trainer/` and `http://localhost:8081/client/?userId=1`
   - Verify: Poppins font renders everywhere, header shows logo + badge + nav + logout properly, DNI card shows all 8 fields in 4-column grid without empty spaces

2. **Admin Dev Console — Password Column:**
   - Access: `http://localhost:8080/admin`
   - Enter admin passcode and navigate to "Suscripciones (Coaches)"
   - Verify: PASSWORD column shows bcrypt hash (e.g., `$2b$12$...`), NOT `undefined`
   - Navigate to "Clientes de Coaches" → select a trainer → verify PASSWORD column also shows hash

3. **Security verification — Trainer portal does NOT leak passwords:**
   - Open browser DevTools → Network tab
   - Log in to trainer portal (`http://localhost:8080/trainer/`)
   - Check the `/api/clients` response JSON — verify the `password` field is NOT present in any client object

4. **Workout Locking & Date Transition (from v2.0.11 — still active):**
   - Access: `http://localhost:8080/client/?userId=1`
   - Select a training day, check exercises, simulate date change
   - Verify: New date defaults to "Día de Descanso" without carrying over previous selection

5. **Nutrition Autocomplete & Read-Only Macros (from v2.0.11 — still active):**
   - Access trainer portal → Planes de Nutrición → Nuevo Plan
   - Verify food header row visible, macros lock on selection, unlock on clear

---

## 📋 General Rules for this Workspace
* Keep all Gherkin test suite updates localized in Spanish in [`compendio_casos_prueba.feature`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/documents/compendio_casos_prueba.feature).
* Do NOT implement any 3D body mannequin virtual rotations or deform tests as the user explicitly asked to delete 3D model actions.
* Keep edits to [`client.js`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/client/client.js) and [`trainer.js`](file:///c:/Users/sonic/OneDrive/Escritorio/PR/web/trainer/trainer.js) aligned with the read-only and date transition constraints from v2.0.11.
* The `test_ux/` folder is the active UX prototype — do NOT modify production files (`web/trainer/`, `web/client/`) unless the user explicitly approves migration.
* Port `8081` = UX Prototype. Port `8080` = Production. Both share the same SQLite database.
* Password hashes must NEVER appear in API responses unless the caller sends a valid `X-Admin-Passcode` header.
