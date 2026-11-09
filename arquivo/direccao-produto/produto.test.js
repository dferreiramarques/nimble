'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('./produto.js');

function armazemFalso() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('limpar recusa o que não é um produto do nimble', () => {
  assert.strictEqual(P.limpar(null), null);
  assert.strictEqual(P.limpar({ app: 'roadmaps-public', nome: 'x' }), null);
  assert.strictEqual(P.limpar([]), null);
  assert.deepStrictEqual(P.importar('{não é json').ok, false);
  assert.strictEqual(P.importar('{"app":"outro"}').ok, false);
});

test('limpar põe limites, descarta lixo e nunca confia no ficheiro', () => {
  const p = P.limpar({
    app: 'nimble-produto', nome: '  ' + 'x'.repeat(200) + '  ',
    notas: [{ id: 'nota-1', etapa: 'X', titulo: 'a\nb', texto: 'l1\r\nl2\u0000' }, null, 3],
    features: [{ titulo: '   ' }, { id: 'feat-1', titulo: 'Pesquisa', coluna: 'nunca', tag: 't'.repeat(99), descricao: 'd'.repeat(999) }],
    diagramas: [{ id: 'dia-1', nodes: [{ id: 'n1' }] }, 'lixo'],
    boards: 'não é lista'
  });
  assert.strictEqual(p.nome.length, P.LIMITES.nome);
  assert.strictEqual(p.notas.length, 1);
  assert.strictEqual(p.notas[0].etapa, '0');
  assert.strictEqual(p.notas[0].titulo, 'a b');
  assert.strictEqual(p.notas[0].texto, 'l1\nl2');
  assert.strictEqual(p.features.length, 1);
  assert.strictEqual(p.features[0].coluna, 'later');
  assert.strictEqual(p.features[0].tag.length, P.LIMITES.tag);
  assert.strictEqual(p.features[0].descricao.length, P.LIMITES.descricao);
  assert.deepStrictEqual(p.diagramas, [{ id: 'dia-1', nodes: [{ id: 'n1' }] }]);
  assert.deepStrictEqual(p.boards, []);
});

test('os ids válidos mantêm-se e os repetidos ou inválidos ganham outro', () => {
  const p = P.limpar({
    app: 'nimble-produto', id: 'prod-1',
    notas: [{ id: 'igual' }, { id: 'igual' }, { id: '<script>' }],
    features: [{ id: 'igual', titulo: 'A' }]
  });
  assert.strictEqual(p.id, 'prod-1');
  const ids = [p.id].concat(p.notas.map(n => n.id), p.features.map(f => f.id));
  assert.strictEqual(new Set(ids).size, ids.length, 'ids repetidos: ' + ids);
  assert.strictEqual(p.notas[0].id, 'igual');
  assert.ok(p.notas.every(n => /^[A-Za-z0-9_-]{4,40}$/.test(n.id)));
});

test('exportar → importar devolve o mesmo produto, campo a campo', () => {
  const s = P.criarStore(P.adaptadorLocal(armazemFalso()));
  s.criar('Teste');
  s.mudar(p => {
    const n = P.ops.addNota(p, '0');
    P.ops.setNota(p, n, { titulo: 'Contrato', texto: 'seis semanas\ndois testes' });
    P.ops.addFeature(p, 'Pesquisa', 'next');
    P.ops.addFeature(p, 'Exportar', 'now');
  });
  const a = s.produto();
  const r = P.importar(P.exportar(a));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.produto, a);
});

test('o armazém guarda e um armazém novo volta a ler o mesmo produto', () => {
  const falso = armazemFalso();
  const s1 = P.criarStore(P.adaptadorLocal(falso));
  assert.strictEqual(s1.existe(), false);
  s1.criar('Meu produto');
  s1.mudar(p => { P.ops.addFeature(p, 'Ideia', 'later'); });
  const s2 = P.criarStore(P.adaptadorLocal(falso));
  assert.strictEqual(s2.existe(), true);
  assert.strictEqual(s2.produto().nome, 'Meu produto');
  assert.strictEqual(s2.produto().features[0].titulo, 'Ideia');
});

