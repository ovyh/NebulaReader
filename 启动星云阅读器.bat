@echo off
rem 备用启动器：直接用系统默认浏览器打开（若 .lnk 被安全策略拦截时使用）
start "" "%~dp0index.html"
exit /b
