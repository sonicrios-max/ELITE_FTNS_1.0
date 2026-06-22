import urllib.request
import json
import time
from concurrent.futures import ThreadPoolExecutor

# URL del servidor en producción (Render)
BASE_URL = "https://elite-fitness-coaching.onrender.com"

def simulate_user_action(user_index):
    """Simula a un cliente de prueba (Cliente Azul) haciendo peticiones de lectura y escritura."""
    start_time = time.time()
    try:
        # Petición 1: Leer datos del cliente (ID 1 de coach_azul)
        req_get = urllib.request.Request(
            f"{BASE_URL}/api/clients/1",
            headers={"X-Trainer-Id": "coach_azul"}
        )
        with urllib.request.urlopen(req_get, timeout=10) as response:
            _ = response.read()
            
        # Petición 2: Enviar un log diario al inquilino de prueba (coach_azul)
        payload = {
            "user_id": 1,
            "date": "2026-06-22",
            "steps_count": 8000,
            "notes": f"Peticion de carga del hilo {user_index}"
        }
        req_post = urllib.request.Request(
            f"{BASE_URL}/api/daily_logs",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Trainer-Id": "coach_azul"}
        )
        with urllib.request.urlopen(req_post, timeout=10) as response:
            _ = response.read()

        duration = time.time() - start_time
        return True, duration
    except Exception as e:
        duration = time.time() - start_time
        print(f"Error en usuario {user_index}: {e}")
        return False, duration

def run_stress_test(concurrent_users, total_users_to_test):
    print("====================================================")
    print(f"Iniciando Prueba de Estrés en Producción en {BASE_URL}")
    print(f"Usuarios concurrentes activos: {concurrent_users}")
    print(f"Total de usuarios simulados:   {total_users_to_test}")
    print("====================================================\n")
    
    start_test = time.time()
    durations = []
    successes = 0
    failures = 0
    
    with ThreadPoolExecutor(max_workers=concurrent_users) as executor:
        # Reparte las tareas entre el grupo de hilos
        results = executor.map(simulate_user_action, range(total_users_to_test))
        for success, duration in results:
            durations.append(duration)
            if success:
                successes += 1
            else:
                failures += 1
                
    total_time = time.time() - start_test
    avg_latency = (sum(durations) / len(durations)) if durations else 0
    
    print("\n[RESULTADOS DE LA PRUEBA]")
    print(f"  - Total Peticiones completadas: {total_users_to_test * 2} (1 GET + 1 POST por usuario)")
    print(f"  - Flujos Exitosos:             {successes} ({successes/total_users_to_test*100:.1f}%)")
    print(f"  - Flujos Fallidos:             {failures} ({failures/total_users_to_test*100:.1f}%)")
    print(f"  - Tiempo Total de la prueba:   {total_time:.2f} segundos")
    print(f"  - Latencia Promedio por flujo: {avg_latency*1000:.1f} ms")
    print(f"  - Rendimiento del Servidor:    {(total_users_to_test*2)/total_time:.1f} peticiones/segundo")

if __name__ == "__main__":
    # Simular 5 usuarios haciendo peticiones al mismo tiempo, con un total de 10 flujos de usuario
    run_stress_test(concurrent_users=25, total_users_to_test=100)
