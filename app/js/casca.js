'use strict';
/* casca.js — a interface da Casca: entrar (link mágico), projectos, e o projecto (canvas, equipa, acesso, apps).
 * Todo o texto do utilizador entra por textContent / value (el()). */
(function () {
  var M = window.CascaModelo;
  var cfg = window.MONCO_CONFIG || {};
  var S = window.Supa.criar({ url: cfg.supabaseUrl, key: cfg.supabaseKey });

  var APPS_INFO = [
    { app: 'roadmaps', nome: 'Roadmaps', etapa: '2 · Priorizar', url: 'https://roadmaps.monco.io', desc: 'Now / Next / Later das features do produto.' },
    { app: 'diagramico', nome: 'Diagramico', etapa: '1 · Idear', url: 'https://diagramico.monco.io', desc: 'Jornadas, mapas de afinidade, diagramas ligados a features.' },
    { app: 'taskboards', nome: 'Taskboards', etapa: '3 · Construir', url: 'https://taskboards.monco.io', desc: 'Incrementos: To Do · In Progress · Done.' },
    { app: 'veredicto', nome: 'Veredicto', etapa: '4 · Validar', url: 'https://veredicto.monco.io', desc: 'Hipóteses com métrica, sessões e decisão por incremento.' }
  ];
  var TABS = [['canvas', 'Canvas'], ['equipa', 'Equipa'], ['acesso', 'Acesso'], ['apps', 'Apps']];

  var st = { projectos: null, p: null };   // p: { id, projecto, fatias, membros, perfis, draft, versao, dirty, conflito, tab, eu }

  /* ── utilitários ─────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (filhos || []).forEach(function (f) { if (f != null) n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return n;
  }
  var tTimer;
  function avisar(m) {
    var t = $('toast'); t.textContent = m; t.hidden = false;
    clearTimeout(tTimer); tTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function falhou(e) {
    if (e && e.status === 401) { S.sair(); return render(); }
    avisar(e && e.message ? e.message : 'algo correu mal');
  }
  function hora(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function montar(nodos) { var r = $('raiz'); r.textContent = ''; nodos.forEach(function (n) { if (n) r.appendChild(n); }); }
  function campo(rotulo, controlo, ajuda) { return el('label', { class: 'field' }, [el('span', { text: rotulo }), controlo, ajuda ? el('small', { text: ajuda }) : null]); }
  function descarregar(nome, texto) {
    var url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    var a = el('a', { href: url, download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ── rotas ───────────────────────────────────────────────────────────── */
  function rota() {
    var m = location.hash.match(/^#\/p\/([0-9a-f-]{36})(?:\/(\w+))?/i);
    return m ? { projecto: m[1].toLowerCase(), tab: TABS.some(function (t) { return t[0] === m[2]; }) ? m[2] : 'canvas' } : { lista: true };
  }

  function render() {
    var u = S.utilizador();
    $('quem').textContent = u ? u.email : '';
    $('btn-sair').hidden = !u;
    if (!u) return renderEntrar();
    var r = rota();
    if (r.lista) { st.p = null; return renderProjectos(); }
    if (!st.p || st.p.id !== r.projecto) return abrirProjecto(r.projecto, r.tab);
    st.p.tab = r.tab;
    renderProjecto();
  }

  /* ── entrar ──────────────────────────────────────────────────────────── */
  function renderEntrar(msg) {
    var email = el('input', { class: 'input', type: 'email', autocomplete: 'email', placeholder: 'nome@monco.io', required: true });
    var erro = el('p', { class: 'form__err', 'aria-live': 'assertive' });
    var ok = el('p', { class: 'ok-msg', 'aria-live': 'polite' });
    var botao = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Enviar link de entrada' });
    var form = el('form', { class: 'login card', novalidate: true }, [
      el('h1', { text: 'Entrar na Casca' }),
      el('p', { class: 'muted', text: 'Os projectos integrados monco. Recebes um link por email — sem palavra-passe.' }),
      campo('Email monco', email), erro, ok, botao
    ]);
    if (msg) erro.textContent = msg;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = email.value.trim().toLowerCase();
      erro.textContent = ''; ok.textContent = '';
      if (!/^[^\s@]+@monco\.io$/.test(v)) { erro.textContent = 'Usa o teu email @monco.io.'; return; }
      botao.disabled = true;
      S.enviarLink(v, location.origin + '/app').then(function () {
        ok.textContent = 'Enviámos um link para ' + v + '. Abre-o neste browser.';
      }, function (e) { erro.textContent = e.message; }).then(function () { botao.disabled = false; });
    });
    montar([el('div', { class: 'center' }, [form])]);
    email.focus();
  }

  /* ── projectos ───────────────────────────────────────────────────────── */
  function renderProjectos() {
    var nome = el('input', { class: 'input', maxlength: '80', placeholder: 'nome do projecto novo', 'aria-label': 'Nome do projecto novo' });
    var botao = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Criar projecto' });
    var form = el('form', { class: 'newp' }, [nome, botao]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = nome.value.trim();
      if (!n) { nome.focus(); return; }
      botao.disabled = true;
      S.criarProjecto(n).then(function (p) { st.projectos = null; location.hash = '#/p/' + p.id + '/canvas'; }, falhou)
        .then(function () { botao.disabled = false; });
    });
    var lista = el('div', { class: 'projects' });
    montar([el('section', { class: 'wrap screen' }, [el('div', { class: 'head' }, [el('h1', { text: 'Projectos' })]), form, lista])]);
    if (!st.projectos) {
      lista.appendChild(el('p', { class: 'loading', text: 'A carregar…' }));
      S.listarProjectos().then(function (ps) { st.projectos = ps; if (rota().lista) renderProjectos(); }, falhou);
      return;
    }
    if (!st.projectos.length) {
      lista.appendChild(el('p', { class: 'empty', text: 'Ainda não tens projectos. Cria o primeiro — a canvas começa já a seguir.' }));
      return;
    }
    st.projectos.forEach(function (p) {
      lista.appendChild(el('a', { class: 'project', href: '#/p/' + p.id + '/canvas' }, [el('strong', { text: p.nome }), el('span', { text: 'criado ' + hora(p.criado_em) })]));
    });
  }

  /* ── projecto ────────────────────────────────────────────────────────── */
  function abrirProjecto(id, tab) {
    montar([el('p', { class: 'wrap loading', text: 'A abrir o projecto…' })]);
    Promise.all([S.lerProjecto(id), S.lerFatias(id), S.listarMembros(id)]).then(function (r) {
      if (!r[0]) { avisar('projecto não encontrado ou sem acesso'); location.hash = '#/'; return; }
      var fatias = {};
      r[1].forEach(function (f) { fatias[f.app] = f; });
      var casca = fatias.casca || { dados: {}, versao: 1 };
      st.p = { id: id, projecto: r[0], fatias: fatias, membros: r[2], perfis: {}, draft: M.limparCasca(casca.dados), versao: casca.versao, dirty: false, conflito: null, tab: tab };
      return carregarPerfis().then(renderProjecto);
    }).catch(falhou);
  }

  function carregarPerfis() {
    var p = st.p;
    return S.perfis(p.membros.map(function (m) { return m.conta; })).then(function (ps) {
      p.perfis = {};
      ps.forEach(function (x) { p.perfis[x.conta] = x.nome; });
    });
  }

  function eu() {
    var u = S.utilizador();
    return st.p.membros.filter(function (m) { return m.conta === u.id; })[0] || null;
  }
  function possoEditarCasca() { var m = eu(); return !!m && m.acesso !== 'leitor' && m.apps.indexOf('casca') >= 0; }
  function souDono() { var m = eu(); return !!m && m.acesso === 'dono'; }
  function nomeDe(conta) { return st.p.perfis[conta] || ('conta ' + String(conta).slice(0, 8)); }

  function marcarSujo() {
    st.p.dirty = true;
    actualizarEstado();
  }

  function actualizarEstado() {
    var e = $('estado-gravar'); if (!e) return;
    var p = st.p, f = p.fatias.casca;
    e.className = 'state' + (p.dirty ? ' state--dirty' : '');
    e.textContent = p.dirty ? 'alterações por gravar' : (f ? 'gravado · versão ' + p.versao + (f.em ? ' · ' + hora(f.em) : '') : '');
    var b = $('btn-gravar'); if (b) b.disabled = !p.dirty;
    var notas = $('avisos');
    if (notas) {
      var lista = M.avisos(M.limparCasca(p.draft));
      notas.textContent = '';
      lista.forEach(function (a) { notas.appendChild(el('li', { text: a })); });
      notas.hidden = !lista.length;
    }
    var m = $('medidor'); if (m) { var c = M.completude(M.limparCanvas(p.draft.canvas)); m.firstChild.style.width = c + '%'; m.setAttribute('aria-valuenow', String(c)); m.title = 'canvas ' + c + '% preenchida'; }
  }

  function gravar(versao) {
    var p = st.p;
    if (!possoEditarCasca()) return;
    var dados = M.limparCasca(p.draft);
    S.gravarFatia(p.id, 'casca', dados, versao || p.versao).then(function (r) {
      if (r && r.ok) {
        p.versao = r.versao; p.dirty = false; p.conflito = null; p.draft = dados;
        p.fatias.casca = { app: 'casca', dados: dados, versao: r.versao, por: S.utilizador().id, em: new Date().toISOString() };
        if (dados.canvas.nome && dados.canvas.nome !== p.projecto.nome && souDono()) {
          S.renomearProjecto(p.id, dados.canvas.nome).then(function () { p.projecto.nome = dados.canvas.nome; st.projectos = null; renderProjecto(); }, falhou);
        }
        avisar('canvas gravada');
        renderProjecto();
      } else if (r && r.conflito) {
        p.conflito = r;
        renderProjecto();
      }
    }, falhou);
  }

  function bannerConflito() {
    var c = st.p.conflito;
    if (!c) return null;
    return el('div', { class: 'banner', role: 'alert' }, [
      el('p', { text: nomeDe(c.por) + ' gravou a casca às ' + hora(c.em) + ' (versão ' + c.versao + '), depois de a abrires.' }),
      el('button', { class: 'btn btn--sm', type: 'button', text: 'Usar a versão deles', onclick: function () {
        var p = st.p; p.draft = M.limparCasca(c.dados); p.versao = c.versao; p.dirty = false; p.conflito = null;
        p.fatias.casca = { app: 'casca', dados: c.dados, versao: c.versao, por: c.por, em: c.em };
        renderProjecto();
      } }),
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Gravar por cima', onclick: function () { gravar(c.versao); } })
    ]);
  }

  function renderProjecto() {
    var p = st.p;
    var edita = possoEditarCasca();
    var cabeca = el('div', { class: 'head' }, [
      el('a', { class: 'crumb', href: '#/', text: '← Projectos' }),
      el('h1', { text: p.projecto.nome }),
      el('span', { class: 'grow' }),
      (p.tab === 'canvas' || p.tab === 'equipa') && edita ? el('div', { class: 'savebar' }, [
        el('span', { id: 'estado-gravar', class: 'state' }),
        el('button', { id: 'btn-gravar', class: 'btn btn--primary', type: 'button', text: 'Gravar', onclick: function () { gravar(); } })
      ]) : null
    ]);
    var abas = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Secções do projecto' }, TABS.map(function (t) {
      return el('a', { class: 'tab', role: 'tab', href: '#/p/' + p.id + '/' + t[0], 'aria-selected': String(p.tab === t[0]), text: t[1] });
    }));
    var corpo = p.tab === 'equipa' ? vistaEquipa(edita) : p.tab === 'acesso' ? vistaAcesso() : p.tab === 'apps' ? vistaApps() : vistaCanvas(edita);
    var comCasca = p.tab === 'canvas' || p.tab === 'equipa';
    montar([el('section', { class: 'wrap screen' }, [
      cabeca, abas, bannerConflito(),
      !edita && comCasca ? el('p', { class: 'summary', text: 'Só leitura: o teu acesso a este projecto não permite editar a casca.' }) : null,
      comCasca ? el('ul', { id: 'avisos', class: 'notes', 'aria-live': 'polite' }) : null,
      corpo
    ])]);
    actualizarEstado();
  }

  /* ── canvas ──────────────────────────────────────────────────────────── */
  function vistaCanvas(edita) {
    var c = st.p.draft.canvas;
    function entrada(obj, chave, attrs, linhas) {
      var tag = attrs && attrs.rows ? 'textarea' : 'input';
      var valor = linhas ? (obj[chave] || []).join('\n') : (obj[chave] || '');
      var n = el(tag, Object.assign({ class: tag === 'textarea' ? 'textarea' : 'input', value: valor, disabled: !edita }, attrs || {}));
      n.addEventListener('input', function () { obj[chave] = linhas ? n.value.split('\n') : n.value; marcarSujo(); });
      return n;
    }
    var tipo = el('select', { class: 'select', disabled: !edita }, [el('option', { value: '', text: 'escolhe…' })].concat(M.TIPOS.map(function (t) {
      return el('option', { value: t.id, text: t.nome + ' — ' + t.nota });
    })));
    tipo.value = c.tipo || '';
    tipo.addEventListener('change', function () { c.tipo = tipo.value || null; marcarSujo(); });

    var medidor = el('div', { id: 'medidor', class: 'meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Canvas preenchida' }, [el('span')]);
    var P = c.pitch;
    return el('div', { class: 'sheet' }, [
      el('div', { class: 'card span2' }, [
        el('h2', { text: 'Bootstrap canvas' }), medidor,
        el('p', { class: 'form__hint', text: 'O pitch alimenta tudo o resto. Uma entrada por linha nas listas. A extracção automática por IA entra na próxima fatia.' })
      ]),
      el('div', { class: 'card' }, [
        el('h2', { text: 'Identidade' }),
        campo('Nome', entrada(c, 'nome', { maxlength: '80' })),
        campo('Tagline', entrada(c, 'tagline', { maxlength: '140', placeholder: 'o twitter das receitas culinárias' })),
        campo('Tipo de projecto', tipo, 'Decide o pacote de arranque e o peso de cada etapa.')
      ]),
      el('div', { class: 'card' }, [
        el('h2', { text: 'North star' }),
        campo('Proposta de valor central', entrada(c, 'northStar', { rows: '3', maxlength: '600' })),
        campo('Expected outcomes', entrada(c, 'outcomes', { rows: '4' }, true), 'Um por linha.')
      ]),
      el('div', { class: 'card span2' }, [
        el('h2', { text: 'Elevator pitch' }),
        el('div', { class: 'row' }, [
          campo('Proposta de valor', entrada(P, 'proposta', { rows: '3', maxlength: '600' })),
          campo('Diferenciador', entrada(P, 'diferenciador', { rows: '3', maxlength: '600' }))
        ]),
        el('div', { class: 'row' }, [
          campo('Utilizadores', entrada(P, 'utilizadores', { rows: '3', maxlength: '600' })),
          campo('Alcance', entrada(P, 'alcance', { rows: '3', maxlength: '600' }))
        ]),
        campo('Cronologia', entrada(P, 'cronologia', { rows: '2', maxlength: '600' }))
      ]),
      el('div', { class: 'card' }, [
        el('h2', { text: 'Taxonomia e temas' }),
        campo('Taxonomia', entrada(c, 'taxonomia', { rows: '4' }, true), 'Vira as etiquetas do Roadmaps.'),
        campo('Temas de desenvolvimento', entrada(c, 'temas', { rows: '4' }, true))
      ]),
      el('div', { class: 'card' }, [
        el('h2', { text: 'Spikes e escolhas' }),
        campo('Spikes / research topics', entrada(c, 'spikes', { rows: '4' }, true)),
        campo('Arquitectura', entrada(c.escolhas, 'arquitectura', { maxlength: '140', placeholder: 'ex.: vanilla PWA sem build' })),
        campo('Design system', entrada(c.escolhas, 'designSystem', { maxlength: '140', placeholder: 'ex.: Pico.css' }))
      ])
    ]);
  }

  /* ── equipa ──────────────────────────────────────────────────────────── */
  function vistaEquipa(edita) {
    var eq = st.p.draft.equipa;
    var contas = st.p.membros.map(function (m) { return m.conta; });
    function pessoa(m, i) {
      var nome = el('input', { class: 'input', value: m.nome, maxlength: '80', disabled: !edita, 'aria-label': 'Nome' });
      nome.addEventListener('input', function () { m.nome = nome.value; marcarSujo(); });
      var conta = el('select', { class: 'select', disabled: !edita, 'aria-label': 'Conta monco' }, [el('option', { value: '', text: 'sem conta monco' })].concat(contas.map(function (c) {
        return el('option', { value: c, text: nomeDe(c) });
      })));
      conta.value = m.conta && contas.indexOf(m.conta) >= 0 ? m.conta : '';
      conta.addEventListener('change', function () { m.conta = conta.value || null; marcarSujo(); });
      var total = el('span', { class: 'state', text: 'alocação total: ' + M.alocacaoTotal(m) + '%' });
      var papeis = el('div', { class: 'roles' }, (m.papeis || []).map(function (r, j) {
        var papel = el('input', { class: 'input', value: r.papel, maxlength: '40', placeholder: 'PO, dev, design…', disabled: !edita, 'aria-label': 'Papel' });
        papel.addEventListener('input', function () { r.papel = papel.value; marcarSujo(); });
        var aloc = el('input', { class: 'input', type: 'number', min: '0', max: '100', step: '5', value: String(r.alocacao), disabled: !edita, 'aria-label': 'Alocação %' });
        aloc.addEventListener('input', function () { r.alocacao = Number(aloc.value) || 0; total.textContent = 'alocação total: ' + M.alocacaoTotal(m) + '%'; marcarSujo(); });
        return el('div', { class: 'role' }, [papel, aloc, edita ? el('button', { class: 'btn btn--text btn--sm', type: 'button', text: 'Tirar', onclick: function () { m.papeis.splice(j, 1); marcarSujo(); renderProjecto(); } }) : el('span')]);
      }));
      return el('div', { class: 'card person' }, [
        el('div', { class: 'row' }, [campo('Pessoa', nome), campo('Conta', conta, 'Só quem tem conta entra nas apps.')]),
        papeis,
        el('div', { class: 'card__actions' }, [
          edita ? el('button', { class: 'btn btn--sm', type: 'button', text: '+ Papel', onclick: function () { m.papeis.push({ papel: '', alocacao: 50 }); marcarSujo(); renderProjecto(); } }) : null,
          total, el('span', { class: 'grow' }),
          edita ? el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Tirar da equipa', onclick: function () { eq.splice(i, 1); marcarSujo(); renderProjecto(); } }) : null
        ])
      ]);
    }
    return el('div', { class: 'people' }, [
      el('p', { class: 'summary', text: 'Quem faz o quê e com que alocação. Pessoas sem conta monco (cliente, consultor) também entram aqui — só não abrem as apps.' })
    ].concat(eq.length ? eq.map(pessoa) : [el('p', { class: 'empty', text: 'Ainda não há ninguém na equipa.' })]).concat([
      edita ? el('div', null, [el('button', { class: 'btn btn--primary', type: 'button', text: '+ Pessoa', onclick: function () {
        if (eq.length >= M.LIM.pessoas) return avisar('limite de pessoas atingido');
        eq.push({ id: M.novoId('mem'), nome: '', conta: null, papeis: [{ papel: '', alocacao: 100 }] }); marcarSujo(); renderProjecto();
      } })]) : null
    ]));
  }

  /* ── acesso ──────────────────────────────────────────────────────────── */
  function vistaAcesso() {
    var p = st.p, dono = souDono(), u = S.utilizador();
    function recarregar() { return S.listarMembros(p.id).then(function (ms) { p.membros = ms; return carregarPerfis(); }).then(renderProjecto, falhou); }
    var lista = el('ul', { class: 'members' }, p.membros.map(function (m) {
      var sel = el('select', { class: 'select', disabled: !dono || m.conta === u.id, 'aria-label': 'Acesso' }, ['dono', 'editor', 'leitor'].map(function (a) { return el('option', { value: a, text: a }); }));
      sel.value = m.acesso;
      sel.addEventListener('change', function () { S.mudarAcesso(p.id, m.conta, sel.value).then(recarregar, falhou); });
      var sairOuTirar = m.conta === u.id
        ? (dono ? null : el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Sair do projecto', onclick: function () {
            if (window.confirm('Sair deste projecto? Deixas de o ver.')) S.removerMembro(p.id, m.conta).then(function () { st.projectos = null; location.hash = '#/'; }, falhou);
          } }))
        : (dono ? el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Tirar', onclick: function () {
            if (window.confirm('Tirar ' + nomeDe(m.conta) + ' do projecto?')) S.removerMembro(p.id, m.conta).then(recarregar, falhou);
          } }) : null);
      return el('li', { class: 'member' }, [el('span', { class: 'member__who', text: nomeDe(m.conta) + (m.conta === u.id ? ' (tu)' : '') }), sel, sairOuTirar]);
    }));
    var corpo = [el('p', { class: 'summary', text: 'Quem abre este projecto nas apps. Dono gere o acesso; editor escreve; leitor só vê.' }), lista];
    if (dono) {
      var email = el('input', { class: 'input', type: 'email', placeholder: 'nome@monco.io', 'aria-label': 'Email' });
      var acesso = el('select', { class: 'select', 'aria-label': 'Acesso' }, ['editor', 'leitor', 'dono'].map(function (a) { return el('option', { value: a, text: a }); }));
      var botao = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Adicionar' });
      var form = el('form', { class: 'newp' }, [email, acesso, botao]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = email.value.trim().toLowerCase();
        if (!/^[^\s@]+@monco\.io$/.test(v)) return avisar('só contas @monco.io');
        botao.disabled = true;
        S.adicionarMembro(p.id, v, acesso.value).then(function (r) {
          if (r && r.ok) { avisar(v + ' adicionado'); return recarregar(); }
          avisar(r && r.erro ? r.erro : 'não foi possível adicionar');
        }, falhou).then(function () { botao.disabled = false; });
      });
      corpo.push(el('h2', { class: 'card__title', text: 'Adicionar pessoa' }), el('p', { class: 'form__hint', text: 'A pessoa tem de ter entrado na Casca pelo menos uma vez.' }), form);
    }
    return el('div', { class: 'card' }, corpo);
  }

  /* ── apps ────────────────────────────────────────────────────────────── */
  function vistaApps() {
    var p = st.p;
    var cartoes = APPS_INFO.map(function (a) {
      // modo monco: só o Veredicto nesta fatia; o URL vem do /config.js
      var noProjecto = a.app === 'veredicto' ? M.urlApp(cfg.veredictoUrl || a.url, p.id) : null;
      return el('div', { class: 'card app' }, [
        el('div', { class: 'card__tags' }, [el('span', { class: 'tag tag--neutra', text: a.etapa })]),
        el('h2', { class: 'card__title', text: a.nome }),
        el('p', { text: a.desc }),
        noProjecto ? null : el('p', { text: 'Modo monco (abrir este projecto na app): em breve.' }),
        el('div', { class: 'app__links' }, [
          noProjecto ? el('a', { class: 'btn btn--primary btn--sm', href: noProjecto, text: 'Abrir neste projecto' }) : null,
          el('a', { class: 'btn btn--sm', href: a.url, target: '_blank', rel: 'noopener', text: 'Abrir standalone' }),
          el('button', { class: 'btn btn--text btn--sm', type: 'button', text: 'Exportar fatia', onclick: function () {
            var f = p.fatias[a.app];
            if (!f) return avisar('fatia ainda não carregada');
            descarregar(M.slug(p.projecto.nome) + '-' + a.app + '.json', JSON.stringify(f.dados, null, 2) + '\n');
          } })
        ])
      ]);
    });
    return el('div', null, [
      el('div', { class: 'apps' }, cartoes),
      el('div', { class: 'card__actions' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'Exportar o projecto inteiro (JSON)', onclick: function () {
          descarregar(M.slug(p.projecto.nome) + '.monco.json', M.exportarProjecto(p.projecto, p.fatias));
        } }),
        el('span', { class: 'state', text: 'O ficheiro é teu: reimporta numa conta monco ou abre cada fatia na app standalone.' })
      ])
    ]);
  }

  /* ── arranque ────────────────────────────────────────────────────────── */
  $('btn-sair').addEventListener('click', function () {
    if (st.p && st.p.dirty && !window.confirm('Há alterações por gravar. Sair mesmo assim?')) return;
    st = { projectos: null, p: null };
    S.sair().then(function () { location.hash = ''; render(); });
  });
  var ultimaRota = location.hash;
  window.addEventListener('hashchange', function () {
    if (st.p && st.p.dirty && rota().projecto !== st.p.id && !window.confirm('Há alterações por gravar na canvas. Sair sem gravar?')) {
      history.replaceState(null, '', ultimaRota);
      return;
    }
    ultimaRota = location.hash;
    render();
  });
  window.addEventListener('beforeunload', function (ev) { if (st.p && st.p.dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  document.addEventListener('keydown', function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's' && st.p && st.p.dirty) { ev.preventDefault(); gravar(); }
  });

  if (S.lerHash(location.hash)) {
    S.entrarComHash(location.hash).then(function () {
      history.replaceState(null, '', '/app#/'); ultimaRota = '#/'; render();
    }, function (e) { history.replaceState(null, '', '/app'); renderEntrar('O link falhou: ' + e.message); });
  } else {
    render();
  }
})();
