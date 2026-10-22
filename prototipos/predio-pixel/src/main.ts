// Entrada do protótipo: o laço de quadros, a câmera (ampliação inteira, sem suavização), a seleção por clique
// e a gaveta do agente. A gaveta é onde o hubbia se separa do habblaud: lá você só assiste; aqui cada agente abre
// o painel DELE (dashboard, chat, formulários, card) — no protótipo o painel é um esboço com o status simulável.
import * as art from './habblaud/art/index';
import { pixelText, pixelTextWidth } from './habblaud/art/pixelfont';
import { AGENTES, STATUS_ROTULO, type Agente, type AgenteId, type Status } from './agentes';
import { AREAS, H, W, areaEm, desenharPredio, type AreaId, type EstadoCena } from './predio';
import { areasOcupadas, atividadeDe, criarSimulacao, figuras, iconeDe, mudarStatus, passo, portaDoElevador, type AgenteVivo } from './sim';
import { montarCatalogo } from './catalogo';

const canvas = document.getElementById('mundo') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const moldura = document.getElementById('moldura') as HTMLElement;
const gaveta = document.getElementById('gaveta') as HTMLElement;
const horaInput = document.getElementById('hora') as HTMLInputElement;
const horaValor = document.getElementById('hora-valor') as HTMLOutputElement;
canvas.width = W;
canvas.height = H;

const inicio = performance.now();
const sim = criarSimulacao(0);
let selecionado: AgenteId | undefined;
let sobre: AgenteId | undefined;
const luz = Object.fromEntries(AREAS.map((a) => [a.id, 1])) as Record<AreaId, number>;

// ------------------------------------------------------------------ hora do dia

const agora0 = new Date();
horaInput.value = String(agora0.getHours() + Math.floor(agora0.getMinutes() / 15) / 4);
const hora = () => Number(horaInput.value);
function mostrarHora(): void {
  const h = hora();
  horaValor.value = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
}
horaInput.addEventListener('input', mostrarHora);
mostrarHora();

// ------------------------------------------------------------------ câmera

let escala = 2;
function ajustarEscala(): void {
  const r = moldura.getBoundingClientRect();
  const cabe = Math.min((r.width - 32) / W, (r.height - 32) / H);
  // Inteira a partir de 2x (pixel nítido); abaixo disso ocupa o espaço que tiver (1x deixaria o prédio minúsculo).
  escala = cabe >= 2 ? Math.floor(cabe) : Math.max(0.5, cabe);
  canvas.style.width = `${W * escala}px`;
  canvas.style.height = `${H * escala}px`;
}
new ResizeObserver(ajustarEscala).observe(moldura);
ajustarEscala();

function agenteSob(ev: PointerEvent | MouseEvent): AgenteVivo | undefined {
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * W;
  const y = ((ev.clientY - r.top) / r.height) * H;
  // Caixa do corpo: ~16 px de largura, ~28 de altura acima dos pés; o mais à frente ganha.
  const sob = sim.agentes.filter((a) => Math.abs(x - a.x) <= 8 && y <= a.y + 2 && y >= a.y - 28).sort((a, b) => b.sortY - a.sortY)[0];
  if (sob) return sob;
  // Clique numa sala seleciona o dono dela.
  const ar = areaEm(x, y);
  return ar?.dono ? sim.agentes.find((a) => a.def.id === ar.dono) : undefined;
}

canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * W;
  const y = ((ev.clientY - r.top) / r.height) * H;
  const a = sim.agentes.find((g) => Math.abs(x - g.x) <= 8 && y <= g.y + 2 && y >= g.y - 28);
  sobre = a?.def.id;
  canvas.classList.toggle('mira', !!agenteSob(ev));
});
canvas.addEventListener('pointerleave', () => {
  sobre = undefined;
});
canvas.addEventListener('click', (ev) => {
  const a = agenteSob(ev);
  selecionar(a?.def.id);
});
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') selecionar(undefined);
});

// ------------------------------------------------------------------ gaveta

const avatar = (d: Agente, scale: number) => art.avatarCanvas(d.seed, { look: d.look, parts: d.parts, scale });
const vivo = (id: AgenteId) => sim.agentes.find((a) => a.def.id === id) as AgenteVivo;
const COR_STATUS: Record<Status, string> = { trabalhando: 'var(--good)', ocioso: 'var(--ink-2)', precisa_de_voce: 'var(--warn)', dormindo: '#818cf8' };

