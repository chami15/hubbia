// Entrada do protótipo: o laço de quadros, a câmera (ampliação inteira, sem suavização), a seleção por clique,
// a gaveta do agente e o ciclo de vida das salas (adicionar agente → obra → chega pelo elevador; dispensar → vai
// embora → sala desmontada vira vaga). A gaveta é onde o hubbia se separa do habblaud: lá você só assiste; aqui
// cada agente abre o painel DELE — no protótipo o painel é um esboço com o status simulável.
import * as art from './habblaud/art/index';
import { pixelText, pixelTextWidth } from './habblaud/art/pixelfont';
import { CATALOGO, INICIAIS, STATUS_ROTULO, agentePorId, type Agente, type AgenteId, type Status } from './agentes';
import { DESMONTE_MS, H, MAX_VAGAS, OBRA_MS, areaEm, desenharPredio, lugaresInalcancaveis, montarPredio, type EstadoCena, type Obra } from './predio';
import { SALAS } from './salas';
import {
  adicionarAgente, areasOcupadas, atividadeDe, criarSimulacao, dispensarAgente, figuras, iconeDe, mudarStatus, passo, portaDoElevador, visivel,
  type AgenteVivo,
} from './sim';
import { montarCatalogo } from './catalogo';

const canvas = document.getElementById('mundo') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const moldura = document.getElementById('moldura') as HTMLElement;
const gaveta = document.getElementById('gaveta') as HTMLElement;
const horaInput = document.getElementById('hora') as HTMLInputElement;
const horaValor = document.getElementById('hora-valor') as HTMLOutputElement;

// ------------------------------------------------------------------ relógio

const inicio = performance.now();
let pausadoEm = 0;
let tempoParado = 0;
const relogio = () => performance.now() - inicio - tempoParado;
document.addEventListener('visibilitychange', () => {
  // Aba escondida não acumula um salto de tempo (os agentes não "teleportam" ao voltar).
  if (document.hidden) pausadoEm = performance.now();
  else if (pausadoEm) tempoParado += performance.now() - pausadoEm;
});

// ------------------------------------------------------------------ vagas (quem está em cada sala)

const CHAVE = 'hubbia-predio:vagas';

/** Vagas salvas neste navegador (só conveniência do protótipo; no app real viria do backend). */
function carregarVagas(): (AgenteId | null)[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    if (Array.isArray(v) && v.length >= 4 && v.length <= MAX_VAGAS && v.length % 2 === 0) {
      const vistos = new Set<string>();
      return v.map((x) => (typeof x === 'string' && SALAS[x] && !vistos.has(x) && vistos.add(x) ? x : null));
    }
  } catch {
    // sem armazenamento: começa do padrão
  }
  // Mesma disposição de antes: Cifra e Agenda em cima, Vita e Norte embaixo.
  return [INICIAIS[0], INICIAIS[2], INICIAIS[1], INICIAIS[3]];
}
function salvarVagas(): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(vagas));
  } catch {
    // tudo bem: só não lembra na próxima visita
  }
}

const vagas = carregarVagas();
const obras = new Map<number, Obra>();
let predio = montarPredio(vagas);
const sim = criarSimulacao(predio, aoSair);
for (const id of vagas) if (id) adicionarAgente(sim, id, 0, { jaNaMesa: true, status: id === 'agenda' ? 'precisa_de_voce' : 'trabalhando' });

function reconstruir(): void {
  predio = montarPredio(vagas);
  sim.predio = predio;
  canvas.width = predio.W;
  canvas.height = H;
  ajustarEscala();
  const ruins = lugaresInalcancaveis(predio);
  if (ruins.length) console.warn('Lugares inalcançáveis:', ruins.map((l) => l.id).join(', '));
}

const disponiveis = () => CATALOGO.filter((d) => !vagas.includes(d.id));
const temEspaco = () => vagas.includes(null) || vagas.length < MAX_VAGAS;

