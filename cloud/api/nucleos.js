/**
 * GAIA — API de Núcleos
 * GET  → ver estado de todos os núcleos
 * POST → melhorar / rollback / toggle
 */
import { lerEstado, guardarEstado, melhorarNucleo, rollbackNucleo, toggleNucleo, NUCLEOS_DEF } from '../lib/nucleos.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const userId = req.query.userId || req.body?.userId || 'ivo';

  // ── GET — ver todos os núcleos ────────────────────────────────
  if (req.method === 'GET') {
    const estado = await lerEstado(userId);
    const nucleos = Object.entries(estado).map(([id, n]) => ({
      id: parseInt(id),
      nome: n.nome, emoji: n.emoji, cor: n.cor,
      activo: n.activo, versao: n.versao,
      imutavel: NUCLEOS_DEF[id]?.imutavel || false,
      descricao: NUCLEOS_DEF[id]?.descricao || '',
      ultimaAlteracao: n.ultimaAlteracao,
      descricaoAlteracao: n.descricaoAlteracao,
      nHistorico: n.historico?.length || 0,
    }));
    return res.json({ ok: true, nucleos, total: nucleos.length });
  }

  // ── POST — acções ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const { acao, nucleoId, descricao, novoPrompt } = req.body || {};

    switch (acao) {
      case 'melhorar': {
        if (nucleoId === undefined) return res.status(400).json({ erro: 'nucleoId em falta' });
        if (!novoPrompt && !descricao) return res.status(400).json({ erro: 'novoPrompt ou descricao em falta' });
        const prompt = novoPrompt || NUCLEOS_DEF[nucleoId]?.prompt || '';
        const r = await melhorarNucleo(userId, parseInt(nucleoId), descricao || 'Melhoria manual', prompt);
        return res.json(r);
      }
      case 'rollback': {
        if (nucleoId === undefined) return res.status(400).json({ erro: 'nucleoId em falta' });
        const r = await rollbackNucleo(userId, parseInt(nucleoId));
        return res.json(r);
      }
      case 'toggle': {
        if (nucleoId === undefined) return res.status(400).json({ erro: 'nucleoId em falta' });
        const { activo } = req.body;
        const r = await toggleNucleo(userId, parseInt(nucleoId), activo !== false);
        return res.json(r);
      }
      case 'reset': {
        // Reset de um núcleo para os valores padrão
        if (nucleoId === 0) return res.json({ ok: false, erro: 'Núcleo 0 imutável.' });
        const def = NUCLEOS_DEF[parseInt(nucleoId)];
        if (!def) return res.json({ ok: false, erro: 'Núcleo não existe.' });
        const r = await melhorarNucleo(userId, parseInt(nucleoId), 'Reset para valores padrão', def.prompt);
        return res.json({ ...r, mensagem: `Núcleo ${nucleoId} reposto para valores padrão.` });
      }
      default:
        return res.status(400).json({ erro: `Acção desconhecida: ${acao}` });
    }
  }

  return res.status(405).end();
}
