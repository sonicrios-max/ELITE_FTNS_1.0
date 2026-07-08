@echo off
echo Buscando procesos en el puerto 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8080" ^| find "LISTENING"') do taskkill /f /pid %%a
echo Reiniciando el servidor...
if exist venv\Scripts\python.exe (
    venv\Scripts\python.exe server.py
) else (
    python server.py
)
pause

