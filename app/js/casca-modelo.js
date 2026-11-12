'use strict';
/* casca-modelo.js — a fatia `casca` (canvas + equipa) e a exportação do projecto. Sem DOM; testável em Node.
 * Esquema: nimble-suite/docs/esquema-projecto.md §3.1 · nada que vem de fora é confiado. */
(function (raiz) {
  var TIPOS = [
    { id: 'pwa-mit', nome: 'PWA MIT', nota: 'sem pagamentos nem dados geridos' },
    { id: 'saas-web', nome: 'SaaS web', nota: 'contas, dados, pagamentos' },
    { id: 'site', nome: 'Product page / site', nota: 'construir curto, lançar é quase tudo' },
    { id: 'port', nome: 'Port', nota: 'migração de arquitectura e ajuste de features' },
    { id: 'interna', nome: 'Ferramenta interna', nota: 'local, sem lançamento público' },
    { id: 'protocolo', nome: 'Protocolo de comunicação', nota: 'dominado por spikes' },
    { id: 'apresentacao', nome: 'Apresentação / formação', nota: 'slides dinâmicos online' }
  ];
  var IDS_TIPO = TIPOS.map(function (t) { return t.id; });
  var PITCH = ['proposta', 'diferenciador', 'utilizadores', 'alcance', 'cronologia'];
  var LISTAS = ['taxonomia', 'temas', 'spikes', 'outcomes'];
  var APPS = ['casca', 'roadmaps', 'taskboards', 'diagramico', 'veredicto'];
  var LIM = { nome: 80, tagline: 140, texto: 600, item: 80, itens: 50, pessoas: 50, papeis: 8, papel: 40 };
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function txt(v, max) { return v == null ? '' : String(v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max); }
  function umaLinha(v, max) { return txt(v, max).replace(/\s*\n\s*/g, ' '); }
  function novoId(p) { return p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  /* texto com uma entrada por linha → lista limpa, sem repetidos */
  function linhas(v) {
    var vistos = {}, r = [];
    (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/)).forEach(function (l) {
      var s = umaLinha(l, LIM.item);
      var k = s.toLowerCase();
      if (s && !vistos[k] && r.length < LIM.itens) { vistos[k] = true; r.push(s); }
    });
    return r;
  }

  function limparCanvas(c) {
    c = c && typeof c === 'object' ? c : {};
    var p = c.pitch && typeof c.pitch === 'object' ? c.pitch : {};
    var e = c.escolhas && typeof c.escolhas === 'object' ? c.escolhas : {};
    var out = {
      nome: umaLinha(c.nome, LIM.nome),
      tagline: umaLinha(c.tagline, LIM.tagline),
      pitch: {},
      tipo: IDS_TIPO.indexOf(c.tipo) >= 0 ? c.tipo : null,
      northStar: txt(c.northStar, LIM.texto),
      escolhas: { arquitectura: umaLinha(e.arquitectura, LIM.tagline), designSystem: umaLinha(e.designSystem, LIM.tagline) },
      extraidoPorIA: Math.max(0, Math.floor(Number(c.extraidoPorIA)) || 0)
    };
    PITCH.forEach(function (k) { out.pitch[k] = txt(p[k], LIM.texto); });
    LISTAS.forEach(function (k) { out[k] = linhas(c[k]); });
    return out;
  }

  function limparPessoa(m, vistos) {
    if (!m || typeof m !== 'object') return null;
    var nome = umaLinha(m.nome, LIM.nome);
    if (!nome) return null;
    var id = /^mem_[a-z0-9]{4,24}$/.test(String(m.id)) && !vistos[m.id] ? m.id : novoId('mem');
    vistos[id] = true;
    var papeis = (Array.isArray(m.papeis) ? m.papeis : []).slice(0, LIM.papeis).map(function (x) {
      var papel = umaLinha(x && x.papel, LIM.papel);
      if (!papel) return null;
      var a = Math.round(Number(x.alocacao));
      return { papel: papel, alocacao: isFinite(a) ? Math.min(100, Math.max(0, a)) : 0 };
    }).filter(Boolean);
    return { id: id, nome: nome, conta: RE_UUID.test(String(m.conta)) ? String(m.conta).toLowerCase() : null, papeis: papeis };
  }

  function limparCasca(d) {
    d = d && typeof d === 'object' ? d : {};
    var vistos = {};
    return {
      canvas: limparCanvas(d.canvas),
      equipa: (Array.isArray(d.equipa) ? d.equipa : []).slice(0, LIM.pessoas).map(function (m) { return limparPessoa(m, vistos); }).filter(Boolean)
    };
  }

  function alocacaoTotal(pessoa) {
    return (pessoa.papeis || []).reduce(function (s, p) { return s + (Number(p.alocacao) || 0); }, 0);
  }

  /* avisos que não impedem gravar */
  function avisos(casca) {
    var a = [];
    if (!casca.canvas.nome) a.push('O projecto precisa de um nome.');
    if (!casca.canvas.tipo) a.push('Escolhe o tipo de projecto — decide o pacote de arranque.');
    casca.equipa.forEach(function (p) {
      var t = alocacaoTotal(p);
      if (t > 100) a.push(p.nome + ': alocação total de ' + t + '% (mais de 100%).');
    });
    return a;
  }

  /* quanto da canvas está preenchido (0–100) — campos que contam para o arranque */
  function completude(canvas) {
    var campos = [canvas.nome, canvas.tagline, canvas.tipo, canvas.northStar]
      .concat(PITCH.map(function (k) { return canvas.pitch[k]; }))
      .concat(LISTAS.map(function (k) { return canvas[k].length ? 'x' : ''; }));
    var cheios = campos.filter(function (v) { return !!v; }).length;
    return Math.round(100 * cheios / campos.length);
  }

  function exportarProjecto(projecto, fatias) {
    var f = {};
    APPS.forEach(function (app) { if (fatias[app]) f[app] = fatias[app].dados; });
    return JSON.stringify({ app: 'monco-projecto', versao: 1, projecto: { nome: projecto.nome, criadoEm: projecto.criado_em }, fatias: f }, null, 2) + '\n';
  }

  /* nome de ficheiro seguro a partir do nome do projecto */
  function slug(s) {
    return String(s || 'projecto').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'projecto';
  }

  /* atalho para abrir o projecto numa app em modo monco: <base>/?projecto=<id> (base vem do /config.js) */
  function urlApp(base, projecto) {
    var b = String(base || '').replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s?#]+$/.test(b)) return null;
    return b + '/?projecto=' + encodeURIComponent(String(projecto || ''));
  }

  var api = {
    TIPOS: TIPOS, PITCH: PITCH, LISTAS: LISTAS, APPS: APPS, LIM: LIM,
    linhas: linhas, limparCanvas: limparCanvas, limparCasca: limparCasca, limparPessoa: limparPessoa,
    alocacaoTotal: alocacaoTotal, avisos: avisos, completude: completude, exportarProjecto: exportarProjecto, slug: slug, novoId: novoId, urlApp: urlApp
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CascaModelo = api;
})(this);
