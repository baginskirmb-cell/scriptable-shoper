const ORDERS_RANGE = "today" // "today", "7d", "14d", "30d"
const THEME = "night" // "night" albo "day"

const USE_DEMO_DATA = false
const DEBUG_API = false

const SHOP_BASE_URL = "https://twoj_sklep.pl"

const SHOPER_CLIENT_ID_KEY = "shoper_client_id"
const SHOPER_API_TOKEN_KEY = "shoper_api_token"

const AUTH_MODE = "bearer_token" // "bearer_token", "basic_direct", "auth_endpoint", "auto"

const REFRESH_MINUTES = 120
const CACHE_MINUTES = 60

const PAGE_LIMIT = 50
const MAX_ORDER_PAGES = 4

const EXCLUDED_STATUS_KEYWORDS = ["anul", "cancel", "cancelled", "zwrot", "refunded"]

const RANGE_CONFIG = {
  today: {
    days: 1,
    title: "Dzisiaj"
  },
  "7d": {
    days: 7,
    title: "7 dni"
  },
  "14d": {
    days: 14,
    title: "14 dni"
  },
  "30d": {
    days: 30,
    title: "30 dni"
  }
}

const CFG = {
  width: 510,
  height: 510,
  cornerRadius: 70
}

const THEMES = {
  night: {
    bg: "#06111b",
    bgDeep: "#030911",
    bgGlowBlue: "#0b2944",
    bgGlowGreen: "#123d25",
    panel: "#0b1621",
    text: "#f5f7fb",
    subtext: "#aeb8c5",
    muted: "#7e8a99",
    green: "#58f04f",
    greenSoft: "#9af26f",
    line: "#253646",
    border: "#ffffff",
    baseAlpha: 1,
    deepAlpha: 0.34,
    panelAlpha: 0.40,
    borderAlpha: 0.13,
    topGlassAlpha: 0.025
  },
  day: {
    bg: "#f5f8fc",
    bgDeep: "#eaf1f8",
    bgGlowBlue: "#d8e9fb",
    bgGlowGreen: "#c9f3dc",
    panel: "#ffffff",
    text: "#102033",
    subtext: "#5f6b7a",
    muted: "#8a96a6",
    green: "#16a34a",
    greenSoft: "#22c55e",
    line: "#cbd5e1",
    border: "#0f172a",
    baseAlpha: 1,
    deepAlpha: 0.22,
    panelAlpha: 0.62,
    borderAlpha: 0.10,
    topGlassAlpha: 0.12
  }
}

const COLORS = THEMES[THEME]
const CURRENT_RANGE = RANGE_CONFIG[ORDERS_RANGE] || RANGE_CONFIG.today

let AUTH_HEADERS_CACHE = null

function getCredentials() {
  const clientId = Keychain.get(SHOPER_CLIENT_ID_KEY)
  const apiToken = Keychain.get(SHOPER_API_TOKEN_KEY)

  if ((!clientId || !apiToken) && !USE_DEMO_DATA) {
    throw new Error("Brak danych API w Keychain: shoper_client_id / shoper_api_token")
  }

  return {
    clientId: clientId,
    apiToken: apiToken
  }
}

function base64(value) {
  return Data.fromString(value).toBase64String()
}

function baseHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Scriptable Shoper Orders Count Widget"
  }
}

function getShopNameFromUrl() {
  return SHOP_BASE_URL
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatApiDate(date, endOfDay) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const t = endOfDay ? "23:59:59" : "00:00:00"
  return y + "-" + m + "-" + d + " " + t
}

function formatTime(date) {
  return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0")
}

function shortBody(text) {
  if (!text) return ""
  return String(text).replace(/\s+/g, " ").slice(0, 180)
}

function buildUrl(resource, page, filters) {
  const params = []

  if (page !== null && page !== undefined) {
    params.push("limit=" + PAGE_LIMIT)
    params.push("page=" + page)
  }

  if (filters) {
    params.push("filters=" + encodeURIComponent(JSON.stringify(filters)))
  }

  const query = params.length ? "?" + params.join("&") : ""
  return SHOP_BASE_URL + "/webapi/rest/" + resource + query
}

