// Captura de tela do frontend num Chromium real, com a API do backend simulada. Uso: ver SKILL.md.
// Sem dependência além de playwright-core (instalado em PW_DIR). Não grava nada fora do que você pedir em --saida.
import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function args() {
  const a = process.argv.slice(2)
  const o = { url: 'http://localhost:5173/', saida: 'tela.png', espera: '6000', viewport: '1700x950', api: 'http://localhost:8000' }
  for (let i = 0; i < a.length; i += 2) {
    if (!a[i].startsWith('--')) throw new Error(`argumento inesperado: ${a[i]}`)
    o[a[i].slice(2)] = a[i + 1]
  }
  return o
}

function acharChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(raiz)) return undefined // deixa o Playwright usar o navegador dele
  const pasta = readdirSync(raiz).filter((d) => d.startsWith('chromium-')).sort().pop()
  const exe = pasta && join(raiz, pasta, 'chrome-linux', 'chrome')
  return exe && existsSync(exe) ? exe : undefined
}

const o = args()
const req = createRequire(process.env.PW_DIR ? resolve(process.env.PW_DIR) + '/' : import.meta.url)
let chromium
try {
  ;({ chromium } = req('playwright-core'))
} catch {
  console.error('playwright-core não encontrado. Rode: npm i --prefix <pasta> playwright-core  e use PW_DIR=<pasta>')
  process.exit(2)
}

const mock = o.mock ? JSON.parse(readFileSync(o.mock, 'utf8')) : {}
const [largura, altura] = o.viewport.split('x').map(Number)
const navegador = await chromium.launch({ executablePath: acharChromium() })
const page = await navegador.newPage({ viewport: { width: largura, height: altura } })

const avisos = []
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && avisos.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => avisos.push(`pageerror: ${e.message}`))

// Rota ancorada no host da API: nunca "**/agenda/**", que intercepta os módulos que o Vite serve.
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
await page.route(`${o.api}/**`, (r) => {
  const req = r.request()
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
  const chave = `${req.method()} ${new URL(req.url()).pathname}`
  if (chave in mock) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(mock[chave]) })
  return r.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"detail":"mock"}' })
})

await page.goto(o.url, { waitUntil: 'networkidle' }).catch((e) => avisos.push(`goto: ${e.message}`))
await page.waitForTimeout(Number(o.espera))
if (o.passos) {
  const { default: passos } = await import(pathToFileURL(resolve(o.passos)).href)
  await passos(page)
  await page.waitForTimeout(1200)
}
await page.screenshot({ path: o.saida })
console.log(`screenshot: ${resolve(o.saida)}`)
console.log(avisos.length ? `console (${avisos.length}):\n${avisos.slice(0, 20).join('\n')}` : 'console limpo')
await navegador.close()
