@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================================
echo   SchoolFlow Pro  —  Setup complet avec Neon PostgreSQL
echo ============================================================
echo.

REM ─── Votre base de donnees Neon ─────────────────────────────────
REM IMPORTANT: Remplacez par votre propre URL Neon PostgreSQL.
REM Inscrivez-vous sur https://neon.tech pour obtenir une base gratuite.
set NEON_DB_URL=
if "%NEON_DB_URL%"=="" (
    echo [ERROR] Veuillez configurer votre URL Neon PostgreSQL dans ce fichier.
    echo         Editez setup_windows.bat et remplacez la variable NEON_DB_URL.
    goto :EOF
)

echo [INFO] Base de donnees : Neon PostgreSQL (cloud)
echo.

REM ─── Prerequisites check ─────────────────────────────────────
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python non trouve. Installez Python 3.11+ depuis python.org
    goto :EOF
)

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN]  Node.js non trouve. Le frontend ne pourra pas demarrer.
    echo         Installez Node.js depuis https://nodejs.org
)

python --version
echo.

REM ─── 1. Installer les dependances Python ─────────────────────
echo [1/5] Installation des dependances Python ...
cd backend
pip install --upgrade pip >nul 2>&1
pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [ERROR] pip install a echoue. Verifiez requirements.txt.
    cd ..
    goto :EOF
)
echo       OK.
cd ..
echo.

REM ─── 2. Creer le fichier .env avec Neon ─────────────────────
echo [2/5] Creation du fichier .env avec la base Neon ...
if exist ".env" (
    echo [SKIP] .env existe deja. Supprimez-le et relancez pour le recreer.
) else (
    (
        echo # SchoolFlow Pro - Configuration avec Neon
        echo DEBUG=True
        echo LOG_LEVEL=DEBUG
        echo.
        echo DATABASE_URL=%NEON_DB_URL%
        echo DATABASE_URL_ASYNC=%NEON_DB_URL%
        echo DATABASE_URL_SYNC=%NEON_DB_URL%
        echo DATABASE_POOL_SIZE=10
        echo DATABASE_MAX_OVERFLOW=20
        echo.
        echo SECRET_KEY=CHANGE_ME_generate_a_32_char_secret_key_here
        echo ALGORITHM=HS256
        echo ACCESS_TOKEN_EXPIRE_MINUTES=30
        echo.
        echo VITE_API_URL=http://localhost:8000
        echo BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:5173
        echo.
        echo GROQ_API_KEY=
        echo GROQ_MODEL=llama-3.3-70b-versatile
        echo GROQ_MAX_TOKENS=4096
    ) > .env
    echo       OK.
)
echo.

REM ─── 3. Lancer les migrations Alembic ───────────────────────
echo [3/5] Migration de la base de donnees ...
cd backend
python -m alembic upgrade head
if %ERRORLEVEL% neq 0 (
    echo [WARN]  La migration a rencontre des erreurs. Verifiez la sortie ci-dessus.
)
cd ..
echo       OK.
echo.

REM ─── 4. Creer le super admin ────────────────────────────────
echo [4/5] Creation du super administrateur ...
cd backend
python -m scripts.create_admin
cd ..
echo.

REM ─── 5. Demarrer les serveurs ──────────────────────────────
echo [5/5] Demarrage des serveurs ...
echo.

REM Backend
echo [BACKEND] Demarrage sur http://localhost:8000 ...
start "SchoolFlow Backend" cmd /k "cd backend && python -m uvicorn app.main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

REM Frontend
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    if exist "node_modules" (
        echo [FRONTEND] Demarrage sur http://localhost:3000 ...
        start "SchoolFlow Frontend" cmd /k "npm run dev"
    ) else (
        echo [FRONTEND] Installation des dependances et demarrage ...
        call npm install
        start "SchoolFlow Frontend" cmd /k "npm run dev"
    )
) else (
    echo [SKIP] Node.js non installe. Frontend non demarre.
)

echo.
echo ============================================================
echo   Setup termine !
echo ============================================================
echo.
echo   Frontend :  http://localhost:3000
echo   Backend  :  http://localhost:8000
echo   API Docs :  http://localhost:8000/docs
echo.
echo   Login    :  (defini via ADMIN_DEFAULT_EMAIL dans .env)
echo   Password :  (defini via ADMIN_DEFAULT_PASSWORD dans .env)
echo.
echo   IMPORTANT : Configurez vos identifiants dans le fichier .env avant le 1er lancement !
echo ============================================================
echo.

pause
