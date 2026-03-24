/**
 * GAIA Cloud — API de Chat com Sistema de Núcleos
 * 
 * Fluxo:
 * 1. Carrega estado dos núcleos do Ivo
 * 2. Detecta se a mensagem pede melhoria de um núcleo
 * 3. Se sim → usa LLM para gerar novo prompt do núcleo → aplica
 * 4. Constrói o prompt cebola com todos os núcleos activos
 * 5. Chama o modelo (próprio → Groq → fallback)
 * 6. Detecta pedidos de acesso a apps/sistema
 */

import { lerEstado, promptCebola, melhorarNucleo, rollbackNucleo, toggleNucleo, detectarMelhoria, NUCLEOS_DEF } from '../lib/nucleos.js';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { mensagem, historico = [], modo = 'normal', userId = 'ivo', orgao, usarRAG } = req.body || {};
  if (!mensagem) return res.status(400).json({ erro: 'Mensagem em falta' });

  const inicio = Date.now();

  // ── 1. Carregar estado dos núcleos ────────────────────────────
  let estado;
  try { estado = await lerEstado(userId); }
  catch { estado = null; }

  // ── 2. Detectar pedido de melhoria de núcleo ──────────────────
  const pedido = detectarMelhoria(mensagem);
  
  if (pedido.detectado && estado) {
    const nucleoId = pedido.nucleo;
    const def = NUCLEOS_DEF[nucleoId];
    
    if (nucleoId === 0) {
      return res.json({
        resposta: '❌ O Núcleo 0 (Identidade) é imutável. É o coração da GAIA e nunca pode ser alterado. Posso melhorar qualquer outro núcleo (1-5).',
        fonte: 'Sistema de Núcleos',
        nucleo_protegido: true,
        duracao_ms: Date.now() - inicio,
      });
    }

    try {
      // Usar LLM para gerar o novo prompt do núcleo
      const novoPrompt = await gerarNovoPromptNucleo(nucleoId, def, mensagem, historico);
      
      const resultado = await melhorarNucleo(userId, nucleoId, mensagem, novoPrompt);
      
      // Guardar versão no histórico global
      await registarVersaoGlobal(userId, {
        tipo: 'melhoria_nucleo',
        nucleo: nucleoId,
        descricao: `Núcleo ${nucleoId} (${def.nome}) melhorado via conversa`,
        ts: new Date().toISOString(),
      });

      return res.json({
        resposta: `${resultado.mensagem}\n\n**O que mudou no Núcleo ${nucleoId} (${def.nome}):**\n${novoPrompt.slice(0, 300)}...\n\nPodes continuar a conversa normalmente. Os restantes ${Object.keys(NUCLEOS_DEF).length - 1} núcleos não foram afectados.`,
        fonte: `Núcleo ${nucleoId} actualizado`,
        nucleo_melhorado: nucleoId,
        versao: resultado.versao,
        duracao_ms: Date.now() - inicio,
      });
    } catch (e) {
      // Falha isolada — GAIA continua a funcionar com os outros núcleos
      return res.json({
        resposta: `⚠️ Ocorreu um erro ao tentar melhorar o Núcleo ${nucleoId}. Os outros núcleos estão intactos e a GAIA continua a funcionar normalmente.\n\nErro: ${e.message}`,
        fonte: 'Sistema de Núcleos',
        erro_isolado: true,
        duracao_ms: Date.now() - inicio,
      });
    }
  }

  // ── 3. Detectar pedido de acesso a apps/sistema ───────────────
  const pedidoSistema = detectarPedidoSistema(mensagem);
  if (pedidoSistema && estado) {
    const resp = await processarPedidoSistema(pedidoSistema, mensagem, userId);
    if (resp) return res.json({ ...resp, duracao_ms: Date.now() - inicio });
  }

  // ── 4. Construir prompt cebola ────────────────────────────────
  let systemPrompt;
  if (estado) {
    systemPrompt = promptCebola(estado);
  } else {
    // Fallback se KV não disponível — usar prompts padrão
    systemPrompt = Object.values(NUCLEOS_DEF)
      .map(n => `${n.emoji} ${n.nome.toUpperCase()}: ${n.prompt}`)
      .join('\n\n');
  }

  // Adicionar contexto de modo
  if (modo === 'profundo') {
    systemPrompt += '\n\nMODO PROFUNDO: Usa chain-of-thought explícito. Mostra o teu raciocínio passo a passo antes da resposta final.';
  }
  if (modo === 'multi_orgao' && orgao) {
    systemPrompt += `\n\nMODO ÓRGÃO: Responde especificamente como o órgão "${orgao}" — com a sua perspetiva e especialidade.`;
  }

  const msgs = [
    { role: 'system', content: systemPrompt },
    ...historico.slice(-8),
    { role: 'user', content: mensagem },
  ];

  // ── 5. Chamar modelo ──────────────────────────────────────────
  // Tentativa 1: Modelo próprio da GAIA (Hugging Face)
  const hfRepo = process.env.HF_MODEL_REPO;
  if (hfRepo && process.env.HF_TOKEN) {
    try {
      const r = await fetch(
        `https://api-inference.huggingface.co/models/${hfRepo}/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: hfRepo, messages: msgs, max_tokens: 1200, temperature: 0.7 }),
          signal: AbortSignal.timeout(25000),
        }
      );
      if (r.ok) {
        const d = await r.json();
        const resposta = d.choices?.[0]?.message?.content;
        if (resposta) return res.json({
          resposta, fonte: 'GAIA (modelo próprio)', independente: true,
          nucleos_activos: estado ? Object.values(estado).filter(n=>n.activo).length : 6,
          duracao_ms: Date.now() - inicio,
        });
      }
    } catch (e) { console.log('HF falhou:', e.message); }
  }

  // Tentativa 2: Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: msgs, max_tokens: 1200, temperature: 0.7 }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) {
        const d = await r.json();
        return res.json({
          resposta: d.choices?.[0]?.message?.content || 'Sem resposta',
          fonte: 'Groq/LLaMA (fallback)', independente: false,
          nucleos_activos: estado ? Object.values(estado).filter(n=>n.activo).length : 6,
          duracao_ms: Date.now() - inicio,
        });
      }
    } catch (e) { console.error('Groq falhou:', e.message); }
  }

  return res.status(503).json({ erro: 'Nenhuma API disponível. Configura GROQ_API_KEY.' });
}

// ── Gerar novo prompt para um núcleo via LLM ──────────────────────
async function gerarNovoPromptNucleo(nucleoId, def, pedidoIvo, historico) {
  const instrucao = `O utilizador quer melhorar o ${def.emoji} Núcleo ${nucleoId} (${def.nome}) da GAIA.

Prompt actual do núcleo:
${def.prompt}

Pedido do Ivo: "${pedidoIvo}"

Gera um novo prompt melhorado para este núcleo que incorpore o pedido do Ivo.
O prompt deve:
- Manter a essência do núcleo
- Incorporar a melhoria pedida
- Ser claro e directo
- Ter máximo 200 palavras

Responde APENAS com o novo prompt, sem explicações.`;

  if (process.env.GROQ_API_KEY) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: instrucao }],
        max_tokens: 400, temperature: 0.3,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.choices?.[0]?.message?.content || def.prompt;
    }
  }
  return def.prompt; // fallback — manter prompt original
}

// ── Detectar pedidos de sistema/apps ─────────────────────────────
function detectarPedidoSistema(msg) {
  const m = msg.toLowerCase();
  if (m.match(/abre?\s+o\s+(.+)/i)) return { tipo: 'abrir_app', app: msg.match(/abre?\s+o\s+(.+)/i)?.[1] };
  if (m.match(/instala[-\s]te\s+em/i)) return { tipo: 'instalar_rede' };
  if (m.match(/rectifica?\s+o\s+problema/i)) return { tipo: 'rectificar' };
  if (m.includes('que apps') || m.includes('aplicações instaladas')) return { tipo: 'listar_apps' };
  return null;
}

async function processarPedidoSistema(pedido, msgOriginal, userId) {
  if (pedido.tipo === 'listar_apps') {
    return {
      resposta: `Para ver as apps instaladas no teu computador, abre a aplicação GAIA Desktop.\n\nNo browser não tenho acesso directo ao sistema — essa capacidade está no Núcleo 4 (Sistema) que funciona via a app desktop.\n\nJá instalaste o GAIA Desktop?`,
      fonte: 'Núcleo 4 — Sistema',
    };
  }
  return null;
}

// ── Registar versão global ────────────────────────────────────────
async function registarVersaoGlobal(userId, entrada) {
  try {
    const chave = `gaia:versoes:${userId}`;
    const dados = await kv.get(chave) || { versoes: [], atual: null };
    const id = 'v' + (dados.versoes.length + 1) + '.0';
    dados.versoes.push({ id, ...entrada });
    dados.atual = id;
    await kv.set(chave, dados, { ex: 31536000 });
    return id;
  } catch { return null; }
}
