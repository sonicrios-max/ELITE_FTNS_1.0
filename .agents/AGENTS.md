# Antigravity Developer Instructions - Migration v2.0.11

Welcome, Antigravity. You are pair programming with the user in this workspace. The project has been migrated and updated to **v2.0.11**. Please read these instructions carefully to maintain consistency and understand what was done and what needs to be verified or developed next.

---

## 🎯 Context & Active State
We are working on the **Elite Coaching** platform (a fitness coaching multi-tenant system with FastAPI backend and Vanilla JS/PWA client and trainer frontends). 

A test suite compendium has been written in Spanish Gherkin format at [compendio_casos_prueba.feature](file:///c:/Users/shinywos/Desktop/migration_v2.0.10/documents/compendio_casos_prueba.feature).

Here are the key changes implemented in **v2.0.11**:
1. **Workout Locking & Date Transition (Client Portal):**
   * File: [client.js](file:///c:/Users/shinywos/Desktop/migration_v2.0.10/web/client/client.js)
   * Behavior: When a new day begins, if no day has been selected for today in `localStorage` under `active_workout_day_${userId}_${todayStr}` and there are no checked exercises, the system automatically defaults `activeWorkoutDay` to `"rest"`.
   * This locks all workout cards (read-only checkboxes) and sets the status to "Día de Descanso" automatically, preventing carryover of the previous day's selection without requiring manual client action.
2. **Nutrition Autocomplete & Read-Only Macro Fields (Trainer Portal):**
   * File: [trainer.js](file:///c:/Users/shinywos/Desktop/migration_v2.0.10/web/trainer/trainer.js)
   * Behavior 1: Displays column titles ("Alimento", "Peso (g)", "Calorías (kcal)", "Proteínas (g)", "Carbohidratos (g)", "Grasas (g)") as a visible header row (`.food-header-row`) above the ingredient input rows instead of only inside placeholders.
   * Behavior 2: Implements `updateFieldsReadOnlyStatus`. When a food suggestion item from the library is selected, all macro inputs (Calories, Protein, Carbs, Fats) are set to `readonly` and visually disabled. Only the weight/grams field remains editable to dynamically scale values. If the food input is cleared or a custom text is typed, the fields become editable again.

---

## 🛠️ Verification & Testing Checkpoints
Please perform the following verification steps on this new device:
1. **Test Workout locking transition:**
   * Run the local server (`python server.py`).
   * Access the client portal (`http://localhost:8080/client/?userId=1`).
   * Select a training day (e.g. "Lunes: Empuje") to set it active.
   * Check some exercises.
   * Simulate a date change (e.g., in client JS console or system clock) and verify that the page defaults to "Día de Descanso" on the new date, keeping Monday's logs safe in the database and Monday's selection intact in `localStorage`.
2. **Test Nutrition Fields:**
   * Access the Trainer portal (`http://localhost:8080/trainer/`).
   * Go to "Planes de Nutrición" -> "Nuevo Plan".
   * Ensure that the columns are clearly labeled on top.
   * Search for a food item (e.g., "Arroz Blanco") and select it. Verify that the weight is editable, but the macro inputs become locked (readonly/grayed out) and scale automatically when changing weight. Clear the food name and ensure the fields are editable again.

---

## 📋 General Rules for this Workspace
* Keep all Gherkin test suite updates localized in Spanish in [compendio_casos_prueba.feature](file:///c:/Users/shinywos/Desktop/migration_v2.0.10/documents/compendio_casos_prueba.feature).
* Do NOT implement any 3D body mannequin virtual rotations or deform tests as the user explicitly asked to delete 3D model actions.
* Keep edits to [client.js](file:///c:/Users/shinywos/Desktop/migration_v2.0.10/web/client/client.js) and [trainer.js](file:///c:/Users/shinywos/Desktop/migration_v2.0.10/web/trainer/trainer.js) aligned with these read-only and date transition constraints.
