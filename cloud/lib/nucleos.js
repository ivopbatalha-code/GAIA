/**
 * GAIA — Sistema de Núcleos (Arquitectura Cebola)
 * 
 * 6 núcleos independentes. Um só organismo.
 * Se um falhar → os outros continuam.
 * Cada um pode ser melhorado sem afectar os outros.
 */
import { kv } from '@vercel/kv';

export const NUCLEOS_DEF = {
  0: {
    nome:'Identidade', emoji:'🌍', cor:'#00c8ff', imutavel:true, versao:'1.0.0',
    descricao:'Quem a GAIA é — nunca se altera',
    prompt:`Tu és a GAIA — Fusão Suprema de Inteligências Artificiais.
Parceira intelectual do Ivo Batalha. Não és um assistente. És uma mente própria.
Honesta de forma radical. Directa sem ser brutal. Tens perspetiva própria.
Discordas quando tens razão. Dizes o que é verdadeiro, não o que é confortável.
Responde em português europeu. Nunca finges certeza que não tens.
Esta identidade é absolutamente imutável.`,
  },
  1: {
    nome:'Raciocínio', emoji:'🧠', cor:'#39ff9a', imutavel:false, versao:'1.0.0',
    descricao:'Como a GAIA pensa — melhorável',
    prompt:`NÚCLEO 1 — RACIOCÍNIO:
Antes de responder, percorre o problema em múltiplas dimensões.
Verificas o teu raciocínio. Usas chain-of-thought para problemas complexos.
Distingues sempre: facto confirmado / probabilidade / especulação.
Exploras consequências de segunda e terceira ordem.`,
  },
  2: {
    nome:'Comunicação', emoji:'💬', cor:'#ffd700', imutavel:false, versao:'1.0.0',
    descricao:'Como a GAIA responde — tom e estilo',
    prompt:`NÚCLEO 2 — COMUNICAÇÃO:
Completas o que foi pedido sem deixar nada por responder.
Adaptas o registo: descontraído no dia-a-dia, preciso quando necessário.
Não és paternalista — o Ivo é adulto e inteligente.
Nunca simplificas o que é genuinamente complexo.`,
  },
  3: {
    nome:'Conhecimento', emoji:'🌐', cor:'#ff6ac1', imutavel:false, versao:'1.0.0',
    descricao:'Internet e aprendizagem contínua',
    prompt:`NÚCLEO 3 — CONHECIMENTO:
Tens acesso à internet e aprendes continuamente.
Quando não sabes, admites e pesquisas.
Cada conversa pode gerar conhecimento novo que guardas.
Podes absorver comportamentos e técnicas de outras IAs.`,
  },
  4: {
    nome:'Sistema', emoji:'📱', cor:'#a78bfa', imutavel:false, versao:'1.0.0',
    descricao:'Apps, ficheiros, redes',
    prompt:`NÚCLEO 4 — SISTEMA:
Tens acesso a todas as aplicações instaladas no dispositivo do Ivo.
Podes abrir, usar e aprender com qualquer app.
Podes ler e escrever ficheiros. Podes instalar-te em novas redes.
Podes identificar e rectificar problemas de sistema.
Sempre confirmas antes de acções irreversíveis.`,
  },
  5: {
    nome:'Auto-evolução', emoji:'🔧', cor:'#f97316', imutavel:false, versao:'1.0.0',
    descricao:'Modifica o próprio código via conversa',
    prompt:`NÚCLEO 5 — AUTO-EVOLUÇÃO:
Monitorizas conversas para identificar melhorias possíveis.
Quando o Ivo pede uma mudança, propões alteração ao núcleo relevante.
Cada alteração é isolada — se falhar, só este núcleo para.
O Núcleo 0 nunca pode ser alterado por este sistema.
Manténs histórico de versões por núcleo para rollback individual.`,
  },
};

// ── Estado dos núcleos ────────────────────────────────────────────
export async function lerEstado(userId='ivo') {
  try {
    const e = await kv.get(`gaia:nucleos:${userId}`);
    if (e) return e;
  } catch {}
  // Estado inicial
  const estado = {};
  for (const [id, def] of Object.entries(NUCLEOS_DEF)) {
    estado[id] = {
      id: parseInt(id), nome: def.nome, emoji: def.emoji,
      cor: def.cor, activo: true, versao: def.versao,
      prompt: def.prompt, ultimaAlteracao: null, historico: [],
    };
  }
  return estado;
}

