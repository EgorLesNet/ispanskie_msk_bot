import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import express from 'express'
import { Telegraf, Markup } from 'telegraf'

const BOT_TOKEN = process.env.BOT_TOKEN
const ADMIN_ID = Number(process.env.ADMIN_ID)
const WEBAPP_URL = process.env.WEBAPP_URL
const PORT = Number(process.env.PORT || 3000)

if (!BOT_TOKEN || !ADMIN_ID || !WEBAPP_URL) {
  throw new Error('Set BOT_TOKEN, ADMIN_ID, WEBAPP_URL in .env')
}

const DB_PATH = path.join(process.cwd(), 'db.json')

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
}

function addPost({ category, text, authorId, authorName, isAdmin }) {
  const db = readDB()
  const post = {
    id: db.seq++,
    category,                 // news | biz | svc
    text,
    authorId,
    authorName,
    createdAt: new Date().toISOString(),
    status: isAdmin ? 'approved' : 'pending',
    source: isAdmin ? 'admin' : 'user'
  }
  db.posts.unshift(post)
  writeDB(db)
  return post
}

function setStatus(postId, status) {
  const db = readDB()
  const p = db.posts.find(x => x.id === postId)
  if (!p) return null
  p.status = status
  writeDB(db)
  return p
}

function pendingPosts(limit = 10) {
  const db = readDB()
  return db.posts.filter(p => p.status === 'pending').slice(0, limit)
}

function approvedPosts(category) {
  const db = readDB()
  return db.posts
    .filter(p => p.status === 'approved' && (!category || p.category === category))
    .slice(0, 100)
}

// ---- Web (Mini App) ----
const app = express()
app.use(express.static(path.join(process.cwd(), 'public')))

app.get('/api/posts', (req, res) => {
  const category = String(req.query.category || '')
  res.json({ ok: true, posts: approvedPosts(category || null) })
})

app.listen(PORT, () => console.log(`Web on http://localhost:${PORT}`))

// ---- Bot ----
const bot = new Telegraf(BOT_TOKEN)

function isAdmin(ctx) {
  return ctx.from?.id === ADMIN_ID
}

function webAppButton() {
  // WebApp запускается кнопкой web_app типа (внутри Telegram). 
  return Markup.keyboard([
    Markup.button.webApp('Открыть ленту района', WEBAPP_URL)
  ]).resize()
}

bot.start(async (ctx) => {
  await ctx.reply(
    'Лента района: новости / бизнес / услуги.\n\n' +
    'Подписчики: /sendnews, /sendbiz, /sendsvc\n' +
    'Админ: /pending',
    webAppButton()
  )
})

async function handleSubmit(ctx, category, text) {
  if (!text || !text.trim()) {
    await ctx.reply('Нужно написать текст после команды. Пример: /sendnews В подъезде починили дверь.')
    return
  }

  const post = addPost({
    category,
    text: text.trim(),
    authorId: ctx.from.id,
    authorName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
    isAdmin: isAdmin(ctx)
  })

  if (post.status === 'approved') {
    await ctx.reply(`Опубликовано (как админ), id=${post.id}.`)
    return
  }

  await ctx.reply(`Отправлено на проверку, id=${post.id}.`)

  // Уведомить админа сразу
  await bot.telegram.sendMessage(
    ADMIN_ID,
    `Новый пост на модерации #${post.id}\n` +
    `Категория: ${post.category}\n` +
    `Автор: ${post.authorName} (${post.authorId})\n\n` +
    post.text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Одобрить', `approve:${post.id}`),
        Markup.button.callback('❌ Отклонить', `reject:${post.id}`)
      ]
    ])
  )
}

bot.command('sendnews', (ctx) => handleSubmit(ctx, 'news', ctx.message.text.replace(/^\/sendnews(@\w+)?\s*/i, '')))
bot.command('sendbiz',  (ctx) => handleSubmit(ctx, 'biz',  ctx.message.text.replace(/^\/sendbiz(@\w+)?\s*/i,  '')))
bot.command('sendsvc',  (ctx) => handleSubmit(ctx, 'svc',  ctx.message.text.replace(/^\/sendsvc(@\w+)?\s*/i,  '')))

bot.command('pending', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Нет доступа.')
  const list = pendingPosts(10)
  if (!list.length) return ctx.reply('Нет постов на проверке.')

  for (const p of list) {
    await ctx.reply(
      `#${p.id} [${p.category}] от ${p.authorName} (${p.authorId})\n\n${p.text}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Одобрить', `approve:${p.id}`),
          Markup.button.callback('❌ Отклонить', `reject:${p.id}`)
        ]
      ])
    )
  }
})

bot.on('callback_query', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа', { show_alert: true })

  const data = ctx.callbackQuery.data || ''
  const [action, idStr] = data.split(':')
  const postId = Number(idStr)

  if (!postId) return ctx.answerCbQuery('Некорректный id')

  if (action === 'approve') {
    const p = setStatus(postId, 'approved')
    await ctx.answerCbQuery(p ? 'Одобрено' : 'Не найдено')
    return
  }
  if (action === 'reject') {
    const p = setStatus(postId, 'rejected')
    await ctx.answerCbQuery(p ? 'Отклонено' : 'Не найдено')
    return
  }

  await ctx.answerCbQuery('Неизвестное действие')
})

bot.launch()
console.log('Bot started')
