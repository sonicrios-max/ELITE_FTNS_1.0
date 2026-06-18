import sqlite3
import os

def verify_consistent_data():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    persistent_dir = os.environ.get("PERSISTENT_DIR", os.path.join(base_dir, "database"))
    db_path = os.path.join(persistent_dir, "fitness.db")
    
    print(f"Verifying data consistency in DB: {db_path}\n")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Get all active users
    c.execute("SELECT id, first_name, last_name FROM users ORDER BY id ASC")
    users = c.fetchall()
    
    if len(users) != 3:
        print(f"Error: Expected exactly 3 users, found {len(users)}: {users}")
        exit(1)
        
    print("Step 1: Checking basic table row counts:")
    print("=" * 50)
    tables = [
        "users", "exercises", "anthropometric_assessments", "skinfold_assessments",
        "daily_logs", "workout_plans", "workout_days", "workout_exercises",
        "workout_execution_logs", "set_logs", "nutrition_plans", "meals", "meal_items"
    ]
    for table in tables:
        c.execute(f"SELECT count(*) FROM {table}")
        count = c.fetchone()[0]
        print(f"  - Table {table:28}: {count} rows")
    print("=" * 50 + "\n")
    
    print("Step 2: Checking per-user data distributions:")
    print("=" * 50)
    print(f"{'User Name':30} | {'Assessments':11} | {'Daily Logs':10} | {'W_Plans':7} | {'Executions':10} | {'N_Plans':7}")
    print("-" * 90)
    
    user_counts = {}
    for u_id, first, last in users:
        full_name = f"{first} {last}"
        
        # Anthropometric assessments
        c.execute("SELECT count(*) FROM anthropometric_assessments WHERE user_id = ?", (u_id,))
        assessments_count = c.fetchone()[0]
        
        # Daily logs
        c.execute("SELECT count(*) FROM daily_logs WHERE user_id = ?", (u_id,))
        daily_logs_count = c.fetchone()[0]
        
        # Workout plans
        c.execute("SELECT count(*) FROM workout_plans WHERE user_id = ?", (u_id,))
        w_plans_count = c.fetchone()[0]
        
        # Executions
        c.execute("SELECT count(*) FROM workout_execution_logs WHERE user_id = ?", (u_id,))
        executions_count = c.fetchone()[0]
        
        # Nutrition plans
        c.execute("SELECT count(*) FROM nutrition_plans WHERE user_id = ?", (u_id,))
        n_plans_count = c.fetchone()[0]
        
        print(f"{full_name:30} | {assessments_count:11d} | {daily_logs_count:10d} | {w_plans_count:7d} | {executions_count:10d} | {n_plans_count:7d}")
        
        user_counts[u_id] = {
            "assessments": assessments_count,
            "daily_logs": daily_logs_count,
            "w_plans": w_plans_count,
            "executions": executions_count,
            "n_plans": n_plans_count
        }
    print("=" * 50 + "\n")
    
    # Assertions for identical numbers
    print("Step 3: Asserting equality of historical records...")
    base_counts = user_counts[users[0][0]]
    all_equal = True
    
    for u_id, first, last in users[1:]:
        counts = user_counts[u_id]
        for metric, val in base_counts.items():
            if counts[metric] != val:
                print(f"  [FAIL] Discrepancy found! {first} {last} has {counts[metric]} {metric}, expected {val}")
                all_equal = False
            else:
                print(f"  [PASS] {first} {last} {metric} count matches ({val})")
                
    # Check deeper structural counts per plan/day/meal
    print("\nStep 4: Verifying routine and plan sub-structures...")
    # Days per workout plan
    c.execute("SELECT plan_id, COUNT(*) FROM workout_days GROUP BY plan_id")
    days_per_plan = c.fetchall()
    print("  - Workout days per plan (Expected exactly 3 per plan):")
    for plan_id, count in days_per_plan:
        print(f"    * Plan {plan_id}: {count} days")
        assert count == 3, f"Plan {plan_id} has {count} days, expected 3"
        
    # Exercises per workout day
    c.execute("SELECT workout_day_id, COUNT(*) FROM workout_exercises GROUP BY workout_day_id")
    ex_per_day = c.fetchall()
    print("  - Exercises per workout day (Expected exactly 3 per day):")
    for day_id, count in ex_per_day:
        print(f"    * Day {day_id}: {count} exercises")
        assert count == 3, f"Day {day_id} has {count} exercises, expected 3"
        
    # Sets per execution
    c.execute("SELECT workout_execution_id, COUNT(*) FROM set_logs GROUP BY workout_execution_id")
    sets_per_exec = c.fetchall()
    print("  - Set logs per execution (Expected 3 exercises * 4 sets = 12 sets per execution session):")
    for exec_id, count in sets_per_exec:
        assert count == 12, f"Execution {exec_id} has {count} set logs, expected 12"
    print("    * Verified all execution sessions contain exactly 12 set logs.")
    
    # Meals per nutrition plan
    c.execute("SELECT nutrition_plan_id, COUNT(*) FROM meals GROUP BY nutrition_plan_id")
    meals_per_plan = c.fetchall()
    print("  - Meals per nutrition plan (Expected exactly 3 per plan):")
    for plan_id, count in meals_per_plan:
        print(f"    * Plan {plan_id}: {count} meals")
        assert count == 3, f"Plan {plan_id} has {count} meals, expected 3"
        
    # Food items per meal
    c.execute("SELECT meal_id, COUNT(*) FROM meal_items GROUP BY meal_id")
    items_per_meal = c.fetchall()
    print("  - Food items per meal (Expected exactly 2 per meal):")
    for meal_id, count in items_per_meal:
        assert count == 2, f"Meal {meal_id} has {count} items, expected 2"
    print("    * Verified all meals contain exactly 2 food items.")
    
    if all_equal:
        print("\n=== VERIFICATION SUCCESSFUL: DATA IS PERFECTLY BALANCED AND CONSISTENT! ===")
    else:
        print("\n=== VERIFICATION FAILED: DISCREPANCIES DETECTED ===")
        exit(1)
        
    conn.close()

if __name__ == "__main__":
    verify_consistent_data()
