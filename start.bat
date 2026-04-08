@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo    ██╗   ██╗ ██████╗ ██╗   ██╗████████╗██╗   ██╗██████╗ ███████╗
echo    ╚██╗ ██╔╝██╔═══██╗██║   ██║╚══██╔══╝██║   ██║██╔══██╗██╔════╝
echo     ╚████╔╝ ██║   ██║██║   ██║   ██║   ██║   ██║██████╔╝█████╗
echo      ╚██╔╝  ██║   ██║██║   ██║   ██║   ██║   ██║██╔══██╗██╔══╝
echo       ██║   ╚██████╔╝╚██████╔╝   ██║   ╚██████╔╝██████╔╝███████╗
echo       ╚═╝    ╚═════╝  ╚═════╝    ╚═╝    ╚═════╝ ╚═════╝ ╚══════╝
echo               ██████╗  ██╗      ██████╗ ██╗    ██╗███╗   ██╗██╗      ██████╗  █████╗ ██████╗ ███████╗██████╗
echo               ██╔══██╗ ██║     ██╔═══██╗██║    ██║████╗  ██║██║     ██╔═══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗
echo               ██║  ██║ ██║     ██║   ██║██║ █╗ ██║██╔██╗ ██║██║     ██║   ██║███████║██║  ██║█████╗  ██████╔╝
echo               ██║  ██║ ██║     ██║   ██║██║███╗██║██║╚██╗██║██║     ██║   ██║██╔══██║██║  ██║██╔══╝  ██╔══██╗
echo               ██████╔╝ ███████╗╚██████╔╝╚███╔███╔╝██║ ╚████║███████╗╚██████╔╝██║  ██║██████╔╝███████╗██║  ██║
echo               ╚═════╝  ╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝
echo.

:: ============================================================
:: AJOUTER FFMPEG LOCAL AU PATH (avant toute verification)
:: ============================================================
if exist "%~dp0ffmpeg\bin\ffmpeg.exe" (
    set "PATH=%~dp0ffmpeg\bin;%PATH%"
)

:: ============================================================
:: VERIFICATION RAPIDE : si deja installe, on saute tout
:: ============================================================
if not exist ".installed" goto FullCheck

set "QUICK_OK=1"
where node >nul 2>&1 || set "QUICK_OK="
where ffmpeg >nul 2>&1 || set "QUICK_OK="
if not exist node_modules set "QUICK_OK="

:: Trouver Python rapidement
call :FindPython
if not defined PYTHON_CMD set "QUICK_OK="

if defined QUICK_OK (
    echo   Environnement OK (verification rapide)
    goto SkipCheck
)

:FullCheck
echo.
echo   Verification des outils...
echo.

:: Detecter si winget est disponible
set "HAS_WINGET="
where winget >nul 2>&1 && set "HAS_WINGET=1"

:: ============================================================
:: 1. NODE.JS
:: ============================================================
echo [1/5] Verification de Node.js...
call :FindNode
if defined NODE_OK goto NodeDone

:: Methode 1 : winget
if defined HAS_WINGET (
    echo   Node.js non trouve. Installation via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >nul 2>&1
    call :RefreshPath
    call :FindNode
)
if defined NODE_OK goto NodeDone

:: Methode 2 : telechargement direct via PowerShell
echo   Node.js non trouve. Telechargement direct...
powershell -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; " ^
    "try { " ^
    "  $url = (Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest-v20.x/' -UseBasicParsing).Links | Where-Object { $_.href -match 'win-x64\.zip$' } | Select-Object -First 1 -ExpandProperty href; " ^
    "  if (-not $url) { $url = 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip' } else { $url = 'https://nodejs.org/dist/latest-v20.x/' + $url }; " ^
    "  Write-Host '  Telechargement de Node.js...'; " ^
    "  Invoke-WebRequest -Uri $url -OutFile '%~dp0node_temp.zip' -UseBasicParsing; " ^
    "  Write-Host '  Extraction...'; " ^
    "  Expand-Archive -Path '%~dp0node_temp.zip' -DestinationPath '%~dp0node_extract' -Force; " ^
    "  $dir = Get-ChildItem '%~dp0node_extract' -Directory | Select-Object -First 1; " ^
    "  if (Test-Path '%~dp0node_local') { Remove-Item '%~dp0node_local' -Recurse -Force }; " ^
    "  Move-Item $dir.FullName '%~dp0node_local'; " ^
    "  Remove-Item '%~dp0node_extract' -Recurse -Force -ErrorAction SilentlyContinue; " ^
    "  Remove-Item '%~dp0node_temp.zip' -Force -ErrorAction SilentlyContinue; " ^
    "  Write-Host '  Node.js installe localement.'; " ^
    "} catch { Write-Host \"  Echec telechargement Node.js: $_\" }"

