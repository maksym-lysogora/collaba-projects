@echo off
rem Copies the tested tydzen.html into the built app. Quit the app from the tray first, then run this.
set "APPDIR=%~dp0dist\CollabaProjects-win32-x64\resources\app"
if not exist "%APPDIR%" (
  echo Program folder not found: %APPDIR%
  pause
  exit /b 1
)
copy /Y "%~dp0tydzen.html" "%APPDIR%\tydzen.html" >nul && echo Done. Start Collaba Projects again.
pause
