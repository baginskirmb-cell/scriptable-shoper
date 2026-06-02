const WIDGET_SIZE = "medium" // "medium" albo "large"
const THEME = "night" // "night" albo "day"

const USE_DEMO_DATA = false
const DEBUG_API = false

const SHOP_BASE_URL = "https://twoj_sklep.pl"

const SHOPER_CLIENT_ID_KEY = "shoper_client_id"
const SHOPER_API_TOKEN_KEY = "shoper_api_token"

const AUTH_MODE = "bearer_token" 

const DAYS_TO_SHOW = 30
const REFRESH_MINUTES = 120
const CACHE_MINUTES = 90

const PAGE_LIMIT = 50
const MAX_ORDER_PAGES = 3
const MAX_ORDERS_TO_ANALYZE = 45
const MAX_PRODUCT_LOOKUPS = 8

const EXCLUDED_STATUS_KEYWORDS = ["anul", "cancel", "cancelled", "zwrot", "refunded"]

const CONFIG = {
  medium: {
    width: 1092,
    height: 510,
    cornerRadius: 70
  },
  large: {
    width: 1092,
    height: 1146,
    cornerRadius: 86
  }
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
    yellow: "#f6c84c",
    red: "#ff5c57",
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
    yellow: "#d97706",
    red: "#dc2626",
    line: "#cbd5e1",
    border: "#0f172a",
    baseAlpha: 1,
    deepAlpha: 0.22,
    panelAlpha: 0.62,
    borderAlpha: 0.10,
    topGlassAlpha: 0.12
  }
}

const CFG = CONFIG[WIDGET_SIZE]
const COLORS = THEMES[THEME]

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
    "User-Agent": "Scriptable Shoper Bestsellers Widget"
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