/** Põe um agente numa vaga (a escolhida ou a primeira livre; sem vaga, o prédio ganha uma coluna). */
function adicionar(id: AgenteId, vagaEscolhida?: number): void {
  if (vagas.includes(id)) return;
  let i = vagaEscolhida !== undefined && vagas[vagaEscolhida] === null && !obras.has(vagaEscolhida) ? vagaEscolhida : vagas.findIndex((v, k) => v === null && !obras.has(k));
  if (i < 0) {
    if (vagas.length >= MAX_VAGAS) return;
    i = vagas.length;
    vagas.push(null, null);
  }
  const t = relogio();
  vagas[i] = id;
  obras.set(i, { inicio: t, tipo: 'construir' });
  reconstruir();
  adicionarAgente(sim, id, t, { chegaEm: t + OBRA_MS });
  salvarVagas();
  selecionar(id);
}

function dispensar(id: AgenteId): void {
  dispensarAgente(sim, id, relogio());
  selecionar(undefined);
}

/** O agente dispensado entrou no elevador: a sala dele é desmontada e vira vaga. */
function aoSair(id: AgenteId): void {
  const i = vagas.indexOf(id);
  if (i >= 0) obras.set(i, { inicio: relogio(), tipo: 'desmontar' });
  if (selecionado === id) selecionar(undefined);
  else desenharGaveta();
}

/** Fecha as obras que terminaram (a desmontagem só libera a vaga no fim, quando a sala já sumiu). */
function fecharObras(t: number): void {
  for (const [i, o] of obras) {
    if (o.tipo === 'construir' && t - o.inicio >= OBRA_MS) obras.delete(i);
    if (o.tipo === 'desmontar' && t - o.inicio >= DESMONTE_MS) {
      obras.delete(i);
      vagas[i] = null;
      salvarVagas();
      reconstruir();
      desenharGaveta();
    }
  }
}

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

// ------------------------------------------------------------------ câmera e seleção

let escala = 2;
function ajustarEscala(): void {
  const r = moldura.getBoundingClientRect();
  const cabe = Math.min((r.width - 32) / predio.W, (r.height - 32) / H);
  // Inteira a partir de 2x (pixel nítido); abaixo disso ocupa o espaço que tiver (1x deixaria o prédio minúsculo).
  escala = cabe >= 2 ? Math.floor(cabe) : Math.max(0.5, cabe);
  canvas.style.width = `${predio.W * escala}px`;
  canvas.style.height = `${H * escala}px`;
}
new ResizeObserver(ajustarEscala).observe(moldura);

let selecionado: AgenteId | undefined;
let sobre: AgenteId | undefined;
let vagaSob: number | undefined;
/** Gaveta no modo "escolher agente" (para uma vaga específica, ou a próxima livre). */
let escolhendo: { vaga?: number } | undefined;

function pontoNoMundo(ev: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((ev.clientX - r.left) / r.width) * predio.W, ((ev.clientY - r.top) / r.height) * H];
}

function agenteEm(x: number, y: number): AgenteVivo | undefined {
  const t = relogio();
  // Caixa do corpo: ~16 px de largura, ~28 de altura acima dos pés; o mais à frente ganha.
  return sim.agentes.filter((a) => visivel(a, t) && Math.abs(x - a.x) <= 8 && y <= a.y + 2 && y >= a.y - 28).sort((a, b) => b.sortY - a.sortY)[0];
}

canvas.addEventListener('pointermove', (ev) => {
  const [x, y] = pontoNoMundo(ev);
  const a = agenteEm(x, y);
  const ar = areaEm(predio, x, y);
  sobre = a?.def.id;
  vagaSob = !a && ar?.livre && !obras.has(ar.vaga as number) ? ar.vaga : undefined;
  canvas.classList.toggle('mira', !!a || !!ar?.dono || vagaSob !== undefined);
});
canvas.addEventListener('pointerleave', () => {
  sobre = undefined;
  vagaSob = undefined;
});
canvas.addEventListener('click', (ev) => {
  const [x, y] = pontoNoMundo(ev);
  const a = agenteEm(x, y);
  if (a) return selecionar(a.def.id);
  const ar = areaEm(predio, x, y);
  if (ar?.livre && !obras.has(ar.vaga as number)) return escolher(ar.vaga);
  // Clique numa sala seleciona o dono dela (se ele já chegou).
  selecionar(ar?.dono && sim.agentes.some((g) => g.def.id === ar.dono) ? ar.dono : undefined);
});
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') selecionar(undefined);
});

