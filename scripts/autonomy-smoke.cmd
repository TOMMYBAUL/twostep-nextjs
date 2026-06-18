@echo off
REM Smoke test : valider que claude -p tourne en process autonome (non imbrique).
cd /d "C:\Users\Thomas\Desktop\IA\twostep-nextjs"
set LOG=logs\autonomy-smoke.log
echo [%date% %time%] START > "%LOG%"
claude -p "Reponds uniquement par le mot OK." --dangerously-skip-permissions >> "%LOG%" 2>&1
echo [%date% %time%] EXIT %errorlevel% >> "%LOG%"
