@echo off
title Portal de Notificacoes - SENAI FATESG
echo =======================================================
echo    PORTAL DE NOTIFICACOES POR REGIAO - SENAI FATESG
echo    Projeto Integrador - Sistema Comunitario Geoespacial
echo =======================================================
echo.
cd /d "%~dp0backend"
echo [1/2] Iniciando API REST e Servidor Web...
start http://localhost:3001
npm.cmd run dev
pause

