/* produto.js — o ficheiro «produto» do nimble: esquema, limpeza, operações e armazenamento.
 *
 * Um produto é um único objecto (notas, features, diagramas, boards). Tudo o que entra
 * (ficheiro importado, localStorage, mais tarde o Drive) passa por `limpar`: nada é
 * confiado. Corre no navegador e em Node (os testes). Sem DOM, sem rede.
 */
(function (raiz) {
  'use strict';

  var VERSAO = 1;
  var ETAPAS = [
    { id: '0', nome: 'Configurar', tipo: 'notas' },
    { id: '1', nome: 'Idear', tipo: 'diagramico' },
    { id: '2', nome: 'Priorizar', tipo: 'roadmap' },
    { id: '3', nome: 'Construir', tipo: 'taskboards' },
    { id: '4', nome: 'Validar', tipo: 'notas' },
    { id: '5', nome: 'Lançar', tipo: 'notas' },
    { id: 'T', nome: 'Ensina', tipo: 'notas' }
  ];
  var ETAPAS_NOTAS = ['0', '4', '5', 'T'];
  var COLUNAS = ['now', 'next', 'later'];
  var LIMITES = { nome: 60, titulo: 80, texto: 20000, descricao: 280, tag: 20, notas: 200, features: 300, outros: 200, tamanhoFicheiro: 5 * 1024 * 1024 };

  function linha(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function bloco(v, max) {
    return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
  }

  function uid() {
    var c = raiz.crypto;
    if (c && c.getRandomValues) {
      var a = new Uint32Array(2);
      c.getRandomValues(a);
      return 'i' + a[0].toString(36) + a[1].toString(36);
    }
    return 'i' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  var ID_VALIDO = /^[A-Za-z0-9_-]{4,40}$/;

  // Ids estáveis: mantém o que é válido e único, gera outro nos restantes.
  function idUnico(id, vistos) {
    var v = String(id == null ? '' : id);
    if (!ID_VALIDO.test(v) || vistos[v]) v = uid();
    while (vistos[v]) v = uid();
    vistos[v] = true;
    return v;
  }

  function objectos(lista, max) {
    return (Array.isArray(lista) ? lista : []).slice(0, max).filter(function (o) {
      return o && typeof o === 'object' && !Array.isArray(o);
    });
  }

  // Devolve o produto limpo, ou null se o objecto não for um ficheiro do nimble.
  function limpar(raw) {
    if (!raw || typeof raw !== 'object' || raw.app !== 'nimble-produto') return null;
    var vistos = {};
    var p = {
      app: 'nimble-produto',
      versao: VERSAO,
      id: idUnico(raw.id, vistos),
      nome: linha(raw.nome, LIMITES.nome) || 'Produto sem nome',
      actualizado: Math.floor(Number(raw.actualizado)) > 0 ? Math.floor(Number(raw.actualizado)) : 0,
      notas: [],
      features: [],
      diagramas: [],
      boards: []
    };

    objectos(raw.notas, LIMITES.notas).forEach(function (n) {
      p.notas.push({
        id: idUnico(n.id, vistos),
        etapa: ETAPAS_NOTAS.indexOf(n.etapa) >= 0 ? n.etapa : '0',
        titulo: linha(n.titulo, LIMITES.titulo),
        texto: bloco(n.texto, LIMITES.texto)
      });
    });

    objectos(raw.features, LIMITES.features).forEach(function (f) {
      var titulo = linha(f.titulo, LIMITES.titulo);
      if (!titulo) return;
      p.features.push({
        id: idUnico(f.id, vistos),
        titulo: titulo,
        descricao: linha(f.descricao, LIMITES.descricao),
        coluna: COLUNAS.indexOf(f.coluna) >= 0 ? f.coluna : 'later',
        tag: linha(f.tag, LIMITES.tag)
      });
    });

    // Diagramas e boards entram nos passos seguintes: guardam-se sem perder nada.
    ['diagramas', 'boards'].forEach(function (k) {
      objectos(raw[k], LIMITES.outros).forEach(function (o) {
        var copia;
        try { copia = JSON.parse(JSON.stringify(o)); } catch (e) { return; }
        copia.id = idUnico(copia.id, vistos);
        p[k].push(copia);
      });
    });
    return p;
  }

  function novo(nome) {
    return limpar({ app: 'nimble-produto', nome: nome, actualizado: Date.now() });
  }

  function exportar(p) {
    return JSON.stringify(p, null, 2);
  }

  function importar(texto) {
    if (typeof texto !== 'string' || texto.length > LIMITES.tamanhoFicheiro) {
      return { ok: false, erro: 'O ficheiro é demasiado grande ou não é texto.' };
    }
    var raw;
    try { raw = JSON.parse(texto.replace(/^﻿/, '')); } catch (e) {
      return { ok: false, erro: 'O ficheiro não é JSON válido.' };
    }
    var p = limpar(raw);
    return p ? { ok: true, produto: p } : { ok: false, erro: 'O ficheiro não é um produto do nimble.' };
  }

  /* ---- operações (mutam o rascunho que o armazém lhes dá) ---------------- */

  function porId(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  var ops = {
    addNota: function (p, etapa) {
      var n = { id: uid(), etapa: ETAPAS_NOTAS.indexOf(etapa) >= 0 ? etapa : '0', titulo: '', texto: '' };
      p.notas.push(n);
      return n.id;
    },
    setNota: function (p, id, campos) {
      var n = porId(p.notas, id);
      if (!n) return false;
      if ('titulo' in campos) n.titulo = linha(campos.titulo, LIMITES.titulo);
      if ('texto' in campos) n.texto = bloco(campos.texto, LIMITES.texto);
      return true;
    },
    delNota: function (p, id) {
      var antes = p.notas.length;
      p.notas = p.notas.filter(function (n) { return n.id !== id; });
      return p.notas.length < antes;
    },
    addFeature: function (p, titulo, coluna) {
      var t = linha(titulo, LIMITES.titulo);
      if (!t || p.features.length >= LIMITES.features) return null;
      var f = { id: uid(), titulo: t, descricao: '', coluna: COLUNAS.indexOf(coluna) >= 0 ? coluna : 'next', tag: '' };
      p.features.push(f);
      return f.id;
    },
    setFeature: function (p, id, campos) {
      var f = porId(p.features, id);
      if (!f) return false;
      if ('titulo' in campos) {
        var t = linha(campos.titulo, LIMITES.titulo);
        if (!t) return false;
        f.titulo = t;
      }
      if ('descricao' in campos) f.descricao = linha(campos.descricao, LIMITES.descricao);
      if ('tag' in campos) f.tag = linha(campos.tag, LIMITES.tag);
      return true;
    },
    delFeature: function (p, id) {
      var antes = p.features.length;
      p.features = p.features.filter(function (f) { return f.id !== id; });
      return p.features.length < antes;
    },
    // Muda de coluna e, se `antesDe` existir, põe a feature antes dessa; senão, no fim da coluna.
    moverFeature: function (p, id, coluna, antesDe) {
      var f = porId(p.features, id);
      if (!f || COLUNAS.indexOf(coluna) < 0) return false;
      p.features = p.features.filter(function (x) { return x.id !== id; });
      f.coluna = coluna;
      var i = -1;
      for (var k = 0; k < p.features.length; k++) if (p.features[k].id === antesDe) i = k;
      if (i >= 0) p.features.splice(i, 0, f);
      else p.features.push(f);
      return true;
    }
  };

  /* ---- armazenamento ----------------------------------------------------- */

  // Adaptador local: mesma interface que o do Drive terá (ler / gravar, ambos de texto).
  function adaptadorLocal(storage, chave) {
    chave = chave || 'nimble.produto.v1';
    return {
      ler: function () { return storage.getItem(chave); },
      gravar: function (texto) { storage.setItem(chave, texto); }
    };
  }

  function criarStore(adaptador) {
    var estado = null;
    var ouvintes = [];
    var erro = '';

    var lido = null;
    try { lido = adaptador.ler(); } catch (e) { erro = 'Não consegui ler o armazenamento do navegador.'; }
    if (lido) {
      var r = importar(lido);
      if (r.ok) estado = r.produto;
      else erro = 'O produto guardado está corrompido: ' + r.erro;
    }

    function avisar(info) {
      ouvintes.slice().forEach(function (f) { f(info); });
    }

    function gravar(info) {
      try {
        adaptador.gravar(exportar(estado));
        erro = '';
      } catch (e) {
        erro = 'Não consegui guardar (armazenamento cheio ou bloqueado). Exporta o produto para não perder o trabalho.';
      }
      avisar(Object.assign({ gravado: !erro, erro: erro }, info));
    }

    return {
      produto: function () { return estado; },
      erro: function () { return erro; },
      existe: function () { return !!estado; },
      criar: function (nome) {
        estado = novo(nome);
        gravar({ render: true });
        return estado;
      },
      importar: function (texto) {
        var r = importar(texto);
        if (!r.ok) return r;
        estado = r.produto;
        estado.actualizado = Date.now();
        gravar({ render: true });
        return r;
      },
      // fn recebe um rascunho; se o resultado não passar na limpeza, nada muda.
      mudar: function (fn, opcoes) {
        if (!estado) return null;
        var rascunho = JSON.parse(JSON.stringify(estado));
        var resultado = fn(rascunho);
        var limpo = limpar(rascunho);
        if (!limpo) return null;
        limpo.actualizado = Date.now();
        estado = limpo;
        gravar({ render: !(opcoes && opcoes.render === false) });
        return resultado;
      },
      aoMudar: function (cb) {
        ouvintes.push(cb);
        return function () { ouvintes = ouvintes.filter(function (f) { return f !== cb; }); };
      }
    };
  }

  var API = {
    VERSAO: VERSAO, ETAPAS: ETAPAS, ETAPAS_NOTAS: ETAPAS_NOTAS, COLUNAS: COLUNAS, LIMITES: LIMITES,
    limpar: limpar, novo: novo, exportar: exportar, importar: importar, ops: ops,
    adaptadorLocal: adaptadorLocal, criarStore: criarStore
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Produto = API;
}(typeof window !== 'undefined' ? window : globalThis));