// ------------------------------------------------------------------ gaveta

const avatar = (d: Agente, scale: number) => art.avatarCanvas(d.seed, { look: d.look, parts: d.parts, scale });
const vivo = (id: AgenteId) => sim.agentes.find((a) => a.def.id === id);
const COR_STATUS: Record<Status, string> = { trabalhando: 'var(--good)', ocioso: 'var(--ink-2)', precisa_de_voce: 'var(--warn)', dormindo: '#818cf8' };

function selecionar(id: AgenteId | undefined): void {
  selecionado = id;
  escolhendo = undefined;
  desenharGaveta();
}
function escolher(vaga?: number): void {
  selecionado = undefined;
  escolhendo = { vaga };
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

function botao(texto: string, onClick: () => void, o: { secundario?: boolean; disabled?: boolean } = {}): HTMLButtonElement {
  const b = el('button', { class: o.secundario ? 'botao botao-sec' : 'botao', type: 'button' }, texto);
  if (o.disabled) b.disabled = true;
  b.addEventListener('click', onClick);
  return b;
}

let agoraEl: HTMLElement | null = null;

function desenharGaveta(): void {
  gaveta.replaceChildren();
  gaveta.style.removeProperty('--cor');
  agoraEl = null;
  if (escolhendo) return gavetaCatalogo(escolhendo.vaga);
  const a = selecionado ? vivo(selecionado) : undefined;
  if (!a) return gavetaLista();
  gavetaAgente(a);
}

function gavetaLista(): void {
  gaveta.append(
    el('h2', {}, 'O prédio'),
    el('p', { class: 'vazio' }, 'Cada agente tem a sua sala. Clique num agente (ou na sala dele) para abrir o painel.'),
  );
  const lista = el('div', { class: 'lista-agentes' });
  for (const a of sim.agentes) {
    const b = el('button', { type: 'button' }, avatar(a.def, 2), el('span', {}, a.def.nome, el('small', {}, `${a.def.dominio} · ${a.saindo ? 'Indo embora' : a.chegando ? 'Chegando' : STATUS_ROTULO[a.status]}`)));
    const selo = el('span', { class: 'selo' });
    selo.style.background = COR_STATUS[a.status];
    b.append(selo);
    b.addEventListener('click', () => selecionar(a.def.id));
    lista.append(b);
  }
  gaveta.append(lista, el('div', { style: 'height:12px' }));
  const pode = disponiveis().length > 0 && temEspaco();
  gaveta.append(
    botao('+ Adicionar agente', () => escolher(), { disabled: !pode }),
    el('p', { class: 'dica' }, pode ? 'Ou clique numa vaga do prédio.' : disponiveis().length ? 'O prédio está cheio (8 salas).' : 'Todos os agentes do catálogo já estão no prédio.'),
  );
}

function gavetaCatalogo(vaga?: number): void {
  gaveta.append(
    el('h2', {}, 'Adicionar agente'),
    el('p', { class: 'vazio' }, vaga !== undefined ? 'Escolha quem fica nesta vaga. A sala é construída e o agente chega pelo elevador.' : 'A sala é construída na próxima vaga livre (ou numa coluna nova) e o agente chega pelo elevador.'),
  );
  const lista = el('div', { class: 'lista-agentes' });
  const livres = disponiveis();
  for (const d of livres) {
    const b = el('button', { type: 'button' }, avatar(d, 2), el('span', {}, d.nome, el('small', {}, `${d.dominio}${d.conceito ? ' · conceito' : ''}`)));
    const selo = el('span', { class: 'selo' });
    selo.style.background = d.cor;
    b.append(selo);
    b.addEventListener('click', () => adicionar(d.id, vaga));
    lista.append(b);
  }
  if (!livres.length) lista.append(el('p', { class: 'vazio' }, 'Todos os agentes do catálogo já estão no prédio.'));
  gaveta.append(lista, el('div', { style: 'height:12px' }), botao('Voltar', () => selecionar(undefined), { secundario: true }));
}

function gavetaAgente(a: AgenteVivo): void {
  const d = a.def;
  gaveta.style.setProperty('--cor', d.cor);
  const topo = el('div', { class: 'agente-topo' }, avatar(d, 3), el('div', {}, el('h2', {}, d.nome), el('div', { class: 'dominio' }, `${d.dominio}${d.conceito ? ' · conceito' : ''}`)));
  agoraEl = el('div', { class: 'agora' }, atividadeDe(a));
  const chips = el('div', { class: 'chips' });
  for (const s of Object.keys(STATUS_ROTULO) as Status[]) {
    const b = el('button', { type: 'button', 'data-status': s, 'aria-pressed': String(a.status === s) }, STATUS_ROTULO[s]);
    if (a.saindo) b.disabled = true;
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
  gaveta.append(
    el(
      'div',
      { class: 'cartao' },
      el('p', { class: 'rotulo' }, 'Como se fala com ele'),
      el('div', {}, d.interacao),
      el('div', { style: 'height:10px' }),
      botao(`Abrir painel d${d.artigo} ${d.nome}`, () => undefined, { disabled: true }),
      el('p', { class: 'dica' }, d.conceito ? 'Agente conceito: a arte e a sala estão prontas; o backend ainda não existe.' : 'O painel de cada agente vem do frontend do hubbia; aqui o prédio só leva até ele.'),
    ),
    botao(`Dispensar ${d.nome}`, () => dispensar(d.id), { secundario: true, disabled: a.saindo || a.chegando }),
    el('div', { style: 'height:8px' }),
    botao('Ver todos (Esc)', () => selecionar(undefined), { secundario: true }),
  );
}

// ------------------------------------------------------------------ laço

let ultimo = 0;
let ultimaGaveta = 0;
const luz: Record<string, number> = {};

function sobreposicoes(t: number): (c: CanvasRenderingContext2D) => void {
  return (c) => {
    for (const a of sim.agentes) {
      if (!visivel(a, t)) continue;
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
  fecharObras(t);

  const ocupadas = areasOcupadas(sim, t);
  for (const a of predio.areas) {
    const alvo = ocupadas.has(a.id) ? 1 : a.livre ? 0.7 : a.dono ? 0 : 0.6;
    luz[a.id] = (luz[a.id] ?? alvo) + (alvo - (luz[a.id] ?? alvo)) * 0.06;
  }
  const telas: EstadoCena['telas'] = {};
  for (const a of sim.agentes) {
    const naSala = areaEm(predio, a.x, a.y - 4)?.id === a.def.id;
    telas[a.def.id] = a.lugar?.mesa && a.status === 'trabalhando' ? a.def.tela : a.status === 'precisa_de_voce' && a.lugar?.mesa ? 'alert' : naSala ? 'standby' : 'off';
  }
  const cena: EstadoCena = {
    t,
    hora: hora(),
    agora: new Date(),
    telas,
    luz,
    elevadores: [portaDoElevador(sim.elevadorAbriu[0], t), portaDoElevador(sim.elevadorAbriu[1], t)],
    obras,
    vagaSob,
  };
  desenharPredio(ctx, predio, cena, figuras(sim, t), sobreposicoes(t));

  if (t - ultimaGaveta > 250) {
    ultimaGaveta = t;
    const a = selecionado ? vivo(selecionado) : undefined;
    if (agoraEl && a) {
      const txt = atividadeDe(a);
      if (agoraEl.textContent !== txt) agoraEl.textContent = txt;
    }
  }
  requestAnimationFrame(quadro);
}

reconstruir();
desenharGaveta();
requestAnimationFrame(quadro);

// Para testar sem clicar (console ou automação): window.hubbia.adicionar('lume').
(window as unknown as { hubbia: object }).hubbia = { adicionar, dispensar, agentes: () => sim.agentes.map((a) => a.def.id), nome: (id: string) => agentePorId(id)?.nome };

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
