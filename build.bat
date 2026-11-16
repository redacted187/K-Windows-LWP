@echo off
rem Builds everything into dist\ using only what ships with Windows:
rem   1. the editor, bundled into one HTML file        (PowerShell)
rem   2. KLWPWallpaper.exe, the wallpaper + editor app (the .NET Framework C# compiler)
rem   3. "KLWP Wallpaper Setup.exe", the installer
rem Microsoft's WebView2 library is downloaded from nuget.org on the first run.
setlocal
cd /d "%~dp0"
set "LOG=%~dp0build_log.txt"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set "WV2=1.0.2592.51"
set "REFS=/r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll"
rem Windows' media controls (what is playing, play/pause/next) come from the WinRT metadata that ships with Windows 10/11
set "WINMD=%WINDIR%\System32\WinMetadata"
set "FW=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319"
set "RTREFS=/r:%WINMD%\Windows.Foundation.winmd /r:%WINMD%\Windows.Media.winmd /r:%WINMD%\Windows.Storage.winmd /r:%FW%\System.Runtime.WindowsRuntime.dll /r:%FW%\System.Runtime.dll /r:%FW%\System.Runtime.InteropServices.WindowsRuntime.dll /r:%FW%\System.Threading.Tasks.dll /r:%FW%\System.IO.dll"
echo Building KWLWP... > "%LOG%"

if not exist "%CSC%" (
  echo The .NET Framework C# compiler was not found at %CSC% >> "%LOG%"
  goto :failed
)

echo [1/4] Bundling the editor
powershell -NoProfile -ExecutionPolicy Bypass -File editor\build.ps1 >> "%LOG%" 2>&1
if not exist "editor\dist\KLWP Desktop Editor.html" goto :failed

echo [2/4] Getting the WebView2 library
if not exist "windows\lib\Microsoft.Web.WebView2.Core.dll" (
  if not exist windows\lib mkdir windows\lib
  powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest 'https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/%WV2%' -OutFile 'wv2.zip'; Expand-Archive -Force 'wv2.zip' 'wv2pkg'; foreach ($n in 'Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll') { $f = Get-ChildItem 'wv2pkg\lib' -Recurse -Filter $n | Where-Object { $_.FullName -match 'net4' } | Select-Object -First 1; Copy-Item $f.FullName 'windows\lib' }; Copy-Item 'wv2pkg\runtimes\win-x64\native\WebView2Loader.dll' 'windows\lib'" >> "%LOG%" 2>&1
  rmdir /s /q wv2pkg >nul 2>&1
  del wv2.zip >nul 2>&1
)
if not exist "windows\lib\Microsoft.Web.WebView2.Core.dll" goto :failed

echo [3/4] Compiling the app
if not exist dist mkdir dist
taskkill /im KLWPWallpaper.exe /f >nul 2>&1
del /q dist\KLWPWallpaper.exe >nul 2>&1
copy /y windows\lib\*.dll dist\ >nul
copy /y "editor\dist\KLWP Desktop Editor.html" dist\ >nul
echo ---- app, with Windows media controls >> "%LOG%"
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /define:WINRT /out:dist\KLWPWallpaper.exe /win32manifest:windows\assets\app.manifest /win32icon:windows\assets\app.ico %REFS% %RTREFS% /r:windows\lib\Microsoft.Web.WebView2.Core.dll /r:windows\lib\Microsoft.Web.WebView2.WinForms.dll windows\app\*.cs >> "%LOG%" 2>&1
if not exist dist\KLWPWallpaper.exe (
  echo ---- that did not work here: app with media keys only >> "%LOG%"
  "%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /out:dist\KLWPWallpaper.exe /win32manifest:windows\assets\app.manifest /win32icon:windows\assets\app.ico %REFS% /r:windows\lib\Microsoft.Web.WebView2.Core.dll /r:windows\lib\Microsoft.Web.WebView2.WinForms.dll windows\app\*.cs >> "%LOG%" 2>&1
)
if not exist dist\KLWPWallpaper.exe goto :failed

echo [4/4] Compiling the installer
del /q "dist\KLWP Wallpaper Setup.exe" >nul 2>&1
echo ---- installer >> "%LOG%"
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ "/out:dist\KLWP Wallpaper Setup.exe" /win32manifest:windows\assets\setup.manifest /win32icon:windows\assets\app.ico %REFS% /resource:dist\KLWPWallpaper.exe,app.exe /resource:dist\Microsoft.Web.WebView2.Core.dll,wv2core.dll /resource:dist\Microsoft.Web.WebView2.WinForms.dll,wv2forms.dll /resource:dist\WebView2Loader.dll,wv2loader.dll "/resource:dist\KLWP Desktop Editor.html,editor.html" windows\installer\Setup.cs >> "%LOG%" 2>&1
if not exist "dist\KLWP Wallpaper Setup.exe" goto :failed

echo BUILD OK >> "%LOG%"
echo.
echo Done. Everything is in the dist folder:
echo   dist\KLWP Wallpaper Setup.exe    the installer
echo   dist\KLWPWallpaper.exe           runs in place, without installing
echo   dist\KLWP Desktop Editor.html    the editor on its own, for any browser
echo.
pause
exit /b 0

:failed
echo BUILD FAILED >> "%LOG%"
echo.
echo The build failed. The details are in build_log.txt
pause
exit /b 1
