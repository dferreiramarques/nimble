/* app.js — a interface do nimble (passo 1: casca, notas e Roadmaps).
 * Só texto vai para o DOM por textContent; sem HTML injectado e sem rede.
 * Os dados vivem no objecto «produto» (produto.js); aqui só se desenha e se pede mudanças.
 */
(function () {
  'use strict';

  var P = window.Produto;

  var TEXTOS_ETAPA = {
    '0': 'O contrato do ciclo: o que é a unidade, a cadência e o que se promete.',
    '1': 'Ideação: conceito, problema, non-goals e diagramas lógicos.',
    '2': 'Priorização: o que entra e com que apetite — Now, Next e Later.',
    '3': 'Construção: boards e tarefas de cada iteração.',
    '4': 'Validação: hipóteses, o sinal observado e o veredicto de cada teste.',
    '5': 'Lançamento: o que fica aberto, licenças e changelog.',
    'T': 'O que se aprendeu e entra no próximo ciclo.'
  };
  var COLUNAS = { now: 'Now', next: 'Next', later: 'Later' };

  function memoria() {
    var m = {};
    return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } };
  }

  function armazem() {
    try {
      var s = window.localStorage;
      s.setItem('nimble.teste', '1');
      s.removeItem('nimble.teste');
      return s;
    } catch (e) {
      return memoria();
    }
  }

  var store = P.criarStore(P.adaptadorLocal(armazem()));
  var estado = { aba: '0', editando: '' };
  var pendentes = {};

  function $(id) { return document.getElementById(id); }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function limpar(no) {
    while (no.firstChild) no.removeChild(no.firstChild);
  }

  function botao(texto, classe, aoClicar, rotulo) {
    var b = el('button', 'btn ' + (classe || ''), texto);
    b.type = 'button';
    if (rotulo) b.setAttribute('aria-label', rotulo);
    b.addEventListener('click', aoClicar);
    return b;
  }

  /* ---- gravação adiada (escrita de texto) ---------------------------- */

  function adiar(chave, fn) {
    if (pendentes[chave]) clearTimeout(pendentes[chave].t);
    pendentes[chave] = { fn: fn, t: setTimeout(function () { executar(chave); }, 300) };
    chip('A escrever…', '');
  }

  function executar(chave) {
    var p = pendentes[chave];
    if (!p) return;
    clearTimeout(p.t);
    delete pendentes[chave];
    p.fn();
  }

  function executarTodos() {
    Object.keys(pendentes).forEach(executar);
  }

  /* ---- cabeça -------------------------------------------------------- */

  function chip(texto, classe) {
    var c = $('chip');
    c.textContent = texto;
    c.className = 'chip' + (classe ? ' chip--' + classe : '');
  }

  function desenharTopo() {
    var existe = store.existe();
    var nome = $('nome');
    nome.hidden = !existe;
    $('btn-exportar').hidden = !existe;
    $('btn-importar').hidden = false;
    $('abas').hidden = !existe;
    if (existe && document.activeElement !== nome) nome.value = store.produto().nome;
    document.title = existe ? store.produto().nome + ' — nimble' : 'nimble';
  }

  function desenharAbas() {
    var nav = $('abas');
    limpar(nav);
    P.ETAPAS.forEach(function (e) {
      var b = el('button', 'aba');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(e.id === estado.aba));
      b.appendChild(el('span', 'aba__n', e.id));
      b.appendChild(document.createTextNode(e.nome));
      b.addEventListener('click', function () { executarTodos(); location.hash = e.id; });
      nav.appendChild(b);
    });
  }

  /* ---- vistas -------------------------------------------------------- */

  function vistaInicio(v) {
    var s = el('section', 'inicio');
    s.appendChild(el('h1', null, 'Um produto, um ficheiro'));
    s.appendChild(el('p', 'vista__sub', 'Notas, roadmap, diagramas e boards no mesmo sítio. Dá um nome ao teu produto para começar.'));
    var f = el('form');
    var nome = el('input', 'campo');
    nome.type = 'text';
    nome.maxLength = 60;
    nome.placeholder = 'Nome do produto';
    nome.setAttribute('aria-label', 'Nome do produto');
    f.appendChild(nome);
    var criar = el('button', 'btn btn--primario', 'Criar produto');
    criar.type = 'submit';
    f.appendChild(criar);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      store.criar(nome.value || 'Novo produto');
    });
    s.appendChild(f);
    v.appendChild(s);
    nome.focus();
  }

  function vistaNotas(v, etapa) {
    var p = store.produto();
    v.appendChild(el('h1', null, etapa.id + ' · ' + etapa.nome));
    v.appendChild(el('p', 'vista__sub', TEXTOS_ETAPA[etapa.id]));

    var lista = el('div', 'notas');
    var notas = p.notas.filter(function (n) { return n.etapa === etapa.id; });
    if (!notas.length) lista.appendChild(el('p', 'vazio', 'Ainda não há notas nesta etapa.'));
    notas.forEach(function (n) {
      var c = el('article', 'nota');
      var titulo = el('input', 'campo nota__titulo');
      titulo.type = 'text';
      titulo.maxLength = 80;
      titulo.value = n.titulo;
      titulo.placeholder = 'Título';
      titulo.setAttribute('aria-label', 'Título da nota');
      var texto = el('textarea', 'campo');
      texto.value = n.texto;
      texto.placeholder = 'Escreve aqui…';
      texto.setAttribute('aria-label', 'Texto da nota');
      titulo.addEventListener('input', function () {
        adiar('t' + n.id, function () { store.mudar(function (d) { P.ops.setNota(d, n.id, { titulo: titulo.value }); }, { render: false }); });
      });
      texto.addEventListener('input', function () {
        adiar('x' + n.id, function () { store.mudar(function (d) { P.ops.setNota(d, n.id, { texto: texto.value }); }, { render: false }); });
      });
      var rodape = el('div', 'nota__rodape');
      rodape.appendChild(botao('Apagar', 'btn--texto btn--perigo btn--pequeno', function () {
        if ((n.titulo || n.texto) && !window.confirm('Apagar esta nota?')) return;
        executarTodos();
        store.mudar(function (d) { P.ops.delNota(d, n.id); });
      }));
      c.appendChild(titulo);
      c.appendChild(texto);
      c.appendChild(rodape);
      lista.appendChild(c);
    });
    v.appendChild(lista);
    var nova = botao('Nova nota', 'btn--primario', function () {
      executarTodos();
      store.mudar(function (d) { P.ops.addNota(d, etapa.id); });
    });
    v.appendChild(nova);
  }

  function vistaEmBreve(v, etapa) {
    v.appendChild(el('h1', null, etapa.id + ' · ' + etapa.nome));
    v.appendChild(el('p', 'vista__sub', TEXTOS_ETAPA[etapa.id]));
    v.appendChild(el('p', 'em-breve', 'Esta etapa chega nos próximos passos. O ficheiro do produto já tem lugar para ela.'));
  }

  function cartaoFeature(f) {
    var c = el('article', 'cartao');
    c.draggable = true;
    c.dataset.id = f.id;
    c.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', f.id);
      e.dataTransfer.effectAllowed = 'move';
      c.dataset.aArrastar = 'true';
    });
    c.addEventListener('dragend', function () { delete c.dataset.aArrastar; });

    if (estado.editando === f.id) {
      var form = el('form');
      var t = el('input', 'campo'); t.type = 'text'; t.maxLength = 80; t.value = f.titulo; t.setAttribute('aria-label', 'Título');
      var d = el('textarea', 'campo'); d.maxLength = 280; d.value = f.descricao; d.placeholder = 'Descrição'; d.setAttribute('aria-label', 'Descrição');
      var g = el('input', 'campo'); g.type = 'text'; g.maxLength = 20; g.value = f.tag; g.placeholder = 'Etiqueta'; g.setAttribute('aria-label', 'Etiqueta');
      var btns = el('div', 'btns');
      var ok = el('button', 'btn btn--primario btn--pequeno', 'Guardar'); ok.type = 'submit';
      btns.appendChild(ok);
      btns.appendChild(botao('Cancelar', 'btn--pequeno', function () { estado.editando = ''; render(); }));
      [t, d, g, btns].forEach(function (x) { form.appendChild(x); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        estado.editando = '';
        store.mudar(function (dr) { P.ops.setFeature(dr, f.id, { titulo: t.value, descricao: d.value, tag: g.value }); });
      });
      c.draggable = false;
      c.appendChild(form);
      return c;
    }

    c.appendChild(el('p', 'cartao__titulo', f.titulo));
    if (f.descricao) c.appendChild(el('p', 'cartao__desc', f.descricao));
    if (f.tag) c.appendChild(el('span', 'cartao__tag', f.tag));

    var acc = el('div', 'cartao__accoes');
    var i = P.COLUNAS.indexOf(f.coluna);
    if (i > 0) {
      var ant = P.COLUNAS[i - 1];
      acc.appendChild(botao('◀', 'btn--texto btn--pequeno', function () { store.mudar(function (d) { P.ops.moverFeature(d, f.id, ant); }); }, 'Mover para ' + COLUNAS[ant]));
    }
    if (i < P.COLUNAS.length - 1) {
      var seg = P.COLUNAS[i + 1];
      acc.appendChild(botao('▶', 'btn--texto btn--pequeno', function () { store.mudar(function (d) { P.ops.moverFeature(d, f.id, seg); }); }, 'Mover para ' + COLUNAS[seg]));
    }
    acc.appendChild(botao('Editar', 'btn--texto btn--pequeno', function () { estado.editando = f.id; render(); }));
    acc.appendChild(botao('Apagar', 'btn--texto btn--perigo btn--pequeno', function () {
      if (!window.confirm('Apagar «' + f.titulo + '»?')) return;
      store.mudar(function (d) { P.ops.delFeature(d, f.id); });
    }));
    c.appendChild(acc);
    return c;
  }

  function antesDe(coluna, y, idArrastado) {
    var cartoes = Array.prototype.slice.call(coluna.querySelectorAll('.cartao'));
    for (var k = 0; k < cartoes.length; k++) {
      if (cartoes[k].dataset.id === idArrastado) continue;
      var r = cartoes[k].getBoundingClientRect();
      if (y < r.top + r.height / 2) return cartoes[k].dataset.id;
    }
    return undefined;
  }

  function vistaRoadmap(v, etapa) {
    var p = store.produto();
    v.appendChild(el('h1', null, etapa.id + ' · ' + etapa.nome));
    v.appendChild(el('p', 'vista__sub', TEXTOS_ETAPA[etapa.id]));

    var grelha = el('div', 'colunas');
    P.COLUNAS.forEach(function (col) {
      var feats = p.features.filter(function (f) { return f.coluna === col; });
      var c = el('section', 'coluna coluna--' + col);
      c.setAttribute('aria-label', COLUNAS[col]);
      var cab = el('div', 'coluna__cab');
      cab.appendChild(el('h2', 'coluna__nome', COLUNAS[col]));
      cab.appendChild(el('span', 'coluna__n', String(feats.length)));
      c.appendChild(cab);

      var cartoes = el('div', 'cartoes');
      feats.forEach(function (f) { cartoes.appendChild(cartaoFeature(f)); });
      c.appendChild(cartoes);

      var form = el('form', 'adicionar');
      var campo = el('input', 'campo');
      campo.type = 'text';
      campo.maxLength = 80;
      campo.placeholder = 'Nova feature';
      campo.setAttribute('aria-label', 'Nova feature em ' + COLUNAS[col]);
      var ok = el('button', 'btn', '+');
      ok.type = 'submit';
      ok.setAttribute('aria-label', 'Adicionar a ' + COLUNAS[col]);
      form.appendChild(campo);
      form.appendChild(ok);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = campo.value;
        if (!t.trim()) return;
        store.mudar(function (d) { P.ops.addFeature(d, t, col); });
      });
      c.appendChild(form);

      c.addEventListener('dragover', function (e) { e.preventDefault(); c.dataset.sobre = 'true'; });
      c.addEventListener('dragleave', function (e) { if (!c.contains(e.relatedTarget)) delete c.dataset.sobre; });
      c.addEventListener('drop', function (e) {
        e.preventDefault();
        delete c.dataset.sobre;
        var id = e.dataTransfer.getData('text/plain');
        var antes = antesDe(c, e.clientY, id);
        store.mudar(function (d) { P.ops.moverFeature(d, id, col, antes); });
      });
      grelha.appendChild(c);
    });
    v.appendChild(grelha);
  }

  /* ---- desenho ------------------------------------------------------- */

  function render() {
    desenharTopo();
    var v = $('vista');
    limpar(v);
    if (!store.existe()) {
      $('abas').hidden = true;
      vistaInicio(v);
      return;
    }
    desenharAbas();
    var etapa = P.ETAPAS.filter(function (e) { return e.id === estado.aba; })[0] || P.ETAPAS[0];
    if (etapa.tipo === 'notas') vistaNotas(v, etapa);
    else if (etapa.tipo === 'roadmap') vistaRoadmap(v, etapa);
    else vistaEmBreve(v, etapa);
  }

  function lerAba() {
    var h = (location.hash || '').replace(/^#/, '').toUpperCase();
    estado.aba = P.ETAPAS.some(function (e) { return e.id === h; }) ? h : '0';
    estado.editando = '';
  }

  /* ---- ficheiro e arranque ------------------------------------------- */

  function exportar() {
    executarTodos();
    var p = store.produto();
    var nome = (p.nome.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') || 'produto') + '.nimble.json';
    var blob = new Blob([P.exportar(p)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importar(ficheiro) {
    var leitor = new FileReader();
    leitor.onload = function () {
      if (store.existe() && !window.confirm('Substituir o produto actual pelo ficheiro importado?')) return;
      var r = store.importar(String(leitor.result));
      if (!r.ok) chip(r.erro, 'erro');
    };
    leitor.onerror = function () { chip('Não consegui ler o ficheiro.', 'erro'); };
    leitor.readAsText(ficheiro);
  }

  store.aoMudar(function (info) {
    if (info.erro) chip(info.erro, 'erro');
    else chip('Guardado', 'ok');
    if (info.render) render();
    else desenharTopo();
  });

  $('nome').addEventListener('input', function () {
    var valor = $('nome').value;
    adiar('nome', function () { store.mudar(function (d) { d.nome = valor; }, { render: false }); });
  });
  $('btn-exportar').addEventListener('click', exportar);
  $('btn-importar').addEventListener('click', function () { $('ficheiro').click(); });
  $('ficheiro').addEventListener('change', function (e) {
    if (e.target.files[0]) importar(e.target.files[0]);
    e.target.value = '';
  });
  window.addEventListener('hashchange', function () { executarTodos(); lerAba(); render(); });
  window.addEventListener('pagehide', executarTodos);
  document.addEventListener('visibilitychange', function () { if (document.hidden) executarTodos(); });

  lerAba();
  render();
  if (store.erro()) chip(store.erro(), 'erro');
}());
