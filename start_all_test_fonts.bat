@echo off
echo Buscando procesos en los puertos 8081, 8082, 8083, 8084 y 8085...

for /f "tokens=5" %%a in ('netstat -aon ^| find ":8081" ^| find "LISTENING"') do taskkill /f /pid %%a
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8082" ^| find "LISTENING"') do taskkill /f /pid %%a
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8083" ^| find "LISTENING"') do taskkill /f /pid %%a
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8084" ^| find "LISTENING"') do taskkill /f /pid %%a
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8085" ^| find "LISTENING"') do taskkill /f /pid %%a

echo Iniciando Puerto 8081: Plus Jakarta Sans...
start /b cmd /c "set PORT=8081 && python server.py"
echo Iniciando Puerto 8082: Poppins...
start /b cmd /c "set PORT=8082 && python server.py"
echo Iniciando Puerto 8083: Outfit...
start /b cmd /c "set PORT=8083 && python server.py"
echo Iniciando Puerto 8084: Montserrat...
start /b cmd /c "set PORT=8084 && python server.py"
echo Iniciando Puerto 8085: Inter...
start /b cmd /c "set PORT=8085 && python server.py"

echo Todos los servidores de tipografia iniciados de forma paralela.
echo.
echo URL para comparar los 5 tipos de letra:
echo 1. Plus Jakarta Sans:  http://localhost:8081/
echo 2. Poppins:            http://localhost:8082/
echo 3. Outfit:             http://localhost:8083/
echo 4. Montserrat:         http://localhost:8084/
echo 5. Inter:              http://localhost:8085/
echo.
pause
