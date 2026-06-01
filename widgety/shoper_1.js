const WIDGET_SIZE = "large" // "medium" albo "large"
const THEME = "night" // "night" albo "day"

const USE_DEMO_DATA = false
const DEBUG_API = false

const SHOP_BASE_URL = "https://twoj_sklep.pl"
const ORDERS_ENDPOINT = "/webapi/rest/orders"

const SHOPER_CLIENT_ID_KEY = "shoper_client_id"
const SHOPER_API_TOKEN_KEY = "shoper_api_token"

const AUTH_MODE = "bearer_token"

const DAYS_TO_SHOW = 30
const REFRESH_MINUTES = 120
const MAX_PAGES = 4
const PAGE_LIMIT = 50
const USE_DATE_FILTER = true

const EXCLUDED_STATUS_KEYWORDS = ["anul", "cancel", "cancelled", "zwrot", "refunded"]

const CONFIG = {
  medium: { width: 1092, height: 510, cornerRadius: 70 },
  large: { width: 1092, height: 1146, cornerRadius: 86 }
}

const THEMES = {
  night: {
    bg: "#07111c",
    bgDeep: "#050b12",
    bgGlowBlue: "#0d2740",
    bgGlowGreen: "#0b3325",
    panel: "#0d141d",
    panelBorder: "#ffffff",
    text: "#f4f7fb",
    subtext: "#aeb8c5",
    muted: "#7d8794",
    green: "#39d353",
    greenSoft: "#9be9a8",
    line: "#203040",
    baseAlpha: 1,
    deepAlpha: 0.24,
    panelAlpha: 0.32,
    borderAlpha: 0.13,
    topGlassAlpha: 0.018
  },
  day: {
    bg: "#f5f8fc",
    bgDeep: "#eaf1f8",
    bgGlowBlue: "#d8e9fb",
    bgGlowGreen: "#c9f3dc",
    panel: "#ffffff",
    panelBorder: "#0f172a",
    text: "#102033",
    subtext: "#5f6b7a",
    muted: "#8a96a6",
    green: "#16a34a",
    greenSoft: "#36c879",
    line: "#cbd5e1",
    baseAlpha: 1,
    deepAlpha: 0.20,
    panelAlpha: 0.58,
    borderAlpha: 0.10,
    topGlassAlpha: 0.10
  }
}

const CFG = CONFIG[WIDGET_SIZE]
const COLORS = THEMES[THEME]

let AUTH_HEADERS_CACHE = null
let AUTH_MODE_USED = "API"

function getCredentials() {
  const clientId = Keychain.get(SHOPER_CLIENT_ID_KEY)
  const apiToken = Keychain.get(SHOPER_API_TOKEN_KEY)

  if ((!clientId || !apiToken) && !USE_DEMO_DATA) {
    throw new Error("Brak danych API w Keychain: " + SHOPER_CLIENT_ID_KEY + " / " + SHOPER_API_TOKEN_KEY)
  }

  return { clientId: clientId, apiToken: apiToken }
}

function base64(value) {
  return Data.fromString(value).toBase64String()
}

function baseHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Scriptable Shoper Sales Widget"
  }
}

function getShopNameFromUrl() {
  return SHOP_BASE_URL
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
}

function buildAuthUrl() {
  return SHOP_BASE_URL + "/webapi/rest/auth"
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

function buildOrdersUrl(page) {
  const params = ["limit=" + PAGE_LIMIT, "page=" + page]

  if (USE_DATE_FILTER) {
    const today = startOfLocalDay(new Date())
    const firstDay = addDays(today, -(DAYS_TO_SHOW - 1))

    const filters = { date: {} }
    filters.date[">="] = formatApiDate(firstDay, false)

    params.push("filters=" + encodeURIComponent(JSON.stringify(filters)))
  }

  return SHOP_BASE_URL + ORDERS_ENDPOINT + "?" + params.join("&")
}

async function apiRequestJSON(url, headers, method, body) {
  const req = new Request(url)
  req.method = method || "GET"
  req.timeoutInterval = 15
  req.headers = headers

  if (body !== null && body !== undefined) {
    req.body = body
  }

  let text = ""

  try {
    text = await req.loadString()
  } catch (e) {
    const status = req.response && req.response.statusCode ? req.response.statusCode : 0
    return { ok: false, status: status, json: null, text: String(e.message || e) }
  }

  const status = req.response && req.response.statusCode ? req.response.statusCode : 0

  let json = null

  try {
    json = JSON.parse(text)
  } catch (e) {
    json = null
  }

  return { ok: status >= 200 && status < 300, status: status, json: json, text: text }
}

function shortBody(text) {
  if (!text) return ""
  return String(text).replace(/\s+/g, " ").slice(0, 180)
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
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    const value = field.indexOf(".") >= 0 ? readDeep(obj, field) : obj[field]

    if (value !== undefined && value !== null && value !== "") {
      return value
    }
  }

  return null
}

