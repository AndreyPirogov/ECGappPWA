# Vitappio Holter MVP

PWA для самостоятельной установки холтера. Фронтенд — статические файлы (JS/HTML/CSS); бизнес-логика и прокси к MEDOM — **Java 21 + Spring Boot 3.3** в каталоге `backend-java`.

## Требования

- **Java 21** (JDK 21+)
- **Maven 3.9+** (или используйте Maven Wrapper, если добавлен)
- Браузер с поддержкой PWA (Chrome / Edge и т.д.)

## Быстрый старт

Рабочая папка — **корень репозитория** (где лежат `index.html`, `backend-java/`).

### 1. Backend (Java + Spring Boot)

```powershell
cd backend-java
mvn clean package -DskipTests
java -jar target/holter-backend-0.1.0.jar
```

Остановка:

```powershell
cd backend-java
mvn spring-boot:run
```

Backend стартует на **http://localhost:8000**.

Проверка:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

### 2. Фронтенд (отдельное окно терминала)

```powershell
cd ..   # в корень репозитория, если вы были в backend-java
python -m http.server 5500
```

Открыть в браузере: `http://localhost:5500/index.html`

### 3. Подключение к API

- При открытии с **localhost** или **127.0.0.1** по умолчанию подставляется **`http://127.0.0.1:8000`** (ваш Spring Boot).
- В сети (**192.168.x.x** и аналогично) по умолчанию — **`http://<ваш-хост>:8000`**.
- **Не указывайте** в настройках `https://medom.virtual-hospital.ru` при локальной разработке.

Настройка URL и логина MEDOM: иконка **шестерёнки** → поле URL Backend API и учётные данные.

## Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|---|---|---|
| `MEDOM_URL` | Базовый URL госпиталя MEDOM | `https://medom.virtual-hospital.ru` |
| `MEDOM_LOGIN` | Логин для MEDOM API | *(пусто)* |
| `MEDOM_PASSWORD` | Пароль для MEDOM API | *(пусто)* |

Переменные можно задать через `application.yml`, аргументы JVM (`-Dmedom.url=...`) или переменные окружения.

## Технологический стек

### Backend
- **Java 21**
- **Spring Boot 3.3** (Spring MVC, WebFlux WebClient, Validation, Actuator)
- **SLF4J + Logback** — логирование (консоль + файл `logs/vitappio.log`)
- **Jackson** — сериализация JSON (snake_case)
- In-memory хранилище (`ConcurrentHashMap`) — MVP без БД

### Frontend
- Vanilla JS, HTML5, CSS3
- PWA (Service Worker, Web App Manifest)
- Lucide Icons

## REST API

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | Health-check |
| POST | `/patients` | Создать пациента |
| POST | `/sessions` | Создать сессию |
| GET | `/sessions/{id}/status` | Статус сессии (сигнал, связь, заряд) |
| POST | `/sessions/{id}/events` | Добавить событие дневника |
| GET | `/sessions/{id}/events` | Список событий |
| POST | `/sessions/{id}/finish` | Завершить сессию |
| POST | `/patients/{id}/conclusion` | Загрузить заключение |
| GET | `/patients/{id}/conclusion` | Получить заключение |

### MEDOM прокси

| Метод | Путь |
|---|---|
| POST | `/medom/credentials` |
| GET | `/medom/ping` |
| GET | `/medom/contracts` |
| POST | `/medom/patients` |
| GET | `/medom/devices` |
| POST | `/medom/sessions` |
| POST | `/medom/sessions/{id}/finish` |
| POST | `/medom/sessions/{id}/events` |
| GET | `/medom/sessions` |

## Логирование

- **Консоль**: цветной вывод с уровнем, потоком и логгером
- **Файл**: `logs/vitappio.log` с ротацией (10 МБ / файл, 30 дней, макс. 200 МБ)
- **HTTP-доступ**: каждый запрос логируется: метод, путь, статус, время (мс)
- **Уровни**: `ru.vitappio` — DEBUG, остальные — INFO

## Actuator

Spring Boot Actuator доступен:
- `GET /actuator/health` — статус приложения
- `GET /actuator/info` — информация
- `GET /actuator/metrics` — метрики

## Кабинет врача

Запуск: `doctor.html` с того же HTTP-сервера, укажите API URL и ID пациента, загрузите HTML заключения.

## Структура проекта

```
ECGappPWA/
├── index.html              # Главный UI (PWA)
├── doctor.html             # Кабинет врача
├── app.js                  # Логика фронтенда
├── styles.css              # Стили
├── sw.js                   # Service Worker
├── manifest.webmanifest    # PWA манифест
├── static/                 # Изображения
│
└── backend-java/           # Java Spring Boot backend
    ├── pom.xml
    └── src/main/
        ├── java/ru/vitappio/holter/
        │   ├── VitappioApplication.java
        │   ├── config/             # CORS, WebClient, Logback, MedomProperties
        │   ├── controller/         # REST-контроллеры
        │   ├── dto/                # DTO (Java records)
        │   ├── service/            # Бизнес-логика
        │   └── exception/          # Обработка ошибок
        └── resources/
            ├── application.yml
            └── logback-spring.xml
```
