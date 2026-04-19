@echo off
setlocal EnableDelayedExpansion

echo ========================================
echo   HABIT COACH -- Windows Setup
echo ========================================

set SCRIPT_DIR=%~dp0
set VENV_DIR=%SCRIPT_DIR%.venv
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT=%STARTUP_DIR%\HabitCoach.bat

:: Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.9+ from https://python.org
    pause
    exit /b 1
)

:: Check tkinter
python -c "import tkinter" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python tkinter not available.
    echo         Re-install Python and check "tcl/tk and IDLE" during setup.
    pause
    exit /b 1
)

echo.
echo --> Creating virtualenv at %VENV_DIR%
python -m venv "%VENV_DIR%"
if errorlevel 1 (
    echo [ERROR] Failed to create virtualenv.
    pause
    exit /b 1
)

echo --> Installing dependencies
"%VENV_DIR%\Scripts\pip.exe" install --upgrade pip --quiet
"%VENV_DIR%\Scripts\pip.exe" install -r "%SCRIPT_DIR%requirements.txt" --quiet
echo     Done.

echo.
echo --> Configuring .env
if not exist "%SCRIPT_DIR%.env" (
    copy "%SCRIPT_DIR%.env.example" "%SCRIPT_DIR%.env" >nul
    echo     Created .env from template.
    echo     Edit %SCRIPT_DIR%.env if you need to change credentials.
) else (
    echo     .env already exists -- skipping.
)

echo.
echo --> Adding to Windows Startup folder
(
echo @echo off
echo start "" "%VENV_DIR%\Scripts\pythonw.exe" "%SCRIPT_DIR%app.py"
) > "%SHORTCUT%"
echo     Created: %SHORTCUT%

echo.
echo ========================================
echo   Setup complete!
echo.
echo   The coach will launch automatically
echo   on your next Windows login.
echo.
echo   To start NOW:
echo   "%VENV_DIR%\Scripts\pythonw.exe" "%SCRIPT_DIR%app.py"
echo.
echo   To uninstall startup, delete:
echo   %SHORTCUT%
echo ========================================
pause