if exist "%~dp0node_local\node.exe" (
    set "PATH=%~dp0node_local;%PATH%"
    call :FindNode
)

:NodeDone
if defined NODE_OK (
    echo   OK : Node.js detecte.
) else (
    echo   ATTENTION : Node.js non disponible. Le serveur ne pourra pas demarrer.
    echo   Installe-le depuis https://nodejs.org/ et relance start.bat
)

:: ============================================================
:: 2. PYTHON
:: ============================================================
echo [2/5] Verification de Python...
call :FindPython
if defined PYTHON_CMD goto PythonDone

:: Methode 1 : winget
if defined HAS_WINGET (
    echo   Python non trouve. Installation via winget...
    winget install Python.Python.3.12 --accept-source-agreements --accept-package-agreements >nul 2>&1
    call :RefreshPath
    call :FindPython
)
if defined PYTHON_CMD goto PythonDone

:: Methode 2 : telechargement Python embedded
echo   Python non trouve. Telechargement direct...
powershell -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; " ^
    "try { " ^
    "  Write-Host '  Telechargement de Python embeddable...'; " ^
    "  Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip' -OutFile '%~dp0python_temp.zip' -UseBasicParsing; " ^
    "  Write-Host '  Extraction...'; " ^
    "  Expand-Archive -Path '%~dp0python_temp.zip' -DestinationPath '%~dp0python_local' -Force; " ^
    "  Remove-Item '%~dp0python_temp.zip' -Force -ErrorAction SilentlyContinue; " ^
    "  Write-Host '  Telechargement de pip...'; " ^
    "  Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%~dp0python_local\get-pip.py' -UseBasicParsing; " ^
    "  $pth = Get-ChildItem '%~dp0python_local\python*._pth' | Select-Object -First 1; " ^
    "  if ($pth) { (Get-Content $pth.FullName) -replace '#import site','import site' | Set-Content $pth.FullName }; " ^
    "  & '%~dp0python_local\python.exe' '%~dp0python_local\get-pip.py' --no-warn-script-location 2>&1 | Out-Null; " ^
    "  Remove-Item '%~dp0python_local\get-pip.py' -Force -ErrorAction SilentlyContinue; " ^
    "  Write-Host '  Python installe localement.'; " ^
    "} catch { Write-Host \"  Echec telechargement Python: $_\" }"

if exist "%~dp0python_local\python.exe" (
    set "PATH=%~dp0python_local;%~dp0python_local\Scripts;%PATH%"
    set "PYTHON_CMD=%~dp0python_local\python.exe"
)

:PythonDone
if defined PYTHON_CMD (
    echo   OK : Python detecte via "%PYTHON_CMD%"
) else (
    echo   ATTENTION : Python non disponible. Les telechargements ne fonctionneront pas.
    echo   Installe-le depuis https://www.python.org/downloads/ et relance start.bat
)

:: ============================================================
:: 3. YT-DLP
:: ============================================================
echo [3/5] Verification de yt-dlp...
if not defined PYTHON_CMD goto YtdlpDone

%PYTHON_CMD% -m yt_dlp --version >nul 2>&1
if not errorlevel 1 goto YtdlpVersion

echo   yt-dlp non trouve. Installation via pip...
%PYTHON_CMD% -m pip install --upgrade pip >nul 2>&1
%PYTHON_CMD% -m pip install yt-dlp >nul 2>&1

%PYTHON_CMD% -m yt_dlp --version >nul 2>&1
if not errorlevel 1 goto YtdlpVersion

:: Fallback : yt-dlp standalone
echo   pip a echoue. Telechargement de yt-dlp standalone...
powershell -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; " ^
    "try { " ^
    "  Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '%~dp0yt-dlp.exe' -UseBasicParsing; " ^
    "  Write-Host '  yt-dlp.exe telecharge.'; " ^
    "} catch { Write-Host \"  Echec: $_\" }"

:YtdlpVersion
set "YTDLP_VER="
%PYTHON_CMD% -m yt_dlp --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%V in ('%PYTHON_CMD% -m yt_dlp --version 2^>nul') do set "YTDLP_VER=%%V"
)
if not defined YTDLP_VER (
    if exist "%~dp0yt-dlp.exe" (
        for /f "tokens=*" %%V in ('"%~dp0yt-dlp.exe" --version 2^>nul') do set "YTDLP_VER=%%V"
    )
)

:YtdlpDone
if defined YTDLP_VER (
    echo   OK : yt-dlp v%YTDLP_VER%
) else (
    echo   ATTENTION : yt-dlp non disponible.
)

