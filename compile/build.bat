@echo off
cd /d "%~dp0.."
node ./compile/build.cjs %*
pause