function selecionar(id: AgenteId | undefined): void {
  selecionado = id;
  desenharGaveta();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...filhos: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...filhos);
  return e;
}

let agoraEl: HTMLElement | null = null;

function desenharGaveta(): void {
  gaveta.replaceChildren();
  agoraEl = null;
  if (!selecionado) {
    gaveta.append(
      el('h2', {}, 'O prédio'),
      el('p', { class: 'vazio' }, 'Cada agente tem a sua sala. Clique num agente (ou na sala dele) para abrir o painel.'),
    );
    const lista = el('div', { class: 'lista-agentes' });
    for (const a of sim.agentes) {
      const b = el('button', { type: 'button' }, avatar(a.def, 2), el('span', {}, a.def.nome, el('small', {}, `${a.def.dominio} · ${STATUS_ROTULO[a.status]}`)));
      const selo = el('span', { class: 'selo' });
      selo.style.background = COR_STATUS[a.status];
      b.append(selo);
      b.addEventListener('click', () => selecionar(a.def.id));
      lista.append(b);
    }
    gaveta.append(lista);
    return;
  }
  const a = vivo(selecionado);
  const d = a.def;
  gaveta.style.setProperty('--cor', d.cor);
  const topo = el('div', { class: 'agente-topo' }, avatar(d, 3), el('div', {}, el('h2', {}, d.nome), el('div', { class: 'dominio' }, d.dominio)));
  agoraEl = el('div', { class: 'agora' }, atividadeDe(a));
  const chips = el('div', { class: 'chips' });
  for (const s of Object.keys(STATUS_ROTULO) as Status[]) {
    const b = el('button', { type: 'button', 'data-status': s, 'aria-pressed': String(a.status === s) }, STATUS_ROTULO[s]);
    b.addEventListener('click', () => {
      mudarStatus(sim, d.id, s, relogio());
      desenharGaveta();
    });
    chips.append(b);
  }
  gaveta.append(
    el('div', { class: 'cartao' }, topo),
    el('div', { class: 'cartao' }, el('p', { class: 'rotulo' }, 'Agora'), agoraEl),
    el('div', { class: 'cartao' }, el('p', { class: 'rotulo' }, 'Status (simulado)'), chips, el('p', { class: 'dica' }, 'No app real o status vem do backend (motor de tick). "Precisa de você" = proposta esperando confirmação.')),
  );
  if (d.atalho) {
    const form = el('div', { class: 'atalho' });
    for (const c of d.atalho.campos) form.append(el('label', {}, c, el('input', { inputmode: 'decimal', placeholder: '—' })));
    gaveta.append(el('div', { class: 'cartao' }, el('p', { class: 'rotulo' }, d.atalho.rotulo), form, el('p', { class: 'dica' }, 'Atalho de campo único na bolha do agente, sem abrir o painel inteiro.')));
  }
  const abrir = el('button', { class: 'botao', type: 'button', disabled: '' }, `Abrir painel ${d.id === 'norte' ? 'do' : 'da'} ${d.nome}`);
  gaveta.append(
    el('div', { class: 'cartao' }, el('p', { class: 'rotulo' }, 'Como se fala com ele'), el('div', {}, d.interacao), el('div', { style: 'height:10px' }), abrir, el('p', { class: 'dica' }, 'O painel de cada agente vem do frontend do hubbia; aqui o prédio só leva até ele.')),
  );
  const voltar = el('button', { class: 'botao', type: 'button', style: 'background:var(--deck-2);color:var(--ink);border:1px solid var(--linha)' }, 'Ver todos (Esc)');
  voltar.addEventListener('click', () => selecionar(undefined));
  gaveta.append(voltar);
}

// ------------------------------------------------------------------ laço

let pausadoEm = 0;
let tempoParado = 0;
const relogio = () => performance.now() - inicio - tempoParado;
document.addEventListener('visibilitychange', () => {
  // Aba escondida não acumula um salto de tempo (os agentes não "teleportam" ao voltar).
  if (document.hidden) pausadoEm = performance.now();
  else if (pausadoEm) tempoParado += performance.now() - pausadoEm;
});