function formatMoney(value) {
  return String(Math.round(value || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

function shortBody(text) {
  if (!text) return ""
  return String(text).replace(/\s+/g, " ").slice(0, 180)
}

function displaySku(product) {
  const sku = String(product && product.sku ? product.sku : "").trim()
  if (sku) return sku

  const stockId = product && product.stockId ? String(product.stockId).trim() : ""
  if (stockId) return "STOCK-" + stockId

  const productId = product && product.productId ? String(product.productId).trim() : ""
  if (productId) return "ID-" + productId

  return "SKU-BRAK"
}

function splitSkuLines(sku, maxLineLength) {
  const value = String(sku || "SKU-BRAK").trim()

  if (value.length <= maxLineLength) {
    return [value, ""]
  }

  const separators = ["-", "_", "/", " "]
  let bestIndex = -1

  for (let i = 0; i < separators.length; i++) {
    const sep = separators[i]
    const idx = value.lastIndexOf(sep, maxLineLength)

    if (idx > bestIndex && idx > 3) {
      bestIndex = idx
    }
  }

  if (bestIndex > 0) {
    const first = value.slice(0, bestIndex + 1).trim()
    const second = value.slice(bestIndex + 1).trim()
    return [first, second]
  }

  return [
    value.slice(0, maxLineLength).trim(),
    value.slice(maxLineLength).trim()
  ]
}

function drawSkuTwoLines(dc, sku, x, y, w, lineH, size, color, bold, maxLineLength) {
  const lines = splitSkuLines(sku, maxLineLength)

  drawText(dc, lines[0], x, y, w, lineH, size, color, bold)

  if (lines[1]) {
    drawText(dc, lines[1], x, y + lineH - 2, w, lineH, size, color, bold)
  }
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
    json.products,
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

function getOrderId(order) {
  return firstValue(order, ["order_id", "id", "orderId"])
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

function getItemProductId(item) {
  return firstValue(item, [
    "product_id",
    "productId",
    "product",
    "product.id",
    "stock.product_id",
    "stock.productId"
  ])
}

function getItemStockId(item) {
  return firstValue(item, [
    "stock_id",
    "stockId",
    "product_stock_id",
    "productStockId",
    "stock.id"
  ])
}

function getItemName(item) {
  return firstValue(item, [
    "name",
    "product_name",
    "productName",
    "title",
    "product.name",
    "translation.name",
    "translations.pl_PL.name",
    "translations.pl.name"
  ])
}

function getItemSku(item) {
  return firstValue(item, [
    "sku",
    "code",
    "product_code",
    "producer_code",
    "ean",
    "product.sku",
    "product.code",
    "stock.sku",
    "stock.code",
    "stock.ean"
  ])
}

function getItemQuantity(item) {
  const v = firstValue(item, [
    "quantity",
    "qty",
    "count",
    "amount",
    "product_quantity",
    "products_quantity"
  ])

  const num = Number(String(v || 1).replace(",", "."))
  return isNaN(num) ? 1 : num
}

function getItemRevenue(item) {
  const total = firstValue(item, [
    "sum",
    "total",
    "price_sum",
    "sum_price",
    "gross_value",
    "brutto",
    "value",
    "price_total"
  ])

  if (total !== null) return parseMoney(total)

  const price = parseMoney(firstValue(item, [
    "price",
    "product_price",
    "unit_price",
    "price_brutto",
    "gross_price"
  ]))

  return price * getItemQuantity(item)
}

function getProductSku(product) {
  return firstValue(product, [
    "sku",
    "code",
    "product_code",
    "producer_code",
    "ean",
    "stock.sku",
    "stock.code",
    "stock.ean",
    "stocks.0.sku",
    "stocks.0.code",
    "stocks.0.ean"
  ])
}

function getProductActive(product) {
  const value = firstValue(product, [
    "active",
    "is_active",
    "enabled",
    "availability.active",
    "status"
  ])

  if (value === null || value === undefined) return true

  const text = String(value).toLowerCase()
  return !(text === "0" || text === "false" || text === "inactive" || text === "disabled")
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
  return fm.joinPath(dir, "shoper_bestsellers_sku_" + safeShop + ".json")
}

function loadCache() {
  if (USE_DEMO_DATA) return null

  try {
    const fm = FileManager.local()
    const path = cacheFilePath()

    if (!fm.fileExists(path)) return null

    const raw = fm.readString(path)
    const data = JSON.parse(raw)

    if (!data || !data.savedAt || !data.products) return null

    const age = Date.now() - data.savedAt
    if (age > CACHE_MINUTES * 60 * 1000) return null

    return data.products
  } catch (e) {
    return null
  }
}

function saveCache(products) {
  if (USE_DEMO_DATA) return

  try {
    const fm = FileManager.local()
    const path = cacheFilePath()

    fm.writeString(path, JSON.stringify({
      savedAt: Date.now(),
      products: products
    }))
  } catch (e) {
    if (DEBUG_API) console.log("Cache save error: " + e)
  }
}

async function fetchOrders30Days() {
  const headers = await getWorkingAuthHeaders()
  const today = startOfLocalDay(new Date())
  const firstDay = addDays(today, -(DAYS_TO_SHOW - 1))

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
      if (startOfLocalDay(date) < firstDay || startOfLocalDay(date) > today) continue
      if (!shouldCountOrder(order)) continue

      orders.push(order)
    }

    if (list.length < PAGE_LIMIT) break
    if (orders.length >= MAX_ORDERS_TO_ANALYZE) break
  }

  orders.sort(function(a, b) {
    const da = getOrderDate(a)
    const db = getOrderDate(b)
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0)
  })

  return orders.slice(0, MAX_ORDERS_TO_ANALYZE)
}

function extractItemsFromOrder(order) {
  const candidates = [
    order.products,
    order.items,
    order.order_products,
    order.orderProducts,
    order.children,
    order.products_list,
    order.productsList
  ]

  for (let i = 0; i < candidates.length; i++) {
    const arr = extractCollection(candidates[i])
    if (arr.length) return arr
  }

  return []
}

async function fetchOrderProducts(orderId) {
  const headers = await getWorkingAuthHeaders()

  const filters = { order_id: orderId }
  const url = buildUrl("order-products", 1, filters)
  let res = await apiRequestJSON(url, headers, "GET", null)

  if (res.ok) {
    return extractCollection(res.json)
  }

  const filtersAlt = { order: orderId }
  const urlAlt = buildUrl("order-products", 1, filtersAlt)
  res = await apiRequestJSON(urlAlt, headers, "GET", null)

  if (res.ok) {
    return extractCollection(res.json)
  }

  if (DEBUG_API) {
    console.log("Nie udało się pobrać order-products dla order_id " + orderId + ": " + res.status)
  }

  return []
}

async function fetchProduct(productId) {
  if (!productId) return null

  const headers = await getWorkingAuthHeaders()
  const url = SHOP_BASE_URL + "/webapi/rest/products/" + encodeURIComponent(productId)
  const res = await apiRequestJSON(url, headers, "GET", null)

  if (!res.ok) {
    if (DEBUG_API) console.log("Product " + productId + " HTTP " + res.status)
    return null
  }

  return res.json
}

async function fetchBestsellersFromApi() {
  const cached = loadCache()
  if (cached && cached.length) return cached

  const orders = await fetchOrders30Days()
  const map = {}

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i]
    const orderId = getOrderId(order)

    let items = extractItemsFromOrder(order)

    if (!items.length && orderId) {
      items = await fetchOrderProducts(orderId)
    }

    for (let j = 0; j < items.length; j++) {
      const item = items[j]

      const productId = getItemProductId(item)
      const stockId = getItemStockId(item)
      const name = getItemName(item) || "Produkt"
      const sku = getItemSku(item) || ""
      const key = String(sku || stockId || productId || name)

      if (!map[key]) {
        map[key] = {
          key: key,
          productId: productId,
          stockId: stockId,
          name: name,
          sku: sku,
          quantity: 0,
          revenue: 0,
          active: true
        }
      }

      map[key].quantity += getItemQuantity(item)
      map[key].revenue += getItemRevenue(item)

      if (!map[key].sku && sku) {
        map[key].sku = sku
      }
    }
  }

  let products = Object.values(map).sort(function(a, b) {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity
    return b.revenue - a.revenue
  })

  const lookupLimit = Math.min(products.length, MAX_PRODUCT_LOOKUPS)

  for (let i = 0; i < lookupLimit; i++) {
    const p = products[i]

    if (!p.productId || String(p.productId).indexOf("unknown_") === 0) continue

    const product = await fetchProduct(p.productId)

    if (!product) continue

    p.sku = getProductSku(product) || p.sku
    p.active = getProductActive(product)
  }

  products = products.filter(function(p) {
    return p.active !== false
  })

  saveCache(products)

  return products
}