:: ============================================================
:: 4. FFMPEG
:: ============================================================
echo [4/5] Verification de ffmpeg...

where ffmpeg >nul 2>&1
if not errorlevel 1 goto FfmpegDone

:: Methode 1 : winget
if defined HAS_WINGET (
    echo   ffmpeg non trouve. Installation via winget...
    winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements >nul 2>&1
    call :RefreshPath
    where ffmpeg >nul 2>&1
    if not errorlevel 1 goto FfmpegDone
)

:: Methode 2 : telechargement direct
echo   ffmpeg non trouve. Telechargement direct...
powershell -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; " ^
    "try { " ^
    "  Write-Host '  Telechargement de ffmpeg (environ 80 Mo)...'; " ^
    "  Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile '%~dp0ffmpeg_temp.zip' -UseBasicParsing; " ^
    "  Write-Host '  Extraction...'; " ^
    "  Expand-Archive -Path '%~dp0ffmpeg_temp.zip' -DestinationPath '%~dp0ffmpeg_extract' -Force; " ^
    "  $dir = Get-ChildItem '%~dp0ffmpeg_extract' -Directory | Select-Object -First 1; " ^
    "  if (Test-Path ($dir.FullName + '\bin\ffmpeg.exe')) { " ^
    "    if (Test-Path '%~dp0ffmpeg') { Remove-Item '%~dp0ffmpeg' -Recurse -Force }; " ^
    "    Move-Item $dir.FullName '%~dp0ffmpeg'; " ^
    "  }; " ^
    "  Remove-Item '%~dp0ffmpeg_extract' -Recurse -Force -ErrorAction SilentlyContinue; " ^
    "  Remove-Item '%~dp0ffmpeg_temp.zip' -Force -ErrorAction SilentlyContinue; " ^
    "  Write-Host '  ffmpeg installe avec succes.'; " ^
    "} catch { Write-Host \"  Echec telechargement ffmpeg: $_\" }"

if exist "%~dp0ffmpeg\bin\ffmpeg.exe" (
    set "PATH=%~dp0ffmpeg\bin;%PATH%"
)

:FfmpegDone
set "FF_VER="
where ffmpeg >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=3" %%V in ('ffmpeg -version 2^>nul ^| findstr /B "ffmpeg version"') do set "FF_VER=%%V"
)
if defined FF_VER (
    echo   OK : ffmpeg %FF_VER%
) else (
    echo   ATTENTION : ffmpeg non disponible. La conversion audio sera limitee.
)

:: ============================================================
:: 5. DEPENDANCES NPM
:: ============================================================
echo [5/5] Verification des dependances npm...
if not exist node_modules (
    where node >nul 2>&1
    if not errorlevel 1 (
        echo   Installation des dependances npm...
        call npm install >nul 2>&1
        if errorlevel 1 (
            echo   Nouvel essai npm install...
            call npm install
        )
    )
)
if exist node_modules (
    echo   OK : node_modules present.
) else (
    echo   ATTENTION : node_modules absent.
)

:: ============================================================
:: MARQUER COMME INSTALLE
:: ============================================================
echo installed=%date% %time%> ".installed"
echo.
echo   Verification terminee.

:SkipCheck

echo.

:: ============================================================
:: CREATION DES DOSSIERS ET FICHIERS
:: ============================================================
if not exist downloads mkdir downloads
if not exist data mkdir data
if not exist "data\library.json" (echo {"folders":[],"items":[]})> "data\library.json"
if not exist "data\profiles.json" (echo [])> "data\profiles.json"
if not exist "data\history.json" (echo [])> "data\history.json"
if not exist "data\queue.json" (echo [])> "data\queue.json"
if not exist "data\notifications.json" (echo [])> "data\notifications.json"
if not exist "data\flow.json" (echo {"tracks":[],"playlists":[]})> "data\flow.json"

:: ============================================================
:: AJOUTER LES OUTILS LOCAUX AU PATH (si presents)
:: ============================================================
if exist "%~dp0ffmpeg\bin\ffmpeg.exe" set "PATH=%~dp0ffmpeg\bin;%PATH%"
if exist "%~dp0node_local\node.exe" set "PATH=%~dp0node_local;%PATH%"
if exist "%~dp0python_local\python.exe" set "PATH=%~dp0python_local;%~dp0python_local\Scripts;%PATH%"

:: ============================================================
:: ICONE + RACCOURCI BUREAU
:: ============================================================
if not exist "icon.ico" (
    if exist "create-icon.js" (
        node create-icon.js >nul 2>&1
    )
)