let ultimo = 0;
let ultimaGaveta = 0;

function sobreposicoes(t: number): (c: CanvasRenderingContext2D) => void {
  return (c) => {
    for (const a of sim.agentes) {
      const marcado = a.def.id === selecionado;
      const topo = a.y - (a.seated ? 27 : 30);
      if (marcado) {
        c.strokeStyle = a.def.cor;
        c.lineWidth = 1;
        c.beginPath();
        c.ellipse(Math.round(a.x) + 0.5, Math.round(a.seated ? a.sortY - 0.25 : a.y) + 0.5, 8, 3, 0, 0, Math.PI * 2);
        c.stroke();
      }
      const icone = iconeDe(a, t);
      if (icone) {
        const pisca = icone === 'alert' ? Math.floor(t / 400) % 2 : 0;
        const sp = art.iconSprite(icone);
        c.drawImage(sp.canvas, Math.round(a.x - sp.ax), Math.round(topo - 4 - pisca - sp.ay));
      }
      if (marcado || a.def.id === sobre) {
        const nome = a.def.nome.toLowerCase();
        const tw = pixelTextWidth(nome);
        const x0 = Math.round(a.x - tw / 2) - 3;
        const y0 = Math.round(a.y + 3);
        c.fillStyle = 'rgba(11,14,20,0.82)';
        c.fillRect(x0, y0, tw + 6, 9);
        c.fillStyle = a.def.cor;
        c.fillRect(x0, y0 + 8, tw + 6, 1);
        pixelText(c, nome, x0 + 3, y0 + 2, '#e6ebf4');
      }
    }
  };
}

function quadro(): void {
  const t = relogio();
  // Passos de no máximo 50 ms: num navegador lento a simulação não pula paredes.
  let dt = Math.min(1000, t - ultimo);
  let tt = ultimo;
  while (dt > 0) {
    const d = Math.min(50, dt);
    tt += d;
    passo(sim, tt, d);
    dt -= d;
  }
  ultimo = t;

  const ocupadas = areasOcupadas(sim);
  for (const a of AREAS) {
    const alvo = ocupadas.has(a.id) ? 1 : a.dono ? 0 : 0.6;
    luz[a.id] += (alvo - luz[a.id]) * 0.06;
  }
  const telas: EstadoCena['telas'] = {};
  for (const a of sim.agentes) {
    const naSala = areaEm(a.x, a.y - 4)?.id === a.def.id;
    telas[a.def.id] = a.lugar?.mesa && a.status === 'trabalhando' ? a.def.tela : a.status === 'precisa_de_voce' && a.lugar?.mesa ? 'alert' : naSala ? 'standby' : 'off';
  }
  const cena: EstadoCena = {
    t,
    hora: hora(),
    agora: new Date(),
    telas,
    luz,
    elevadores: [portaDoElevador(sim.elevadorAbriu[0], t), portaDoElevador(sim.elevadorAbriu[1], t)],
  };
  desenharPredio(ctx, cena, figuras(sim, t), sobreposicoes(t));

  if (agoraEl && selecionado && t - ultimaGaveta > 250) {
    ultimaGaveta = t;
    const txt = atividadeDe(vivo(selecionado));
    if (agoraEl.textContent !== txt) agoraEl.textContent = txt;
  }
  requestAnimationFrame(quadro);
}

desenharGaveta();
requestAnimationFrame(quadro);

// ------------------------------------------------------------------ abas

const abas = document.querySelectorAll<HTMLButtonElement>('[data-aba]');
let catalogoMontado = false;
for (const b of abas) {
  b.addEventListener('click', () => {
    for (const x of abas) x.setAttribute('aria-selected', String(x === b));
    const qual = b.dataset.aba;
    (document.getElementById('aba-predio') as HTMLElement).hidden = qual !== 'predio';
    (document.getElementById('aba-catalogo') as HTMLElement).hidden = qual !== 'catalogo';
    if (qual === 'catalogo' && !catalogoMontado) {
      catalogoMontado = true;
      montarCatalogo(document.getElementById('aba-catalogo') as HTMLElement);
    }
  });
}
if (location.hash === '#catalogo') (document.querySelector('[data-aba="catalogo"]') as HTMLButtonElement).click();
