@echo off
REM ODM 캐시 미리받기 — Windows 작업 스케줄러에서 호출한다.
REM 식약처가 매일 09:00~19:00 Open API 를 제한 운영하므로 저녁에 실행해야 한다.
REM 로그: logs\fetch-odm.log

setlocal
cd /d "%~dp0.."
if not exist "logs" mkdir "logs"

echo. >> "logs\fetch-odm.log"
echo ===== %DATE% %TIME% ===== >> "logs\fetch-odm.log"
"C:\Program Files\nodejs\node.exe" "scripts\fetch-odm-cache.mjs" >> "logs\fetch-odm.log" 2>&1
echo [exit %ERRORLEVEL%] >> "logs\fetch-odm.log"

exit /b %ERRORLEVEL%