function getTokenFromAuthResponse(json) {
  if (!json) return null

  return firstValue(json, [
    "access_token",
    "accessToken",
    "token",
    "data.access_token",
    "data.accessToken",
    "data.token",
    "result.access_token",
    "result.accessToken",
    "result.token"
  ])
}

async function getAccessTokenViaAuthEndpoint(clientId, apiToken) {
  const headers = baseHeaders()
  headers.Authorization = "Basic " + base64(clientId + ":" + apiToken)

  const res = await apiRequestJSON(buildAuthUrl(), headers, "POST", "")

  if (!res.ok) {
    throw new Error("auth_endpoint " + res.status + ": " + shortBody(res.text))
  }

  const token = getTokenFromAuthResponse(res.json)

  if (!token) {
    throw new Error("auth_endpoint: brak access_token w odpowiedzi")
  }

  return token
}

async function testAuthHeaders(headers) {
  const res = await apiRequestJSON(buildOrdersUrl(1), headers, "GET", null)

  if (!res.ok) {
    throw new Error(res.status + ": " + shortBody(res.text))
  }

  const list = extractOrderArray(res.json)

  if (!Array.isArray(list)) {
    throw new Error("odpowiedź OK, ale nie znaleziono listy zamówień")
  }

  return true
}

async function getWorkingAuthHeaders() {
  if (AUTH_HEADERS_CACHE) return AUTH_HEADERS_CACHE

  const cred = getCredentials()

  if (AUTH_MODE === "bearer_token") {
    AUTH_MODE_USED = "API"

    const headers = baseHeaders()
    headers.Authorization = "Bearer " + cred.apiToken

    AUTH_HEADERS_CACHE = headers
    return headers
  }

  if (AUTH_MODE === "basic_direct") {
    AUTH_MODE_USED = "API"

    const headers = baseHeaders()
    headers.Authorization = "Basic " + base64(cred.clientId + ":" + cred.apiToken)

    AUTH_HEADERS_CACHE = headers
    return headers
  }

  if (AUTH_MODE === "auth_endpoint") {
    const accessToken = await getAccessTokenViaAuthEndpoint(cred.clientId, cred.apiToken)

    AUTH_MODE_USED = "API"

    const headers = baseHeaders()
    headers.Authorization = "Bearer " + accessToken

    AUTH_HEADERS_CACHE = headers
    return headers
  }

  const errors = []

  const strategies = [
    async function() {
      const h = baseHeaders()
      h.Authorization = "Bearer " + cred.apiToken
      return { label: "API", headers: h }
    },
    async function() {
      const h = baseHeaders()
      h.Authorization = "Basic " + base64(cred.clientId + ":" + cred.apiToken)
      return { label: "API", headers: h }
    },
    async function() {
      const t = await getAccessTokenViaAuthEndpoint(cred.clientId, cred.apiToken)
      const h = baseHeaders()
      h.Authorization = "Bearer " + t
      return { label: "API", headers: h }
    }
  ]

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = await strategies[i]()
      await testAuthHeaders(result.headers)

      AUTH_MODE_USED = result.label
      AUTH_HEADERS_CACHE = result.headers

      return result.headers
    } catch (e) {
      errors.push(String(e.message || e))
    }
  }

  throw new Error("Nie udało się połączyć z API Shopera. " + errors.join(" | "))
}