function makeDemoBestsellers() {
  return [
    {
      name: "Łóżko metalowe piętrowe 90x200 z drabinką",
      sku: "LM-90-200-BLK-LONG",
      quantity: 7,
      revenue: 6573,
      active: true
    },
    {
      name: "Sofa amerykanka New York welur szary",
      sku: "SA-NY-GRAY",
      quantity: 5,
      revenue: 4245,
      active: true
    },
    {
      name: "Narożnik L-kształtny Naomi zielony",
      sku: "NL-NAOMI-GREEN",
      quantity: 4,
      revenue: 7076,
      active: true
    },
    {
      name: "Krzesło Rio beżowe bukowe nogi",
      sku: "KR-RIO-BEZ",
      quantity: 3,
      revenue: 1590,
      active: true
    },
    {
      name: "Sofa Meg z pojemnikiem beż",
      sku: "SF-MEG-BEZ",
      quantity: 3,
      revenue: 2547,
      active: true
    },
    {
      name: "Krzesło Adria welur butelkowa zieleń",
      sku: "KR-ADRIA-ZIEL",
      quantity: 2,
      revenue: 1180,
      active: true
    }
  ]
}

function prepareStats(products) {
  const list = products.slice().sort(function(a, b) {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity
    return b.revenue - a.revenue
  })

  const top = list[0] || null

  return {
    list: list,
    top: top,
    topQty: top ? Number(top.quantity || 0) : 0,
    topRevenue: top ? Number(top.revenue || 0) : 0
  }
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
  dc.fillEllipse(new Rect(80, 20, CFG.width * 0.46, CFG.width * 0.46))

  dc.setFillColor(new Color(COLORS.bgGlowGreen, THEME === "day" ? 0.18 : 0.13))
  dc.fillEllipse(new Rect(CFG.width * 0.67, CFG.height * 0.10, CFG.width * 0.38, CFG.width * 0.38))

  roundedRect(
    dc,
    8,
    8,
    CFG.width - 16,
    WIDGET_SIZE === "large" ? 178 : 112,
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

function drawTrophyIcon(dc, x, y, size, color) {
  roundedRect(dc, x, y, size, size, 24, new Color(color, 0.11))
  strokeRoundedRect(dc, x, y, size, size, 24, new Color(color, 0.32), 2)

  const cup = new Path()
  cup.move(new Point(x + size * 0.34, y + size * 0.35))
  cup.addLine(new Point(x + size * 0.66, y + size * 0.35))
  cup.addLine(new Point(x + size * 0.60, y + size * 0.58))
  cup.addLine(new Point(x + size * 0.40, y + size * 0.58))
  cup.closeSubpath()

  dc.addPath(cup)
  dc.setFillColor(new Color(color, 0.88))
  dc.fillPath()

  dc.setFillColor(new Color(color, 0.88))
  dc.fillRect(new Rect(x + size * 0.47, y + size * 0.58, size * 0.06, size * 0.15))
  dc.fillRect(new Rect(x + size * 0.35, y + size * 0.73, size * 0.30, size * 0.07))
}

function drawRankBadge(dc, rank, x, y, size) {
  const color = rank === 1 ? COLORS.green : rank === 2 ? COLORS.subtext : rank === 3 ? COLORS.yellow : COLORS.muted

  roundedRect(dc, x, y, size, size, 20, new Color(color, 0.10))
  strokeRoundedRect(dc, x, y, size, size, 20, new Color(color, 0.38), 2)

  drawTextCenter(dc, "#" + rank, x, y + size * 0.24, size, size * 0.56, size * 0.30, color, true)
}

function drawMoney(dc, value, x, y, w, h, size) {
  const text = formatMoney(value)

  drawText(dc, text, x, y, w - 38, h, size, COLORS.text, true)
  drawText(dc, "zł", x + w - 38, y + Math.round(size * 0.25), 38, h, Math.max(15, Math.round(size * 0.42)), COLORS.green, true)
}

function drawMetricSmall(dc, label, value, x, y, w) {
  drawText(dc, label, x, y, w, 24, 18, COLORS.subtext, false)
  drawText(dc, value, x, y + 26, w, 40, 34, COLORS.text, true)
}

function drawMediumRow(dc, rank, product, x, y, w, h) {
  panel(dc, x, y, w, h, 30, 0.36)

  drawRankBadge(dc, rank, x + 18, y + 22, 64)

  const sku = displaySku(product)

  drawSkuTwoLines(dc, sku, x + 102, y + 18, 380, 32, 27, COLORS.text, true, 20)

  drawMetricSmall(dc, "sztuki", String(Math.round(product.quantity || 0)), x + 510, y + 18, 150)

  drawText(dc, "przychód", x + 700, y + 18, 120, 24, 18, COLORS.subtext, false)
  drawMoney(dc, product.revenue || 0, x + 700, y + 44, 240, 42, 34)
}

function drawLargeProductCard(dc, rank, product, x, y, w, h) {
  panel(dc, x, y, w, h, 32, 0.38)

  drawRankBadge(dc, rank, x + 24, y + 26, 64)

  const sku = displaySku(product)

  drawSkuTwoLines(dc, sku, x + 108, y + 26, w - 132, 34, 29, COLORS.text, true, 18)

  drawText(dc, "sprzedane", x + 30, y + 120, 150, 26, 20, COLORS.subtext, false)
  drawText(dc, String(Math.round(product.quantity || 0)), x + 30, y + 150, 120, 54, 48, COLORS.green, true)

  drawText(dc, "przychód", x + 218, y + 120, 160, 26, 20, COLORS.subtext, false)
  drawMoney(dc, product.revenue || 0, x + 218, y + 148, w - 248, 56, 43)
}

async function drawMedium(stats) {
  const dc = new DrawContext()
  dc.size = new Size(CFG.width, CFG.height)
  dc.opaque = false
  dc.respectScreenScale = false

  drawBackground(dc)

  const shopName = getShopNameFromUrl()
  const now = new Date()
  const list = stats.list.slice(0, 3)

  drawTrophyIcon(dc, 50, 40, 84, COLORS.green)

  drawText(dc, "Bestsellery 30 dni", 158, 44, 460, 46, 39, COLORS.text, true)
  drawText(dc, shopName, 158, 92, 340, 32, 24, COLORS.subtext, false)

  drawText(dc, "aktualizacja", 742, 62, 150, 28, 20, COLORS.subtext, false)
  drawText(dc, formatTime(now), 888, 62, 80, 28, 23, COLORS.text, true)

  if (!list.length) {
    drawTextCenter(dc, "Brak danych sprzedaży z ostatnich 30 dni", 80, 235, 930, 60, 30, COLORS.subtext, true)
    return dc.getImage()
  }

  drawMediumRow(dc, 1, list[0], 54, 142, 984, 100)
  if (list[1]) drawMediumRow(dc, 2, list[1], 54, 252, 984, 100)
  if (list[2]) drawMediumRow(dc, 3, list[2], 54, 362, 984, 100)

  return dc.getImage()
}

async function drawLarge(stats) {
  const dc = new DrawContext()
  dc.size = new Size(CFG.width, CFG.height)
  dc.opaque = false
  dc.respectScreenScale = false

  drawBackground(dc)

  const shopName = getShopNameFromUrl()
  const now = new Date()
  const list = stats.list.slice(0, 6)

  drawTrophyIcon(dc, 54, 54, 110, COLORS.green)

  drawText(dc, "Bestsellery 30 dni", 198, 68, 520, 58, 46, COLORS.text, true)
  drawText(dc, shopName, 198, 128, 380, 40, 28, COLORS.subtext, false)

  drawText(dc, "aktualizacja", 774, 84, 150, 34, 23, COLORS.subtext, false)
  drawText(dc, formatTime(now), 924, 84, 80, 34, 25, COLORS.text, true)

  if (!list.length) {
    drawTextCenter(dc, "Brak danych sprzedaży z ostatnich 30 dni", 90, 500, 920, 70, 36, COLORS.subtext, true)
    return dc.getImage()
  }

  const marginX = 54
  const gapX = 24
  const gapY = 22
  const cardW = Math.floor((CFG.width - marginX * 2 - gapX) / 2)
  const cardH = 218

  const startY = 218
  const leftX = marginX
  const rightX = marginX + cardW + gapX

  for (let i = 0; i < list.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)

    const x = col === 0 ? leftX : rightX
    const y = startY + row * (cardH + gapY)

    drawLargeProductCard(dc, i + 1, list[i], x, y, cardW, cardH)
  }

  return dc.getImage()
}

async function buildWidget() {
  const raw = USE_DEMO_DATA ? makeDemoBestsellers() : await fetchBestsellersFromApi()
  const stats = prepareStats(raw)

  let image

  if (WIDGET_SIZE === "large") {
    image = await drawLarge(stats)
  } else {
    image = await drawMedium(stats)
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

  const title = widget.addText("Błąd widgetu bestsellerów")
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