set "SHORTCUT=%USERPROFILE%\Desktop\YouTube Downloader.lnk"
if not exist "%SHORTCUT%" (
    powershell -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1" -TargetPath "%~dp0start.bat" -WorkDir "%~dp0" -IconPath "%~dp0icon.ico" >nul 2>&1
)

:: ============================================================
:: VERIFICATION FINALE : node_modules
:: ============================================================
if not exist node_modules (
    call npm install >nul 2>&1
)

:: ============================================================
:: VERIFICATION : Node.js est obligatoire pour lancer le serveur
:: ============================================================
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   ======================================================
    echo   Node.js n'a pas pu etre installe automatiquement.
    echo   Installe-le depuis https://nodejs.org/ puis relance.
    echo   ======================================================
    echo.
    pause
    exit /b 1
)

:: ============================================================
:: LANCEMENT
:: ============================================================
echo.
echo ========================================
echo   Demarrage du serveur...
echo ========================================
echo.

set "SERVER_LOG=%~dp0server_error.log"
start "" /B cmd /c "node server.js 2>"%SERVER_LOG%""
set "WAIT_COUNT=0"

:WaitServer
timeout /t 1 /nobreak >nul
powershell -Command "(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', 3000)" >nul 2>&1
if not errorlevel 1 goto ServerReady

set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 30 (
    echo.
    echo   Le serveur met du temps a demarrer...
    if exist "%SERVER_LOG%" (
        echo   --- Erreurs du serveur ---
        type "%SERVER_LOG%"
        echo   -------------------------
    )
    echo   Essaie de lancer manuellement : node server.js
    pause
    exit /b 1
)
goto WaitServer

:ServerReady
if exist "%SERVER_LOG%" del "%SERVER_LOG%" >nul 2>&1
echo   Serveur demarre sur http://localhost:3000
start http://localhost:3000

echo.
echo   Appuie sur Ctrl+C pour arreter le serveur.
echo   (ou ferme cette fenetre)
echo.

:KeepAlive
powershell -Command "Get-Process node -ErrorAction SilentlyContinue" >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Le serveur s'est arrete.
    pause
    exit /b 0
)
timeout /t 5 /nobreak >nul
goto KeepAlive

:: ============================================================
:: FONCTIONS
:: ============================================================

:FindNode
set "NODE_OK="
where node >nul 2>&1
if not errorlevel 1 (
    node --version >nul 2>&1
    if not errorlevel 1 set "NODE_OK=1"
)
if not defined NODE_OK (
    if exist "%~dp0node_local\node.exe" (
        set "PATH=%~dp0node_local;%PATH%"
        "%~dp0node_local\node.exe" --version >nul 2>&1
        if not errorlevel 1 set "NODE_OK=1"
    )
)
goto :eof

:FindPython
set "PYTHON_CMD="
:: Tester le python local d'abord
if exist "%~dp0python_local\python.exe" (
    set "PYTHON_CMD=%~dp0python_local\python.exe"
    set "PATH=%~dp0python_local;%~dp0python_local\Scripts;%PATH%"
    goto :eof
)
:: Tester python
where python >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%V in ('python --version 2^>nul') do (
        echo %%V | findstr /B "Python" >nul 2>&1
        if not errorlevel 1 set "PYTHON_CMD=python"
    )
)
if defined PYTHON_CMD goto :eof

:: Tester py (Python Launcher)
where py >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%V in ('py --version 2^>nul') do (
        echo %%V | findstr /B "Python" >nul 2>&1
        if not errorlevel 1 set "PYTHON_CMD=py"
    )
)
if defined PYTHON_CMD goto :eof

:: Tester python3
where python3 >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%V in ('python3 --version 2^>nul') do (
        echo %%V | findstr /B "Python" >nul 2>&1
        if not errorlevel 1 set "PYTHON_CMD=python3"
    )
)
goto :eof

:RefreshPath
set "NEW_PATH="
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "WINGET_LINKS=%LOCALAPPDATA%\Microsoft\WinGet\Links"
set "PY_EXTRA="
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    set "PY_EXTRA=!PY_EXTRA!;%%D;%%D\Scripts"
)
set "PATH=%SYS_PATH%;%USR_PATH%;%WINGET_LINKS%;%ProgramFiles%\nodejs!PY_EXTRA!"
:: Remettre les outils locaux
if exist "%~dp0ffmpeg\bin\ffmpeg.exe" set "PATH=%~dp0ffmpeg\bin;%PATH%"
if exist "%~dp0node_local\node.exe" set "PATH=%~dp0node_local;%PATH%"
if exist "%~dp0python_local\python.exe" set "PATH=%~dp0python_local;%~dp0python_local\Scripts;%PATH%"
goto :eof
