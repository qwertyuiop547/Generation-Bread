@echo off
REM Start Generation Bread backend with Daphne (ASGI) for WebSockets
cd /d "%~dp0"
if exist "venv\Scripts\activate.bat" call venv\Scripts\activate.bat
if exist "..\.venv\Scripts\activate.bat" call "..\.venv\Scripts\activate.bat"
echo Starting Daphne on http://127.0.0.1:8000 (HTTP + WebSocket)...
daphne -b 127.0.0.1 -p 8000 spylt_backend.asgi:application