test('mudar avisa quem ouve, com render:false quando pedido, e não deixa o resultado ficar partido', () => {
  const s = P.criarStore(P.adaptadorLocal(armazemFalso()));
  s.criar('x');
  const vistos = [];
  const parar = s.aoMudar(i => vistos.push(i));
  s.mudar(p => { p.nome = 'novo'; });
  s.mudar(p => { p.nome = 'outro'; }, { render: false });
  assert.deepStrictEqual(vistos.map(v => v.render), [true, false]);
  assert.ok(vistos.every(v => v.gravado === true));
  s.mudar(p => { p.app = 'estragado'; });
  assert.strictEqual(s.produto().app, 'nimble-produto');
  assert.strictEqual(s.produto().nome, 'outro');
  parar();
  s.mudar(p => { p.nome = 'z'; });
  assert.strictEqual(vistos.length, 2);
});

test('armazenamento corrompido ou cheio: avisa em PT e não rebenta', () => {
  const falso = armazemFalso();
  falso.setItem('nimble.produto.v1', '{lixo');
  const s = P.criarStore(P.adaptadorLocal(falso));
  assert.strictEqual(s.existe(), false);
  assert.match(s.erro(), /corrompido/);

  const cheio = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const s2 = P.criarStore(P.adaptadorLocal(cheio));
  const visto = [];
  s2.aoMudar(i => visto.push(i));
  s2.criar('x');
  assert.strictEqual(visto[0].gravado, false);
  assert.match(visto[0].erro, /Exporta o produto/);
  assert.strictEqual(s2.existe(), true);
});

test('features: mover entre colunas e antes de outra, apagar, e título vazio recusado', () => {
  const s = P.criarStore(P.adaptadorLocal(armazemFalso()));
  s.criar('x');
  const ids = {};
  s.mudar(p => {
    ids.a = P.ops.addFeature(p, 'A', 'now');
    ids.b = P.ops.addFeature(p, 'B', 'now');
    ids.c = P.ops.addFeature(p, 'C', 'next');
    assert.strictEqual(P.ops.addFeature(p, '   ', 'now'), null);
  });
  s.mudar(p => { P.ops.moverFeature(p, ids.c, 'now', ids.a); });
  assert.deepStrictEqual(s.produto().features.map(f => f.titulo + ':' + f.coluna), ['C:now', 'A:now', 'B:now']);
  s.mudar(p => { P.ops.moverFeature(p, ids.a, 'later'); });
  assert.deepStrictEqual(s.produto().features.map(f => f.titulo + ':' + f.coluna), ['C:now', 'B:now', 'A:later']);
  assert.strictEqual(s.mudar(p => P.ops.setFeature(p, ids.b, { titulo: '' })), false);
  assert.strictEqual(s.produto().features.find(f => f.id === ids.b).titulo, 'B');
  s.mudar(p => { P.ops.delFeature(p, ids.b); });
  assert.strictEqual(s.produto().features.length, 2);
});

test('notas: só as etapas 0, 4, 5 e T; uma referência partida não rebenta', () => {
  const s = P.criarStore(P.adaptadorLocal(armazemFalso()));
  s.criar('x');
  s.mudar(p => { P.ops.addNota(p, '4'); P.ops.addNota(p, '2'); });
  assert.deepStrictEqual(s.produto().notas.map(n => n.etapa), ['4', '0']);
  assert.strictEqual(s.mudar(p => P.ops.setNota(p, 'nao-existe', { titulo: 'x' })), false);
  assert.strictEqual(s.mudar(p => P.ops.delNota(p, 'nao-existe')), false);
  assert.strictEqual(s.mudar(p => P.ops.moverFeature(p, 'nao-existe', 'now')), false);
});
