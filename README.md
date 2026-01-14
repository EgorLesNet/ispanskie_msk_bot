# Лента района — Telegram Mini App

Бот для сбора и модерации новостей района с веб-интерфейсом (Telegram Mini App).

## Возможности

- **Отправка новостей**: пользователи отправляют текст или фото в бот
- **Модерация**: посты от админа (`@fusuges`) публикуются сразу, остальные попадают на проверку
- **Мини-приложение**: веб-интерфейс открывается кнопкой в Telegram, показывает все одобренные новости
- **Фото**: поддержка изображений в новостях

## Установка

### 1. Склонировать репозиторий

```bash
git clone https://github.com/EgorLesNet/ispanskie_msk_bot.git
cd ispanskie_msk_bot
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Настроить переменные окружения

Создай файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Открой `.env` и заполни:

```
BOT_TOKEN=<токен_бота_от_@BotFather>
ADMIN_USERNAME=fusuges
WEBAPP_URL=https://<твой_домен_или_туннель>/
PORT=3000
```

### 4. Получить токен бота

1. Открой [@BotFather](https://t.me/BotFather) в Telegram
2. Отправь `/newbot`
3. Введи имя бота и username
4. Скопируй токен и вставь в `.env`

### 5. Настроить HTTPS (обязательно для Telegram Mini Apps)

Telegram Mini Apps требуют HTTPS. Есть 2 варианта:

**Вариант А: Cloudflare Tunnel (рекомендуется)**

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create ispanskie-bot
cloudflared tunnel route dns ispanskie-bot <твой_домен>
cloudflared tunnel run ispanskie-bot --url http://localhost:3000
```

**Вариант Б: ngrok**

```bash
brew install ngrok
ngrok http 3000
```

Скопируй HTTPS-URL из вывода и вставь в `.env` как `WEBAPP_URL`.

### 6. Запустить бота

```bash
npm start
```

## Использование

### Для подписчиков

1. Найти бота в Telegram
2. Нажать `/start`
3. Отправить текст или фото — это предложение новости
4. Ждать одобрения админа
5. Нажать кнопку «Открыть ленту района» для просмотра

### Для админа (@fusuges)

- Отправить текст/фото в бот — публикуется сразу
- Получать уведомления о новых постах с кнопками «✅ Одобрить» / «❌ Отклонить»
- `/pending` — показать все посты на модерации

## Структура проекта

```
ispanskie_msk_bot/
├── index.js              # Основной код: бот + веб-сервер
├── db_news.json          # База данных новостей (создаётся автоматически)
├── business.json         # Список бизнесов (для будущего функционала)
├── services.json         # Список услуг (для будущего функционала)
├── public/
│   └── index.html        # Интерфейс мини-приложения
├── package.json
├── .env.example
└── README.md
```

## Лицензия

Unlicense