async function apiRequestJSON(url, headers, method, body) {
  const req = new Request(url)
  req.method = method || "GET"
  req.timeoutInterval = 20
  req.headers = headers

  if (body !== null && body !== undefined) {
    req.body = body
  }

  let text = ""

  try {
    text = await req.loadString()
  } catch (e) {
    const status = req.response && req.response.statusCode ? req.response.statusCode : 0

    return {
      ok: false,
      status: status,
      json: null,
      text: String(e.message || e)
    }
  }

  const status = req.response && req.response.statusCode ? req.response.statusCode : 0

  let json = null

  try {
    json = JSON.parse(text)
  } catch (e) {
    json = null
  }

  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: json,
    text: text
  }
}

function readDeep(obj, path) {
  try {
    return path.split(".").reduce(function(acc, key) {
      return acc && acc[key]
    }, obj)
  } catch (e) {
    return null
  }
}

function firstValue(obj, fields) {
  if (!obj) return null

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    const value = field.indexOf(".") >= 0 ? readDeep(obj, field) : obj[field]

    if (value !== undefined && value !== null && value !== "") {
      return value
    }
  }

  return null
}

function normalizeCollection(value) {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.filter(function(item) {
      return item && typeof item === "object"
    })
  }

  if (typeof value === "object") {
    const values = Object.values(value)

    return values.filter(function(item) {
      return item && typeof item === "object"
    })
  }

  return []
}

function extractCollection(json) {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== "object") return []

  const candidates = [
    json.list,
    json.data,
    json.items,
    json.result,
    json.results,
    json.collection,
    json.orders,
    json.data && json.data.list,
    json.data && json.data.items,
    json.result && json.result.list,
    json.result && json.result.items
  ]

  for (let i = 0; i < candidates.length; i++) {
    const arr = normalizeCollection(candidates[i])
    if (arr.length > 0) return arr
  }

  return normalizeCollection(json)
}

function parseDateValue(value) {
  if (!value) return null

  if (typeof value === "object") {
    return parseDateValue(firstValue(value, ["date", "value", "timestamp", "created", "created_at", "createdAt"]))
  }

  if (typeof value === "number") {
    const ms = value > 1000000000000 ? value : value * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }

  const text = String(value).trim()

  if (text === "0000-00-00" || text === "0000-00-00 00:00:00") return null

  if (/^\d+$/.test(text)) {
    const num = Number(text)
    const ms = num > 1000000000000 ? num : num * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }

  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)

  if (ymd) {
    const d = new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      Number(ymd[4] || 0),
      Number(ymd[5] || 0),
      Number(ymd[6] || 0)
    )

    return isNaN(d.getTime()) ? null : d
  }

  const d = new Date(text.replace(" ", "T"))
  return isNaN(d.getTime()) ? null : d
}

function getOrderDate(order) {
  return parseDateValue(firstValue(order, [
    "date",
    "date_add",
    "created_at",
    "createdAt",
    "createDate",
    "dateCreated",
    "order_date",
    "orderDate",
    "created",
    "ordered_at",
    "insert_date",
    "time",
    "status_date",
    "confirm_date",
    "date_confirm"
  ]))
}

function getOrderStatusText(order) {
  const value = firstValue(order, [
    "status",
    "status_id",
    "status_name",
    "statusName",
    "state",
    "order_status",
    "status.name",
    "status.title",
    "status.translation"
  ])

  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value).toLowerCase()

  return String(value).toLowerCase()
}

function shouldCountOrder(order) {
  const status = getOrderStatusText(order)
  if (!status) return true

  return !EXCLUDED_STATUS_KEYWORDS.some(function(word) {
    return status.indexOf(word) >= 0
  })
}

async function getAccessTokenViaAuthEndpoint(clientId, apiToken) {
  const headers = baseHeaders()
  headers.Authorization = "Basic " + base64(clientId + ":" + apiToken)

  const res = await apiRequestJSON(SHOP_BASE_URL + "/webapi/rest/auth", headers, "POST", "")

  if (!res.ok) {
    throw new Error("auth_endpoint " + res.status + ": " + shortBody(res.text))
  }

  const token = firstValue(res.json, [
    "access_token",
    "accessToken",
    "token",
    "data.access_token",
    "data.accessToken",
    "result.access_token",
    "result.token"
  ])

  if (!token) {
    throw new Error("auth_endpoint: brak access_token w odpowiedzi")
  }

  return token
}

