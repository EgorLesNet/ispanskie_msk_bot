import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import express from 'express'
import { Telegraf, Markup } from 'telegraf'
import fetch from 'node-fetch'

const BOT_TOKEN = process.env.BOT_TOKEN
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'fusuges').toLowerCase()
const WEBAPP_URL = process.env.WEBAPP_URL
const PORT = Number(process.env.PORT || 3000)

if (!BOT_TOKEN || !WEBAPP_URL) {
  throw new Error('Set BOT_TOKEN and WEBAPP_URL in .env')
}

const DB_PATH = path.join(process.cwd(), 'db_news.json')
const BUSINESS_PATH = path.join(process.cwd(), 'business.json')
const SERVICES_PATH = path.join(process.cwd(), 'services.json')

function ensureFile(pathStr, defaultData) {
  if (!fs.existsSync(pathStr)) {
    fs.writeFileSync(pathStr, JSON.stringify(defaultData, null, 2))
  }
}

ensureFile(DB_PATH, { posts: [], seq: 1 })
ensureFile(BUSINESS_PATH, { items: [] })
ensureFile(SERVICES_PATH, { items: [] })

function readNewsDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
}
function writeNewsDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
}

function isAdminUser(from) {
  if (!from) return false
  if (!from.username) return false
  return from.username.toLowerCase() === ADMIN_USERNAME
}

function addNews({ text, author, isAdmin, photoFileId }) {
  const db = readNewsDB()
  const post = {
    id: db.seq++,
    text,
    authorId: author.id,
    authorName: [author.first_name, author.last_name].filter(Boolean).join(' '),
    authorUsername: author.username || null,
    createdAt: new Date().toISOString(),
    status: isAdmin ? 'approved' : 'pending',
    source: isAdmin ? 'admin' : 'user',
    photoFileId: photoFileId || null
  }
  db.posts.unshift(post)
  writeNewsDB(db)
  return post
}

function setNewsStatus(postId, status) {
  const db = readNewsDB()
  const p = db.posts.find(x => x.id === postId)
  if (!p) return null
  p.status = status
  writeNewsDB(db)
  return p
}

function pendingNews(limit = 10) {
  const db = readNewsDB()
  return db.posts.filter(p => p.status === 'pending').slice(0, limit)
}

function approvedNews() {
  const db = readNewsDB()
  return db.posts.filter(p => p.status === 'approved').slice(0, 100)
}

async function getFilePath(fileId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.ok || !data.result || !data.result.file_path) return null
  return data.result.file_path
}

const app = express()
app.use(express.static(path.join(process.cwd(), 'public')))

app.get('/api/news', async (req, res) => {
  const posts = approvedNews()
  const withPhotoUrls = []
  for (const p of posts) {
    let photoUrl = null
    if (p.photoFileId) {
      const filePath = await getFilePath(p.photoFileId).catch(() => null)
      if (filePath) {
        photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
      }
    }
    withPhotoUrls.push({ ...p, photoUrl })
  }
  res.json({ ok: true, posts: withPhotoUrls })
})

app.listen(PORT, () => console.log(`Web on http://localhost:${PORT}`))

const bot = new Telegraf(BOT_TOKEN)

function webAppButton() {
  return Markup.keyboard([
    Markup.button.webApp('Открыть ленту района', WEBAPP_URL)
  ]).resize()
}

bot.start(async (ctx) => {
  await ctx.reply(
    'Отправь текст или фото — это предложение новости.\n' +
    'Все новости после одобрения попадают в общую ленту.',
    webAppButton()
  )
})

bot.on('text', async (ctx) => {
  const text = ctx.message.text || ''
  await handleCreateNews(ctx, text, null)
})

bot.on('photo', async (ctx) => {
  const photos = ctx.message.photo || []
  if (!photos.length) return
  const biggest = photos[photos.length - 1]
  const caption = ctx.message.caption || ''
  await handleCreateNews(ctx, caption, biggest.file_id)
})

async function handleCreateNews(ctx, text, photoFileId) {
  const isAdmin = isAdminUser(ctx.from)
  const post = addNews({
    text: text || '',
    author: ctx.from,
    isAdmin,
    photoFileId
  })

  if (isAdmin) {
    await ctx.reply(`Новость опубликована как админ. ID=${post.id}`)
  } else {
    await ctx.reply(`Новость отправлена на модерацию. ID=${post.id}`)
  }

  const caption =
    `Новая новость #${post.id}\n` +
    `Автор: ${post.authorName} (@${post.authorUsername || 'нет'})\n` +
    `Статус: ${post.status}\n\n` +
    (post.text || '(без текста)')

  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Одобрить', `approve:${post.id}`),
      Markup.button.callback('❌ Отклонить', `reject:${post.id}`)
    ]
  ])

  if (post.photoFileId) {
    await bot.telegram.sendPhoto(
      `@${ADMIN_USERNAME}`,
      post.photoFileId,
      { caption, reply_markup: buttons.reply_markup }
    )
  } else {
    await bot.telegram.sendMessage(
      `@${ADMIN_USERNAME}`,
      caption,
      buttons
    )
  }
}

bot.command('pending', async (ctx) => {
  if (!isAdminUser(ctx.from)) return ctx.reply('Нет доступа.')
  const list = pendingNews(10)
  if (!list.length) return ctx.reply('Нет новостей на проверке.')

  for (const p of list) {
    const caption =
      `#${p.id} от ${p.authorName} (@${p.authorUsername || 'нет'})\n\n` +
      (p.text || '(без текста)')
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Одобрить', `approve:${p.id}`),
        Markup.button.callback('❌ Отклонить', `reject:${p.id}`)
      ]
    ])

    if (p.photoFileId) {
      await ctx.replyWithPhoto(p.photoFileId, { caption, reply_markup: buttons.reply_markup })
    } else {
      await ctx.reply(caption, buttons)
    }
  }
})

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data || ''
  const from = ctx.from
  if (!isAdminUser(from)) {
    await ctx.answerCbQuery('Нет доступа', { show_alert: true })
    return
  }

  const [action, idStr] = data.split(':')
  const postId = Number(idStr)
  if (!postId) {
    await ctx.answerCbQuery('Некорректный id')
    return
  }

  if (action === 'approve' || action === 'reject') {
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const p = setNewsStatus(postId, newStatus)
    if (!p) {
      await ctx.answerCbQuery('Не найдено')
      return
    }
    await ctx.answerCbQuery(newStatus === 'approved' ? 'Одобрено' : 'Отклонено')

    const resultText =
      newStatus === 'approved'
        ? `Новость #${p.id} одобрена и опубликована.`
        : `Новость #${p.id} отклонена.`

    await ctx.reply(resultText)
    return
  }

  await ctx.answerCbQuery('Неизвестное действие')
})

bot.launch()
console.log('Bot started')