async function fetchOrdersFromApi() {
  const orders = []
  const headers = await getWorkingAuthHeaders()

  const today = startOfLocalDay(new Date())
  const firstDay = addDays(today, -(DAYS_TO_SHOW - 1))

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = buildOrdersUrl(page)
    const res = await apiRequestJSON(url, headers, "GET", null)

    if (!res.ok) {
      throw new Error("Pobieranie zamówień: HTTP " + res.status + ": " + shortBody(res.text))
    }

    const list = extractOrderArray(res.json)

    if (DEBUG_API && page === 1) {
      console.log("API mode: " + AUTH_MODE_USED)
      console.log("URL: " + url)
      console.log("Orders found on page 1: " + list.length)
    }

    if (!list || list.length === 0) break

    orders.push.apply(orders, list)

    if (!USE_DATE_FILTER) {
      const parsedDates = list.map(function(order) {
        return getOrderDate(order)
      }).filter(Boolean)

      if (parsedDates.length > 0) {
        const oldestOnPage = parsedDates.reduce(function(oldest, d) {
          return d < oldest ? d : oldest
        }, parsedDates[0])

        if (oldestOnPage < firstDay) break
      }
    }

    if (list.length < PAGE_LIMIT) break
  }

  return orders
}

function extractOrderArray(json) {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== "object") return []

  const candidates = [
    json.list,
    json.data,
    json.orders,
    json.items,
    json.result,
    json.results,
    json.collection,
    json.data && json.data.list,
    json.data && json.data.orders,
    json.result && json.result.list,
    json.result && json.result.orders
  ]

  for (let i = 0; i < candidates.length; i++) {
    const arr = normalizeOrderCollection(candidates[i])
    if (arr.length > 0) return arr
  }

  return normalizeOrderCollection(json)
}

function normalizeOrderCollection(value) {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.filter(function(item) {
      return item && typeof item === "object"
    })
  }

  if (typeof value === "object") {
    const values = Object.values(value)
    const orderLike = values.filter(function(item) {
      return item && typeof item === "object" && looksLikeOrder(item)
    })

    if (orderLike.length > 0) return orderLike
  }

  return []
}

function looksLikeOrder(item) {
  if (!item || typeof item !== "object") return false

  const date = firstValue(item, [
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
    "confirm_date",
    "date_confirm",
    "status_date"
  ])

  const amount = firstValue(item, [
    "sum",
    "sum_noship",
    "total",
    "amount",
    "price",
    "order_sum",
    "total_sum",
    "payment_sum",
    "paid",
    "sum_price",
    "summary",
    "cost.total",
    "price.total",
    "payment.amount"
  ])

  const id = firstValue(item, ["id", "order_id", "orderId"])

  return date !== null || amount !== null || id !== null
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

  const dm = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)

  if (dm) {
    const d = new Date(
      Number(dm[3]),
      Number(dm[2]) - 1,
      Number(dm[1]),
      Number(dm[4] || 0),
      Number(dm[5] || 0),
      Number(dm[6] || 0)
    )

    return isNaN(d.getTime()) ? null : d
  }

  const variants = [
    text,
    text.replace(" ", "T"),
    text.replace(/\./g, "-").replace(" ", "T")
  ]

  for (let i = 0; i < variants.length; i++) {
    const d = new Date(variants[i])
    if (!isNaN(d.getTime())) return d
  }

  return null
}

