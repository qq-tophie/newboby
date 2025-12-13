# RobBob Launcher - Руководство по сборке и деплою

## Архитектура

Система состоит из **двух частей**:

1. **Лаунчер (Bootstrapper)** - маленький exe (~15-20MB)
   - Пользователь скачивает ОДИН раз
   - При запуске проверяет/скачивает основное приложение
   - Автоматически обновляет RobBob
   
2. **RobBob App** - основное приложение (zip архив на сервере)
   - Содержит весь функционал: интерфейс, bypass, настройки
   - Скачивается и обновляется лаунчером

---

## Настройка сервера

### 1. Создайте структуру файлов на сервере

```
https://your-server.com/robbob/
├── version.json          <- информация о версии
├── RobBob-App.zip        <- архив с приложением
└── news.json             <- новости (опционально)
```

### 2. Формат version.json

```json
{
  "version": "1.0.0",
  "downloadUrl": "https://your-server.com/robbob/RobBob-App.zip"
}
```

### 3. Содержимое RobBob-App.zip

Архив должен содержать собранное Electron приложение:
```
RobBob-App.zip/
├── RobBob.exe              <- главный исполняемый файл
├── resources/
│   ├── app.asar            <- код приложения
│   └── bypass/             <- файлы обхода (winws.exe и др.)
├── locales/
└── ...остальные файлы Electron...
```

---

## Сборка Лаунчера (Bootstrapper)

### 1. Настройте URL в main.js

```javascript
const CONFIG = {
  versionUrl: 'https://your-server.com/robbob/version.json',
  appDownloadUrl: 'https://your-server.com/robbob/RobBob-App.zip',
  appFolder: 'RobBob',
  appExecutable: 'RobBob.exe',
  versionFile: 'version.txt'
};
```

### 2. Установите зависимости и соберите

```bash
cd bootstrapper/electron-bootstrapper
npm install
npm run build
```

### 3. Готовые файлы

После сборки в папке `dist/`:
- `RobBob Launcher-Setup.exe` - установщик
- `RobBob Launcher-Portable.exe` - портативная версия

**Этот exe (~15-20MB) даете пользователям для скачивания.**

---

## Сборка RobBob App (основное приложение)

### 1. В корневой папке проекта соберите приложение

```bash
npm install
npm run build
```

### 2. Создайте zip архив

Возьмите содержимое папки `dist/win-unpacked/` и заархивируйте в `RobBob-App.zip`

### 3. Загрузите на сервер

- Загрузите `RobBob-App.zip` на сервер
- Обновите `version.json` с новой версией

---

## Процесс обновления

### Когда вы хотите выпустить обновление:

1. Внесите изменения в код RobBob
2. Обновите версию в `package.json` (например: 1.0.0 → 1.1.0)
3. Соберите приложение: `npm run build`
4. Создайте `RobBob-App.zip` из `dist/win-unpacked/`
5. Загрузите zip на сервер
6. Обновите `version.json`:
   ```json
   {
     "version": "1.1.0",
     "downloadUrl": "https://your-server.com/robbob/RobBob-App.zip"
   }
   ```

**Готово!** При следующем запуске лаунчера пользователи автоматически получат обновление.

---

## Где хранятся файлы у пользователя

```
C:\Users\USERNAME\AppData\Roaming\RobBob\
├── version.txt           <- текущая версия
├── RobBob.exe            <- приложение
├── resources/
│   ├── app.asar
│   └── bypass/
└── ...
```

---

## Хостинг (варианты)

### Бесплатные:
- **GitHub Releases** - можно использовать как CDN
- **Cloudflare R2** - бесплатно до 10GB
- **Firebase Hosting** - бесплатный план

### Платные:
- Любой VPS с nginx (от $3/мес)
- Amazon S3
- DigitalOcean Spaces

---

## Требования к серверу

- Поддержка HTTPS (рекомендуется)
- Прямые ссылки на файлы (без редиректов на страницы скачивания)
- Достаточная скорость для скачивания ~100MB файлов

---

## Пример структуры для GitHub Releases

Если используете GitHub Releases:

1. В `main.js` измените URL:
```javascript
const CONFIG = {
  versionUrl: 'https://api.github.com/repos/YOUR/REPO/releases/latest',
  // ... 
};
```

2. Добавьте парсинг GitHub API в функцию `bootstrap()`

---

## Troubleshooting

### Лаунчер не может подключиться к серверу
- Проверьте URL в CONFIG
- Проверьте что CORS не блокирует запросы
- Проверьте что JSON валидный

### Приложение не запускается после скачивания
- Проверьте что exe называется правильно (CONFIG.appExecutable)
- Проверьте что zip архив имеет правильную структуру

### Обновление не работает
- Проверьте что version.json обновлен
- Очистите папку RobBob в AppData и попробуйте снова
