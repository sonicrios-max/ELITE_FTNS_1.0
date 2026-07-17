@echo off
echo Buscando procesos en el puerto 8081...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8081" ^| find "LISTENING"') do taskkill /f /pid %%a
echo Reiniciando el servidor en puerto 8081 (UX Prototipo Azul)...
set PORT=8081
if exist venv\Scripts\python.exe (
    venv\Scripts\python.exe server.py
) else (
    python server.py
)
pause