async function getWorkingAuthHeaders() {
  if (AUTH_HEADERS_CACHE) return AUTH_HEADERS_CACHE

  const cred = getCredentials()

  if (AUTH_MODE === "bearer_token") {
    const headers = baseHeaders()
    headers.Authorization = "Bearer " + cred.apiToken
    AUTH_HEADERS_CACHE = headers
    return headers
  }

  if (AUTH_MODE === "basic_direct") {
    const headers = baseHeaders()
    headers.Authorization = "Basic " + base64(cred.clientId + ":" + cred.apiToken)
    AUTH_HEADERS_CACHE = headers
    return headers
  }

  if (AUTH_MODE === "auth_endpoint") {
    const token = await getAccessTokenViaAuthEndpoint(cred.clientId, cred.apiToken)
    const headers = baseHeaders()
    headers.Authorization = "Bearer " + token
    AUTH_HEADERS_CACHE = headers
    return headers
  }

  const errors = []

  const strategies = [
    async function() {
      const h = baseHeaders()
      h.Authorization = "Bearer " + cred.apiToken
      return h
    },
    async function() {
      const h = baseHeaders()
      h.Authorization = "Basic " + base64(cred.clientId + ":" + cred.apiToken)
      return h
    },
    async function() {
      const token = await getAccessTokenViaAuthEndpoint(cred.clientId, cred.apiToken)
      const h = baseHeaders()
      h.Authorization = "Bearer " + token
      return h
    }
  ]

  for (let i = 0; i < strategies.length; i++) {
    try {
      const h = await strategies[i]()
      const testUrl = buildUrl("orders", 1, null)
      const test = await apiRequestJSON(testUrl, h, "GET", null)

      if (test.ok) {
        AUTH_HEADERS_CACHE = h
        return h
      }

      errors.push("HTTP " + test.status)
    } catch (e) {
      errors.push(String(e.message || e))
    }
  }

  throw new Error("Nie udało się połączyć z API Shopera: " + errors.join(" | "))
}

function cacheFilePath() {
  const fm = FileManager.local()
  const dir = fm.documentsDirectory()
  const safeShop = getShopNameFromUrl().replace(/[^a-z0-9]/gi, "_")
  return fm.joinPath(dir, "shoper_orders_count_" + safeShop + "_" + ORDERS_RANGE + ".json")
}

function loadCache() {
  if (USE_DEMO_DATA) return null

  try {
    const fm = FileManager.local()
    const path = cacheFilePath()

    if (!fm.fileExists(path)) return null

    const raw = fm.readString(path)
    const data = JSON.parse(raw)

    if (!data || !data.savedAt || data.count === undefined) return null

    const age = Date.now() - data.savedAt
    if (age > CACHE_MINUTES * 60 * 1000) return null

    return data
  } catch (e) {
    return null
  }
}

function saveCache(count) {
  if (USE_DEMO_DATA) return

  try {
    const fm = FileManager.local()
    const path = cacheFilePath()

    fm.writeString(path, JSON.stringify({
      savedAt: Date.now(),
      count: count
    }))
  } catch (e) {
    if (DEBUG_API) console.log("Cache save error: " + e)
  }
}

async function fetchOrdersCountFromApi() {
  const cached = loadCache()
  if (cached) return cached.count

  const headers = await getWorkingAuthHeaders()

  const today = startOfLocalDay(new Date())
  const firstDay = addDays(today, -(CURRENT_RANGE.days - 1))

  const filters = { date: {} }
  filters.date[">="] = formatApiDate(firstDay, false)

  const orders = []

  for (let page = 1; page <= MAX_ORDER_PAGES; page++) {
    const url = buildUrl("orders", page, filters)
    const res = await apiRequestJSON(url, headers, "GET", null)

    if (!res.ok) {
      throw new Error("Pobieranie zamówień: HTTP " + res.status + ": " + shortBody(res.text))
    }

    const list = extractCollection(res.json)

    if (!list.length) break

    for (let i = 0; i < list.length; i++) {
      const order = list[i]
      const date = getOrderDate(order)

      if (!date) continue

      const orderDay = startOfLocalDay(date)

      if (orderDay < firstDay || orderDay > today) continue
      if (!shouldCountOrder(order)) continue

      orders.push(order)
    }

    if (list.length < PAGE_LIMIT) break
  }

  const count = orders.length

  saveCache(count)

  return count
}