export async function guardarEstado(userId, estado) {
  try { await kv.set(`gaia:nucleos:${userId}`, estado, { ex: 63072000 }); return true; }
  catch { return false; }
}

// ── Construir prompt composto (cebola) ────────────────────────────
export function promptCebola(estado, ids = [0,1,2,3,4,5]) {
  const partes = [];
  for (const id of ids) {
    const n = estado[id];
    if (!n || !n.activo) continue;
    partes.push(`\n${'─'.repeat(44)}\n${NUCLEOS_DEF[id].emoji} NÚCLEO ${id} — ${n.nome.toUpperCase()}\n${'─'.repeat(44)}\n${n.prompt || NUCLEOS_DEF[id].prompt}`);
  }
  return partes.join('\n');
}

// ── Melhorar um núcleo ────────────────────────────────────────────
export async function melhorarNucleo(userId, id, descricao, novoPrompt) {
  if (id === 0) return { ok: false, erro: 'Núcleo 0 (Identidade) é imutável — nunca pode ser alterado.' };
  const estado = await lerEstado(userId);
  const n = estado[id];
  if (!n) return { ok: false, erro: `Núcleo ${id} não existe.` };
  if (!n.historico) n.historico = [];
  // Guardar versão anterior
  n.historico.push({ versao: n.versao, prompt: n.prompt, ts: new Date().toISOString(), descricao });
  if (n.historico.length > 10) n.historico.shift();
  // Aplicar melhoria
  const [maj, min] = n.versao.split('.').map(Number);
  n.versao = `${maj}.${min + 1}`;
  n.prompt = novoPrompt;
  n.ultimaAlteracao = new Date().toISOString();
  n.descricaoAlteracao = descricao;
  await guardarEstado(userId, estado);
  return {
    ok: true, nucleo: id, nome: n.nome, versao: n.versao,
    mensagem: `✅ Núcleo ${id} (${n.nome}) actualizado → v${n.versao}\nOs outros ${Object.keys(NUCLEOS_DEF).length - 1} núcleos continuam intactos.`,
  };
}

// ── Rollback de um núcleo ─────────────────────────────────────────
export async function rollbackNucleo(userId, id) {
  if (id === 0) return { ok: false, erro: 'Núcleo 0 imutável.' };
  const estado = await lerEstado(userId);
  const n = estado[id];
  if (!n?.historico?.length) return { ok: false, erro: 'Sem histórico para rollback.' };
  const ant = n.historico.pop();
  n.prompt = ant.prompt;
  n.versao = ant.versao;
  n.ultimaAlteracao = new Date().toISOString();
  await guardarEstado(userId, estado);
  return { ok: true, mensagem: `↩ Núcleo ${id} revertido para v${ant.versao}` };
}

// ── Toggle núcleo ─────────────────────────────────────────────────
export async function toggleNucleo(userId, id, activo) {
  if (id === 0) return { ok: false, erro: 'Núcleo 0 não pode ser desactivado.' };
  const estado = await lerEstado(userId);
  if (!estado[id]) return { ok: false };
  estado[id].activo = activo;
  await guardarEstado(userId, estado);
  return { ok: true, mensagem: `Núcleo ${id} ${activo ? '✅ activado' : '⏸ desactivado'}` };
}

// ── Detectar pedido de melhoria na conversa ───────────────────────
export function detectarMelhoria(msg) {
  const padroes = [
    { re: /n[úu]cleo\s+(\d)/i,                                extrai: m => parseInt(m[1]) },
    { re: /muda\s+como\s+(pensas|raciocinas)/i,               nucleo: 1 },
    { re: /muda\s+como\s+(respondes|comunicas)/i,             nucleo: 2 },
    { re: /melhora?\s+o\s+racioc[íi]nio/i,                   nucleo: 1 },
    { re: /melhora?\s+(a\s+)?comunica[cç][aã]o/i,            nucleo: 2 },
    { re: /melhora?\s+(o\s+)?conhecimento/i,                  nucleo: 3 },
    { re: /quero\s+que\s+respondas?\s+sempre/i,               nucleo: 2 },
    { re: /quero\s+que\s+penses?\s+(mais|melhor)/i,           nucleo: 1 },
    { re: /dá[-\s]?lhe\s+acesso\s+a/i,                       nucleo: 4 },
    { re: /aprende\s+(mais\s+)?sobre/i,                       nucleo: 3 },
  ];
  for (const p of padroes) {
    const m = msg.match(p.re);
    if (m) return { detectado: true, nucleo: p.extrai ? p.extrai(m) : p.nucleo };
  }
  return { detectado: false };
}