function parseMoney(value) {
  if (value === null || value === undefined) return 0

  if (typeof value === "object") {
    return parseMoney(firstValue(value, ["value", "amount", "gross", "brutto", "total", "sum", "price"]))
  }

  if (typeof value === "number") return value

  const text = String(value)
    .replace(/\s/g, "")
    .replace("zł", "")
    .replace("PLN", "")
    .replace(",", ".")

  const num = Number(text)
  return isNaN(num) ? 0 : num
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

function getOrderAmount(order) {
  return parseMoney(firstValue(order, [
    "sum",
    "sum_noship",
    "total",
    "amount",
    "price",
    "order_sum",
    "total_sum",
    "payment_sum",
    "paid",
    "sum_price",
    "summary",
    "cost.total",
    "price.total",
    "payment.amount"
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

function formatDayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return y + "-" + m + "-" + d
}

function formatTime(date) {
  return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0")
}

function formatShortDate(date) {
  const months = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]
  return date.getDate() + " " + months[date.getMonth()]
}

function formatMoney(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

function prepareSalesData(rawOrders) {
  const today = startOfLocalDay(new Date())
  const firstDay = addDays(today, -(DAYS_TO_SHOW - 1))
  const days = []

  for (let i = 0; i < DAYS_TO_SHOW; i++) {
    const date = addDays(firstDay, i)

    days.push({
      date: date,
      key: formatDayKey(date),
      orders: 0,
      revenue: 0
    })
  }

  const dayMap = {}

  days.forEach(function(d) {
    dayMap[d.key] = d
  })

  for (let i = 0; i < rawOrders.length; i++) {
    const order = rawOrders[i]

    if (!shouldCountOrder(order)) continue

    const date = getOrderDate(order)
    if (!date) continue

    const day = startOfLocalDay(date)

    if (day < firstDay || day > today) continue

    const key = formatDayKey(day)

    if (!dayMap[key]) continue

    dayMap[key].orders += 1
    dayMap[key].revenue += getOrderAmount(order)
  }

  const todayData = dayMap[formatDayKey(today)] || { orders: 0, revenue: 0 }
  const totalOrders = days.reduce(function(sum, d) { return sum + d.orders }, 0)
  const totalRevenue = days.reduce(function(sum, d) { return sum + d.revenue }, 0)
  const avgBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0

  const bestDay = days.reduce(function(best, d) {
    if (!best || d.revenue > best.revenue) return d
    return best
  }, null)

  return {
    days: days,
    today: todayData,
    totalOrders: totalOrders,
    totalRevenue: totalRevenue,
    avgBasket: avgBasket,
    bestDay: bestDay
  }
}

function makeDemoOrders() {
  const orders = []
  const today = startOfLocalDay(new Date())

  for (let i = 0; i < DAYS_TO_SHOW; i++) {
    const date = addDays(today, -i)
    const count = Math.floor(Math.random() * 8) + (i % 5 === 0 ? 4 : 0)

    for (let j = 0; j < count; j++) {
      orders.push({
        date: date.toISOString(),
        total: Math.floor(Math.random() * 950) + 250,
        status: "paid"
      })
    }
  }

  return orders
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
  const panelAlpha = alpha === undefined || alpha === null ? COLORS.panelAlpha : alpha

  roundedRect(dc, x, y, w, h, r || 34, new Color(COLORS.panel, panelAlpha))
  strokeRoundedRect(dc, x, y, w, h, r || 34, new Color(COLORS.panelBorder, 0.065), 2)
}

function drawBackground(dc) {
  roundedRect(dc, 0, 0, CFG.width, CFG.height, CFG.cornerRadius, new Color(COLORS.bg, COLORS.baseAlpha))
  roundedRect(dc, 0, 0, CFG.width, CFG.height, CFG.cornerRadius, new Color(COLORS.bgDeep, COLORS.deepAlpha))

  dc.setFillColor(new Color(COLORS.bgGlowBlue, THEME === "day" ? 0.22 : 0.15))
  dc.fillEllipse(
    WIDGET_SIZE === "large"
      ? new Rect(80, 35, 460, 460)
      : new Rect(80, 20, 390, 390)
  )

  dc.setFillColor(new Color(COLORS.bgGlowGreen, THEME === "day" ? 0.20 : 0.11))
  dc.fillEllipse(
    WIDGET_SIZE === "large"
      ? new Rect(760, 130, 420, 420)
      : new Rect(760, 105, 300, 300)
  )

  roundedRect(
    dc,
    10,
    10,
    CFG.width - 20,
    WIDGET_SIZE === "large" ? 170 : 95,
    Math.max(18, CFG.cornerRadius - 18),
    new Color("#ffffff", COLORS.topGlassAlpha)
  )

  strokeRoundedRect(
    dc,
    3,
    3,
    CFG.width - 6,
    CFG.height - 6,
    CFG.cornerRadius,
    new Color(COLORS.panelBorder, COLORS.borderAlpha),
    3
  )
}

function drawBagIcon(dc, x, y, size, color) {
  roundedRect(dc, x, y, size, size, 22, new Color(color, 0.10))
  strokeRoundedRect(dc, x, y, size, size, 22, new Color(color, 0.30), 2)

  const bagX = x + size * 0.30
  const bagY = y + size * 0.42
  const bagW = size * 0.42
  const bagH = size * 0.32

  strokeRoundedRect(dc, bagX, bagY, bagW, bagH, 5, new Color(color, 0.88), 4)

  const handle = new Path()

  handle.move(new Point(bagX + bagW * 0.20, bagY))
  handle.addLine(new Point(bagX + bagW * 0.20, bagY - size * 0.12))
  handle.addQuadCurve(new Point(bagX + bagW * 0.80, bagY - size * 0.12), new Point(bagX + bagW * 0.50, bagY - size * 0.22))
  handle.addLine(new Point(bagX + bagW * 0.80, bagY))

  dc.addPath(handle)
  dc.setStrokeColor(new Color(color, 0.88))
  dc.setLineWidth(4)
  dc.strokePath()
}

function drawCartIcon(dc, x, y, size, color) {
  roundedRect(dc, x, y, size, size, 22, new Color(color, 0.10))
  strokeRoundedRect(dc, x, y, size, size, 22, new Color(color, 0.30), 2)

  const path = new Path()

  path.move(new Point(x + size * 0.24, y + size * 0.35))
  path.addLine(new Point(x + size * 0.34, y + size * 0.35))
  path.addLine(new Point(x + size * 0.42, y + size * 0.62))
  path.addLine(new Point(x + size * 0.72, y + size * 0.62))
  path.addLine(new Point(x + size * 0.78, y + size * 0.43))
  path.addLine(new Point(x + size * 0.38, y + size * 0.43))

  dc.addPath(path)
  dc.setStrokeColor(new Color(color, 0.88))
  dc.setLineWidth(4)
  dc.strokePath()

  dc.setFillColor(new Color(color, 0.88))
  dc.fillEllipse(new Rect(x + size * 0.43, y + size * 0.70, 8, 8))
  dc.fillEllipse(new Rect(x + size * 0.68, y + size * 0.70, 8, 8))
}

function drawWalletIcon(dc, x, y, size, color) {
  roundedRect(dc, x, y, size, size, 22, new Color(color, 0.10))
  strokeRoundedRect(dc, x, y, size, size, 22, new Color(color, 0.30), 2)

  strokeRoundedRect(dc, x + size * 0.27, y + size * 0.38, size * 0.50, size * 0.33, 6, new Color(color, 0.88), 4)

  dc.setFillColor(new Color(color, 0.88))
  dc.fillEllipse(new Rect(x + size * 0.65, y + size * 0.51, 7, 7))
}

function drawBasketIcon(dc, x, y, size, color) {
  roundedRect(dc, x, y, size, size, 22, new Color(color, 0.10))
  strokeRoundedRect(dc, x, y, size, size, 22, new Color(color, 0.30), 2)

  const path = new Path()

  path.move(new Point(x + size * 0.28, y + size * 0.48))
  path.addLine(new Point(x + size * 0.72, y + size * 0.48))
  path.addLine(new Point(x + size * 0.65, y + size * 0.70))
  path.addLine(new Point(x + size * 0.35, y + size * 0.70))
  path.closeSubpath()

  dc.addPath(path)
  dc.setStrokeColor(new Color(color, 0.88))
  dc.setLineWidth(4)
  dc.strokePath()

  const handle = new Path()

  handle.move(new Point(x + size * 0.38, y + size * 0.48))
  handle.addLine(new Point(x + size * 0.48, y + size * 0.34))
  handle.addLine(new Point(x + size * 0.62, y + size * 0.48))

  dc.addPath(handle)
  dc.setStrokeColor(new Color(color, 0.88))
  dc.setLineWidth(4)
  dc.strokePath()
}

function drawRefreshDot(dc, x, y, color) {
  dc.setFillColor(new Color(color, 0.18))
  dc.fillEllipse(new Rect(x - 6, y - 6, 24, 24))

  dc.setFillColor(new Color(color))
  dc.fillEllipse(new Rect(x, y, 12, 12))
}

function drawApiStatusInline(dc, x, y, color) {
  drawRefreshDot(dc, x, y + 2, color)
  drawText(dc, "API", x + 30, y - 4, 70, 28, 20, color, true)
}

function estimateTextWidth(text, fontSize) {
  let width = 0
  const s = String(text)

  for (let i = 0; i < s.length; i++) {
    const char = s[i]

    if (char === " ") width += fontSize * 0.38
    else if (char >= "0" && char <= "9") width += fontSize * 0.64
    else if (char === "." || char === "," || char === "'") width += fontSize * 0.24
    else width += fontSize * 0.55
  }

  return width
}

function drawMoneyValue(dc, value, x, y, w, h, mainSize, suffixSize, colorMain, colorSuffix) {
  const text = String(value)
  const suffix = "zł"

  let valueFont = mainSize
  let suffixFont = suffixSize
  let textWidth = estimateTextWidth(text, valueFont)

  const gap = valueFont >= 34 ? 16 : 10
  const suffixWidth = estimateTextWidth(suffix, suffixFont) + 12
  const maxTextWidth = w - suffixWidth - gap

  while (textWidth > maxTextWidth && valueFont > 20) {
    valueFont -= 2
    suffixFont = Math.max(14, suffixFont - 1)
    textWidth = estimateTextWidth(text, valueFont)
  }

  drawText(dc, text, x, y, w - suffixWidth - gap, h, valueFont, colorMain, true)

  drawText(
    dc,
    suffix,
    x + textWidth + gap,
    y + Math.round(valueFont * 0.25),
    suffixWidth + 8,
    h,
    suffixFont,
    colorSuffix,
    true
  )
}

function drawChart(dc, data, x, y, w, h, options) {
  options = options || {}

  const days = data.days
  const revenues = days.map(function(d) { return d.revenue })
  const orders = days.map(function(d) { return d.orders })

  const maxRevenue = Math.max.apply(null, revenues.concat([1]))
  const maxOrders = Math.max.apply(null, orders.concat([1]))

  const paddingLeft = options.paddingLeft || 72
  const paddingRight = options.paddingRight || 24
  const paddingTop = options.paddingTop || 28
  const paddingBottom = options.paddingBottom || 52

  const chartX = x + paddingLeft
  const chartY = y + paddingTop
  const chartW = w - paddingLeft - paddingRight
  const chartH = h - paddingTop - paddingBottom

  for (let i = 0; i <= 3; i++) {
    const yy = chartY + chartH - (chartH / 3) * i

    dc.setFillColor(new Color(COLORS.line, 0.50))
    dc.fillRect(new Rect(chartX, yy, chartW, 1))

    const labelValue = Math.round((maxRevenue / 3) * i)

    drawText(
      dc,
      i === 0 ? "0" : Math.round(labelValue / 1000) + "k",
      x + 18,
      yy - 12,
      50,
      24,
      options.axisFont || 20,
      COLORS.subtext,
      false
    )
  }

  const gap = options.barGap || 8
  const barW = Math.max(6, Math.floor((chartW - gap * (days.length - 1)) / days.length))

  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    const bh = Math.max(2, (d.revenue / maxRevenue) * chartH)
    const bx = chartX + i * (barW + gap)
    const by = chartY + chartH - bh

    if (d.revenue > 0) {
      roundedRect(dc, bx - 2, by - 4, barW + 4, bh + 4, Math.min(10, barW / 2 + 2), new Color(COLORS.green, 0.10))
    }

    roundedRect(dc, bx, by, barW, bh, Math.min(8, barW / 2), new Color(COLORS.green, 0.72))
  }

  if (options.showLine !== false) {
    const path = new Path()
    let started = false

    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      const bx = chartX + i * (barW + gap) + barW / 2
      const yy = chartY + chartH - (d.orders / maxOrders) * chartH

      if (!started) {
        path.move(new Point(bx, yy))
        started = true
      } else {
        path.addLine(new Point(bx, yy))
      }
    }

    dc.addPath(path)
    dc.setStrokeColor(new Color(COLORS.greenSoft, 0.88))
    dc.setLineWidth(options.lineWidth || 4)
    dc.strokePath()
  }

  const labelIndexes = [0, 7, 14, 21, 29]

  for (let i = 0; i < labelIndexes.length; i++) {
    const idx = labelIndexes[i]

    if (!days[idx]) continue

    const bx = chartX + idx * (barW + gap)

    drawTextCenter(
      dc,
      formatShortDate(days[idx].date),
      bx - 32,
      chartY + chartH + 14,
      92,
      28,
      options.dateFont || 18,
      COLORS.subtext,
      false
    )
  }
}

function drawStatCard(dc, x, y, w, h, title, value, subtitle, iconType, isMoney) {
  panel(dc, x, y, w, h, 34, COLORS.panelAlpha)

  drawText(dc, title, x + 30, y + 24, w - 60, 30, 22, COLORS.subtext, true)

  const iconX = x + 30
  const iconY = y + 75
  const iconSize = 72

  if (iconType === "cart") drawCartIcon(dc, iconX, iconY, iconSize, COLORS.green)
  if (iconType === "wallet") drawWalletIcon(dc, iconX, iconY, iconSize, COLORS.green)
  if (iconType === "basket") drawBasketIcon(dc, iconX, iconY, iconSize, COLORS.green)

  if (isMoney) {
    drawMoneyValue(dc, value, x + 120, y + 72, w - 145, 58, 47, 21, COLORS.text, COLORS.green)
  } else {
    drawText(dc, value, x + 120, y + 72, w - 150, 58, 54, COLORS.text, true)
  }

  drawText(dc, subtitle, x + 120, y + 128, w - 150, 30, 23, COLORS.green, true)
}

function drawBottomMetric(dc, x, y, w, title, value, subtitle, iconType, isMoney) {
  drawText(dc, title, x + 100, y + 4, w - 110, 28, 22, COLORS.subtext, true)

  if (isMoney) {
    drawMoneyValue(dc, value, x + 100, y + 38, w - 115, 44, 34, 17, COLORS.text, COLORS.green)
  } else {
    drawText(dc, value, x + 100, y + 38, w - 110, 44, 36, COLORS.text, true)
  }

  drawText(dc, subtitle, x + 100, y + 84, w - 110, 28, 21, COLORS.green, true)

  if (iconType === "calendar") drawBagIcon(dc, x + 20, y + 20, 62, COLORS.green)
  if (iconType === "orders") drawCartIcon(dc, x + 20, y + 20, 62, COLORS.green)
  if (iconType === "sum") drawWalletIcon(dc, x + 20, y + 20, 62, COLORS.green)
}

function drawMediumInfoCard(dc, x, y, w, h, title, value, subtitle, iconType, isMoney) {
  panel(dc, x, y, w, h, 30, COLORS.panelAlpha)

  const iconSize = 62
  const iconX = x + 24
  const iconY = y + 42

  if (iconType === "calendar") drawBagIcon(dc, iconX, iconY, iconSize, COLORS.green)
  if (iconType === "orders") drawCartIcon(dc, iconX, iconY, iconSize, COLORS.green)
  if (iconType === "sum") drawWalletIcon(dc, iconX, iconY, iconSize, COLORS.green)
  if (iconType === "basket") drawBasketIcon(dc, iconX, iconY, iconSize, COLORS.green)

  drawText(dc, title, x + 102, y + 26, w - 118, 28, 22, COLORS.subtext, true)

  if (isMoney) {
    drawMoneyValue(dc, value, x + 102, y + 58, w - 120, 38, 28, 15, COLORS.text, COLORS.green)
  } else {
    drawText(dc, value, x + 102, y + 58, w - 118, 38, 31, COLORS.text, true)
  }

  drawText(dc, subtitle, x + 102, y + 96, w - 118, 26, 20, COLORS.green, true)
}

async function drawLarge(data) {
  const dc = new DrawContext()
  dc.size = new Size(CFG.width, CFG.height)
  dc.opaque = false
  dc.respectScreenScale = false

  drawBackground(dc)

  const now = new Date()
  const shopName = getShopNameFromUrl()

  drawBagIcon(dc, 54, 54, 92, COLORS.green)

  drawText(dc, "Sprzedaż sklepu", 172, 62, 460, 52, 44, COLORS.text, true)
  drawText(dc, shopName, 172, 118, 280, 32, 25, COLORS.green, true)

  drawText(dc, "ostatnia aktualizacja", 690, 74, 230, 32, 22, COLORS.subtext, false)
  drawText(dc, formatTime(now), 930, 74, 82, 32, 25, COLORS.text, true)
  drawRefreshDot(dc, 1020, 82, COLORS.green)

  drawStatCard(dc, 54, 210, 300, 190, "ZAMÓWIENIA DZIŚ", String(data.today.orders), "zamówień", "cart", false)
  drawStatCard(dc, 396, 210, 300, 190, "SPRZEDAŻ DZIŚ", formatMoney(data.today.revenue), "przychód", "wallet", true)
  drawStatCard(dc, 738, 210, 300, 190, "ŚR. KOSZYK", formatMoney(data.avgBasket), "średnia", "basket", true)

  panel(dc, 54, 430, 984, 430, 34, COLORS.panelAlpha)

  drawText(dc, "SPRZEDAŻ — OSTATNIE 30 DNI", 88, 458, 430, 34, 25, COLORS.text, true)
  roundedRect(dc, 790, 470, 26, 8, 4, new Color(COLORS.green, 0.90))
  drawText(dc, "przychód", 825, 458, 170, 30, 21, COLORS.subtext, false)

  drawChart(dc, data, 88, 505, 900, 300, {
    paddingLeft: 72,
    paddingRight: 18,
    paddingTop: 18,
    paddingBottom: 48,
    barGap: 8,
    axisFont: 20,
    dateFont: 19,
    lineWidth: 4,
    showLine: true
  })

  panel(dc, 54, 890, 984, 150, 34, COLORS.panelAlpha)

  const best = data.bestDay || data.days[data.days.length - 1]

  drawBottomMetric(dc, 75, 915, 300, "NAJLEPSZY", formatShortDate(best.date), formatMoney(best.revenue) + " zł", "calendar", false)

  dc.setFillColor(new Color(COLORS.line, 0.45))
  dc.fillRect(new Rect(390, 922, 1, 92))

  drawBottomMetric(dc, 405, 915, 300, "30 DNI", String(data.totalOrders), "zamówień", "orders", false)

  dc.fillRect(new Rect(720, 922, 1, 92))

  drawBottomMetric(dc, 735, 915, 300, "SUMA 30 DNI", formatMoney(data.totalRevenue), "przychód", "sum", true)

  drawApiStatusInline(dc, 498, 1068, COLORS.green)

  return dc.getImage()
}

async function drawMedium(data) {
  const dc = new DrawContext()
  dc.size = new Size(CFG.width, CFG.height)
  dc.opaque = false
  dc.respectScreenScale = false

  drawBackground(dc)

  const now = new Date()
  const shopName = getShopNameFromUrl()
  const best = data.bestDay || data.days[data.days.length - 1]

  drawBagIcon(dc, 46, 42, 86, COLORS.green)

  drawText(dc, "Sprzedaż sklepu", 150, 48, 440, 46, 40, COLORS.text, true)
  drawText(dc, shopName, 150, 96, 360, 32, 25, COLORS.green, true)

  drawText(dc, "aktualizacja", 760, 62, 140, 30, 20, COLORS.subtext, false)
  drawText(dc, formatTime(now), 910, 62, 82, 30, 24, COLORS.text, true)
  drawRefreshDot(dc, 1010, 70, COLORS.green)

  panel(dc, 46, 150, 470, 124, 32, COLORS.panelAlpha)
  drawCartIcon(dc, 78, 181, 70, COLORS.green)
  drawText(dc, String(data.today.orders), 170, 170, 160, 58, 56, COLORS.text, true)
  drawText(dc, "zamówień dziś", 170, 226, 240, 30, 24, COLORS.green, true)

  panel(dc, 548, 150, 498, 124, 32, COLORS.panelAlpha)
  drawWalletIcon(dc, 580, 181, 70, COLORS.green)
  drawMoneyValue(dc, formatMoney(data.today.revenue), 672, 170, 300, 58, 44, 20, COLORS.text, COLORS.green)
  drawText(dc, "przychód dziś", 672, 226, 240, 30, 24, COLORS.green, true)

  drawMediumInfoCard(dc, 46, 298, 318, 148, "30 DNI", String(data.totalOrders), "zamówień", "orders", false)
  drawMediumInfoCard(dc, 386, 298, 318, 148, "SUMA 30 DNI", formatMoney(data.totalRevenue), "przychód", "sum", true)
  drawMediumInfoCard(dc, 726, 298, 320, 148, "NAJLEPSZY", formatShortDate(best.date), formatMoney(best.revenue) + " zł", "calendar", false)

  return dc.getImage()
}

async function buildWidget() {
  const rawOrders = USE_DEMO_DATA ? makeDemoOrders() : await fetchOrdersFromApi()
  const salesData = prepareSalesData(rawOrders)

  let image

  if (WIDGET_SIZE === "large") {
    image = await drawLarge(salesData)
  } else {
    image = await drawMedium(salesData)
  }

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
  widget.setPadding(16, 16, 16, 16)

  const title = widget.addText("Błąd widgetu sprzedaży")
  title.textColor = new Color(THEME === "day" ? "#102033" : "#ffffff")
  title.font = Font.boldSystemFont(14)

  widget.addSpacer(6)

  const msg = widget.addText(String(e.message || e))
  msg.textColor = new Color(THEME === "day" ? "#5f6b7a" : "#aeb8c5")
  msg.font = Font.systemFont(10)
  msg.lineLimit = 10
}

if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  if (WIDGET_SIZE === "large") {
    await widget.presentLarge()
  } else {
    await widget.presentMedium()
  }
}

Script.complete()