function makeDemoCount() {
  if (ORDERS_RANGE === "today") return 4
  if (ORDERS_RANGE === "7d") return 19
  if (ORDERS_RANGE === "14d") return 37
  if (ORDERS_RANGE === "30d") return 82
  return 0
}

function drawText(dc, value, x, y, w, h, size, color, bold) {
  dc.setTextAlignedLeft()
  dc.setFont(bold ? Font.boldSystemFont(size) : Font.mediumSystemFont(size))
  dc.setTextColor(new Color(color))
  dc.drawTextInRect(String(value), new Rect(x, y, w, h))
}

function drawTextCenter(dc, value, x, y, w, h, size, color, bold) {
  dc.setTextAlignedCenter()
  dc.setFont(bold ? Font.boldSystemFont(size) : Font.mediumSystemFont(size))
  dc.setTextColor(new Color(color))
  dc.drawTextInRect(String(value), new Rect(x, y, w, h))
  dc.setTextAlignedLeft()
}

function roundedRect(dc, x, y, w, h, r, color) {
  const path = new Path()
  const rr = Math.min(r, w / 2, h / 2)

  path.move(new Point(x + rr, y))
  path.addLine(new Point(x + w - rr, y))
  path.addQuadCurve(new Point(x + w, y + rr), new Point(x + w, y))
  path.addLine(new Point(x + w, y + h - rr))
  path.addQuadCurve(new Point(x + w - rr, y + h), new Point(x + w, y + h))
  path.addLine(new Point(x + rr, y + h))
  path.addQuadCurve(new Point(x, y + h - rr), new Point(x, y + h))
  path.addLine(new Point(x, y + rr))
  path.addQuadCurve(new Point(x + rr, y), new Point(x, y))
  path.closeSubpath()

  dc.addPath(path)
  dc.setFillColor(color)
  dc.fillPath()
}

function strokeRoundedRect(dc, x, y, w, h, r, color, lineWidth) {
  const path = new Path()
  const rr = Math.min(r, w / 2, h / 2)

  path.move(new Point(x + rr, y))
  path.addLine(new Point(x + w - rr, y))
  path.addQuadCurve(new Point(x + w, y + rr), new Point(x + w, y))
  path.addLine(new Point(x + w, y + h - rr))
  path.addQuadCurve(new Point(x + w - rr, y + h), new Point(x + w, y + h))
  path.addLine(new Point(x + rr, y + h))
  path.addQuadCurve(new Point(x, y + h - rr), new Point(x, y + h))
  path.addLine(new Point(x, y + rr))
  path.addQuadCurve(new Point(x + rr, y), new Point(x, y))
  path.closeSubpath()

  dc.addPath(path)
  dc.setStrokeColor(color)
  dc.setLineWidth(lineWidth || 2)
  dc.strokePath()
}

function panel(dc, x, y, w, h, r, alpha) {
  const a = alpha === undefined || alpha === null ? COLORS.panelAlpha : alpha

  roundedRect(dc, x, y, w, h, r || 34, new Color(COLORS.panel, a))
  strokeRoundedRect(dc, x, y, w, h, r || 34, new Color(COLORS.border, COLORS.borderAlpha), 2)
}

