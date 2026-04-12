# Vitappio Holter MVP

## PowerShell: старт и остановка

### 1) Backend (Python API)

Старт:

```powershell
cd "D:\VitAPPSprots"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r .\backend\requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir .\backend
```

Остановка:

```powershell
# в окне, где запущен uvicorn
Ctrl + C
```

Проверка:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

### 2) Frontend (статический сервер)

Старт (в отдельном окне PowerShell):

```powershell
cd "D:\VitAPPSprots"
python -m http.server 5500
```

Остановка:

```powershell
# в окне, где запущен http.server
Ctrl + C
```

Открыть в браузере:

```text
http://localhost:5500/index.html
```

### 3) Подключить фронтенд к backend

В браузере откройте DevTools -> Console и выполните:

```js
localStorage.setItem("vitappio.apiBaseUrl", "http://localhost:8000");
location.reload();
```

## Запуск фронтенда

Откройте `index.html` в браузере или через любой локальный HTTP-сервер.

## Запуск Python backend

1. Перейдите в папку `backend`.
2. Установите зависимости:

```bash
pip install -r requirements.txt
```

3. Запустите сервер:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

4. Проверьте health:

```bash
http://localhost:8000/health
```

## Режим API

По умолчанию приложение работает в демо-режиме. Чтобы включить реальные запросы:

1. Откройте DevTools в браузере.
2. Выполните команду:

```js
localStorage.setItem("vitappio.apiBaseUrl", "http://localhost:8000");
location.reload();
```

После этого MVP начнет отправлять запросы:

- `POST /patients`
- `POST /sessions`
- `GET /sessions/{session_id}/status`
- `POST /sessions/{session_id}/events`
- `POST /sessions/{session_id}/finish`

Если API использует другие пути, измените их в `app.js`.
