'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./js/casca-modelo.js');

test('limparCasca de lixo dá uma casca vazia e válida', () => {
  for (const x of [null, 1, 'x', [], { canvas: 7, equipa: 'a' }]) {
    const c = M.limparCasca(x);
    assert.equal(c.canvas.nome, '');
    assert.equal(c.canvas.tipo, null);
    assert.deepEqual(c.canvas.taxonomia, []);
    assert.deepEqual(Object.keys(c.canvas.pitch), M.PITCH);
    assert.deepEqual(c.equipa, []);
  }
});

test('canvas: textos limpos e com limite, tipo só da lista', () => {
  const c = M.limparCanvas({ nome: '  Receitas\n  Pro ', tagline: 'x'.repeat(500), tipo: 'foguetão', pitch: { proposta: 'a\u0001b' } });
  assert.equal(c.nome, 'Receitas Pro');
  assert.equal(c.tagline.length, M.LIM.tagline);
  assert.equal(c.tipo, null);
  assert.equal(c.pitch.proposta, 'a b');
  assert.equal(M.limparCanvas({ tipo: 'pwa-mit' }).tipo, 'pwa-mit');
});

test('listas: uma por linha, sem vazios nem repetidos, com limite', () => {
  assert.deepEqual(M.linhas('Receitas\n\n receitas \nCozinha\n'), ['Receitas', 'Cozinha']);
  assert.deepEqual(M.linhas(['a', 'b', 'A']), ['a', 'b']);
  assert.equal(M.linhas(Array.from({ length: 80 }, (_, i) => 't' + i)).length, M.LIM.itens);
});

test('equipa: ids únicos, conta só uuid, alocação 0–100, sem nome sai', () => {
  const c = M.limparCasca({ equipa: [
    { id: 'mem_aaaa1111', nome: 'Ana', conta: 'nao-e-uuid', papeis: [{ papel: 'PO', alocacao: 150 }, { papel: '', alocacao: 10 }, { papel: 'dev', alocacao: -5 }] },
    { id: 'mem_aaaa1111', nome: 'Rui', conta: '0B3F2C9E-1111-4222-8333-944455556666' },
    { nome: '' }
  ] });
  assert.equal(c.equipa.length, 2);
  assert.notEqual(c.equipa[0].id, c.equipa[1].id);
  assert.equal(c.equipa[0].conta, null);
  assert.equal(c.equipa[1].conta, '0b3f2c9e-1111-4222-8333-944455556666');
  assert.deepEqual(c.equipa[0].papeis, [{ papel: 'PO', alocacao: 100 }, { papel: 'dev', alocacao: 0 }]);
});

test('avisos: nome, tipo e sobre-alocação', () => {
  const vazio = M.avisos(M.limparCasca({}));
  assert.equal(vazio.length, 2);
  const a = M.avisos(M.limparCasca({ canvas: { nome: 'X', tipo: 'saas-web' }, equipa: [{ nome: 'Ana', papeis: [{ papel: 'PO', alocacao: 80 }, { papel: 'dev', alocacao: 40 }] }] }));
  assert.deepEqual(a, ['Ana: alocação total de 120% (mais de 100%).']);
});

test('completude: 0 vazia, 100 cheia', () => {
  assert.equal(M.completude(M.limparCanvas({})), 0);
  const cheia = { nome: 'n', tagline: 't', tipo: 'site', northStar: 's', pitch: { proposta: 1, diferenciador: 1, utilizadores: 1, alcance: 1, cronologia: 1 }, taxonomia: ['a'], temas: ['a'], spikes: ['a'], outcomes: ['a'] };
  assert.equal(M.completude(M.limparCanvas(cheia)), 100);
});

test('round-trip: limpar(limpar(x)) == limpar(x)', () => {
  const x = M.limparCasca({ canvas: { nome: 'R', taxonomia: 'a\nb', escolhas: { arquitectura: 'PWA' } }, equipa: [{ nome: 'Ana', papeis: [{ papel: 'PO', alocacao: 50 }] }] });
  assert.deepEqual(M.limparCasca(JSON.parse(JSON.stringify(x))), x);
});

test('exportarProjecto junta as fatias num ficheiro monco-projecto', () => {
  const j = JSON.parse(M.exportarProjecto({ nome: 'R', criado_em: '2026-11-09T10:00:00Z' }, { casca: { dados: { a: 1 } }, veredicto: { dados: { app: 'veredicto' } } }));
  assert.equal(j.app, 'monco-projecto');
  assert.deepEqual(Object.keys(j.fatias), ['casca', 'veredicto']);
  assert.equal(j.projecto.criadoEm, '2026-11-09T10:00:00Z');
});

test('slug para nomes de ficheiro', () => {
  assert.equal(M.slug('Receitas Pró!! 2026'), 'receitas-pro-2026');
  assert.equal(M.slug('///'), 'projecto');
});