function drawBackground(dc) {
  roundedRect(dc, 0, 0, CFG.width, CFG.height, CFG.cornerRadius, new Color(COLORS.bg, COLORS.baseAlpha))
  roundedRect(dc, 0, 0, CFG.width, CFG.height, CFG.cornerRadius, new Color(COLORS.bgDeep, COLORS.deepAlpha))

  dc.setFillColor(new Color(COLORS.bgGlowBlue, THEME === "day" ? 0.20 : 0.15))
  dc.fillEllipse(new Rect(54, 28, 290, 290))

  dc.setFillColor(new Color(COLORS.bgGlowGreen, THEME === "day" ? 0.18 : 0.13))
  dc.fillEllipse(new Rect(260, 185, 260, 260))

  roundedRect(
    dc,
    8,
    8,
    CFG.width - 16,
    110,
    CFG.cornerRadius - 16,
    new Color("#ffffff", COLORS.topGlassAlpha)
  )

  strokeRoundedRect(
    dc,
    3,
    3,
    CFG.width - 6,
    CFG.height - 6,
    CFG.cornerRadius,
    new Color(COLORS.border, COLORS.borderAlpha),
    3
  )
}

function drawOrdersIcon(dc, x, y, size, color) {
  roundedRect(dc, x, y, size, size, 24, new Color(color, 0.11))
  strokeRoundedRect(dc, x, y, size, size, 24, new Color(color, 0.32), 2)

  const sheetX = x + size * 0.30
  const sheetY = y + size * 0.25
  const sheetW = size * 0.42
  const sheetH = size * 0.52

  strokeRoundedRect(dc, sheetX, sheetY, sheetW, sheetH, 6, new Color(color, 0.90), 5)

  dc.setFillColor(new Color(color, 0.90))
  dc.fillRect(new Rect(sheetX + size * 0.10, sheetY + size * 0.15, sheetW - size * 0.20, 5))
  dc.fillRect(new Rect(sheetX + size * 0.10, sheetY + size * 0.29, sheetW - size * 0.20, 5))
  dc.fillRect(new Rect(sheetX + size * 0.10, sheetY + size * 0.43, sheetW - size * 0.30, 5))
}

async function drawSmall(count) {
  const dc = new DrawContext()
  dc.size = new Size(CFG.width, CFG.height)
  dc.opaque = false
  dc.respectScreenScale = false

  drawBackground(dc)

  const shopName = getShopNameFromUrl()
  const now = new Date()

  drawOrdersIcon(dc, 42, 42, 78, COLORS.green)

  drawText(dc, "Zamówienia", 140, 48, 260, 36, 31, COLORS.text, true)
  drawText(dc, CURRENT_RANGE.title, 140, 84, 160, 28, 22, COLORS.subtext, false)

  dc.setFillColor(new Color(COLORS.green))
  dc.fillEllipse(new Rect(438, 62, 16, 16))

  panel(dc, 42, 142, 426, 232, 42, 0.34)

  drawTextCenter(dc, String(count), 42, 172, 426, 142, 132, COLORS.green, true)

  drawTextCenter(dc, shopName, 40, 404, 430, 30, 21, COLORS.subtext, false)
  drawTextCenter(dc, "aktualizacja " + formatTime(now), 40, 438, 430, 30, 21, COLORS.subtext, false)

  return dc.getImage()
}

async function buildWidget() {
  const count = USE_DEMO_DATA ? makeDemoCount() : await fetchOrdersCountFromApi()
  const image = await drawSmall(count)

  const widget = new ListWidget()
  widget.backgroundColor = new Color("#000000", 0)
  widget.setPadding(0, 0, 0, 0)

  const img = widget.addImage(image)
  img.centerAlignImage()
  img.applyFillingContentMode()

  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000)

  return widget
}

let widget

try {
  widget = await buildWidget()
} catch (e) {
  widget = new ListWidget()
  widget.backgroundColor = new Color(THEME === "day" ? "#f6f9fd" : "#07111c")
  widget.setPadding(14, 14, 14, 14)

  const title = widget.addText("Błąd zamówień")
  title.textColor = new Color(THEME === "day" ? "#102033" : "#ffffff")
  title.font = Font.boldSystemFont(13)

  widget.addSpacer(6)

  const msg = widget.addText(String(e.message || e))
  msg.textColor = new Color(THEME === "day" ? "#5f6b7a" : "#aeb8c5")
  msg.font = Font.systemFont(9)
  msg.lineLimit = 8
}

if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentSmall()
}

Script.complete()
