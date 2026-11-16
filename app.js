/* StoryMap – Matriz de Sincronização (HTML + CSS + JS puro, Leaflet para o mapa) */
(() => {
  const M = window.MATRIZ;
  const FR = Object.fromEntries(M.fracoes.map(f => [f.id, f]));
  const FR_NOME = Object.fromEntries(M.fracoes.map(f => [f.nome, f]));
  const FR_IDX = Object.fromEntries(M.fracoes.map((f, i) => [f.id, i]));
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // eventos manuais (extras.js): entram logo após os eventos da mesma fração no mesmo dia
  (window.MATRIZ_EXTRAS || []).forEach(x => {
    const f = FR_NOME[x.fracao];
    if (!f) { console.warn("extras.js: fração não encontrada:", x.fracao); return; }
    const coords = x.coords || [];
    const e = { fid: f.id, dia: x.dia, txt: x.txt, pc: null, pms: x.pms || [], turno: x.turno || [], coords,
      local: x.local || null, prec: coords.length ? "exata" : x.local ? "aprox" : null };
    let pos = -1;
    M.eventos.forEach((o, i) => { if (o.fid === f.id && o.dia === x.dia) pos = i; });
    if (pos < 0) M.eventos.forEach((o, i) => { if (o.fid === f.id) pos = i; });
    pos < 0 ? M.eventos.push(e) : M.eventos.splice(pos + 1, 0, e);
  });

  const estreito = () => matchMedia("(max-width:820px)").matches;
  const DIAS = M.dias;
  const idxD = DIAS.findIndex(d => d.rel === "D");
  DIAS.forEach((d, i) => { d.i = i; d.relCalc = d.rel || (idxD >= 0 ? (i < idxD ? `D-${idxD - i}` : `D+${i - idxD}`) : ""); });
  const DIA = Object.fromEntries(DIAS.map(d => [d.id, d]));
  const partKey = p => (p || "").replace(/\s/g, "").toUpperCase();
  const COR = { FADST: "#2563a8", FOROP: "#c0392b", DIREX: "#c98a12" };
  const setorCurto = s => (s || "").replace(/\s*\(.*$/, "").trim();
  const setorSub = s => ((s || "").match(/\((.*)\)/) || [, ""])[1];
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // ---------- base (planilha + extras) com chave estável ----------
  // a chave "OM|dia|texto original" identifica o evento mesmo depois de regenerar o data.js
  const vistos = {};
  const BASE = M.eventos.map((e, i) => {
    let k = `${FR[e.fid].nome}|${e.dia}|${e.txt}`;
    vistos[k] = (vistos[k] || 0) + 1;
    if (vistos[k] > 1) k += "#" + vistos[k];
    return { ...clone(e), chave: k, ordem: i };
  });
  const BASE_K = Object.fromEntries(BASE.map(b => [b.chave, b]));
  const LOCAIS_BASE = { ...M.locais };

  // ---------- edições: publicadas (edicoes.js) + locais (navegador) ----------
  const LS = "matriz4bda.edicoes.v1";
  const vazioED = () => ({ alterados: {}, removidos: [], novos: {}, locais: {} });
  function normED(x) {
    const r = vazioED();
    if (!x || typeof x !== "object") return r;
    Object.assign(r.alterados, x.alterados || {});
    r.removidos = Array.isArray(x.removidos) ? [...x.removidos] : [];
    if (Array.isArray(x.novos)) x.novos.forEach((n, i) => { r.novos[n.uid || "novo:imp" + i] = n; });
    else Object.assign(r.novos, x.novos || {});
    Object.assign(r.locais, x.locais || {});
    return r;
  }
  const PUB = normED(window.MATRIZ_EDICOES);
  let LOCAL = normED((() => { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } })());
  const salvarLocal = () => { try { localStorage.setItem(LS, JSON.stringify(LOCAL)); } catch { } };

  function combinar(a, b) {
    const r = clone(a);
    r.removidos = [...new Set([...r.removidos, ...b.removidos])];
    Object.entries(b.alterados).forEach(([k, v]) => {
      if (v === null) { delete r.alterados[k]; r.removidos = r.removidos.filter(x => x !== k); } else r.alterados[k] = v;
    });
    Object.entries(b.novos).forEach(([k, v]) => { r.novos[k] = v; });
    Object.entries(b.locais).forEach(([k, v]) => { if (v === null) delete r.locais[k]; else r.locais[k] = v; });
    return r;
  }
  // remove do LOCAL o que já está igual ao publicado (assim "pendentes" = o que falta exportar)
  function podar() {
    Object.keys(LOCAL.alterados).forEach(k => {
      const v = LOCAL.alterados[k];
      if (v === null ? !(k in PUB.alterados) && !PUB.removidos.includes(k) : igual(v, PUB.alterados[k])) delete LOCAL.alterados[k];
    });
    LOCAL.removidos = LOCAL.removidos.filter(k => {
      if (PUB.removidos.includes(k)) return false;
      if (LOCAL.novos[k] && !PUB.novos[k]) { delete LOCAL.novos[k]; return false; }   // novo criado e apagado localmente
      return true;
    });
    Object.keys(LOCAL.novos).forEach(k => { if (igual(LOCAL.novos[k], PUB.novos[k])) delete LOCAL.novos[k]; });
    Object.keys(LOCAL.locais).forEach(k => {
      const v = LOCAL.locais[k];
      if (v === null ? !(k in PUB.locais) : igual(v, PUB.locais[k])) delete LOCAL.locais[k];
    });
  }
  const pendentes = () => Object.keys(LOCAL.alterados).length + LOCAL.removidos.length + Object.keys(LOCAL.novos).length + Object.keys(LOCAL.locais).length;

  // ---------- aplicação das edições sobre a base ----------
  const idDe = new Map(); let proxId = 0;
  const idPara = k => { if (!idDe.has(k)) idDe.set(k, proxId++); return idDe.get(k); };
  let ED = vazioED(), EV = new Map(), ORFAOS = 0;

  function aplicarCampos(e, a) {
    if (a.fracao !== undefined && FR_NOME[a.fracao]) e.fid = FR_NOME[a.fracao].id;
    ["dia", "txt", "turno", "pms", "coords", "local", "prec"].forEach(c => { if (a[c] !== undefined) e[c] = clone(a[c]); });
    if (a.prec === undefined && (a.coords !== undefined || a.local !== undefined))
      e.prec = e.coords.length ? "exata" : e.local ? "aprox" : null;
  }
  function aplicar() {
    podar();
    ED = combinar(PUB, LOCAL);
    M.locais = { ...LOCAIS_BASE, ...ED.locais };
    const rem = new Set(ED.removidos), lista = [];
    BASE.forEach(b => {
      if (rem.has(b.chave)) return;
      const a = ED.alterados[b.chave], e = { ...clone(b), origem: "planilha", editado: !!a };
      if (a) aplicarCampos(e, a);
      lista.push(e);
    });
    Object.entries(ED.novos).forEach(([uid, n]) => {
      if (rem.has(uid)) return;
      const e = { chave: uid, ordem: BASE.length + (n.seq || 0), fid: null, dia: null, txt: "", pc: null,
        pms: [], turno: [], coords: [], local: null, prec: null, origem: "novo", editado: true };
      aplicarCampos(e, n);
      if (e.fid && DIA[e.dia]) lista.push(e);
    });
    lista.sort((x, y) => FR_IDX[x.fid] - FR_IDX[y.fid] || DIA[x.dia].i - DIA[y.dia].i || x.ordem - y.ordem);
    lista.forEach(e => { e.id = idPara(e.chave); e.n = norm(e.txt + " " + FR[e.fid].nome); });
    M.eventos = lista;
    EV = new Map(lista.map(e => [e.id, e]));
    ORFAOS = Object.keys(ED.alterados).filter(k => !BASE_K[k]).length + ED.removidos.filter(k => !BASE_K[k] && !ED.novos[k]).length;
    calcMarcos();
  }

  // marcos automáticos por dia
  function calcMarcos() {
    DIAS.forEach(d => {
      const tx = M.eventos.filter(e => e.dia === d.id).map(e => e.txt).join(" ");
      d.marcos = [];
      if (d.rel === "D") d.marcos.push("Dia D");
      if (/APRONTO OPERACIONAL/.test(tx)) d.marcos.push("Apronto Op");
      if (d.marco) d.marcos.push(d.marco.replace("VISITA OPERACIONAL", "Visita Op"));
      if (/\bAPA\b/.test(tx) && /Participar da APA em Campo Grande/i.test(tx)) d.marcos.push("APA");
    });
  }

  // ---------- estado ----------
  const S = {
    dia: DIAS[idxD >= 0 ? idxD : 0].id,
    setores: new Set(), partidos: new Set(), turnos: new Set(), fracoes: new Set(),
    tipo: "all", q: "", foco: null, visao: "mapa", edicao: false,
  };
  aplicar();

  // ---------- filtros ----------
  const frVisivel = f => (!S.setores.size || S.setores.has(f.setor)) && (!S.partidos.size || S.partidos.has(f.partido));
  function passa(e, ignorarDia = false, ignorarFr = false) {
    const f = FR[e.fid];
    if (!ignorarDia && S.dia !== "ALL" && e.dia !== S.dia) return false;
    if (!frVisivel(f)) return false;
    if (!ignorarFr && S.fracoes.size && !S.fracoes.has(f.id)) return false;
    if (S.tipo === "pms" && !e.pms.length) return false;
    if (S.tipo === "nopms" && e.pms.length) return false;
    if (S.turnos.size && !e.turno.some(t => S.turnos.has(t))) return false;
    if (S.q) { const termos = norm(S.q).split(/\s+/).filter(Boolean); if (!termos.every(t => e.n.includes(t))) return false; }
    return true;
  }

  function chips(el, valores, conjunto, rotulo = v => v, aoMudar) {
    el.innerHTML = valores.map(v => `<label data-v="${esc(v)}"><input type="checkbox" value="${esc(v)}"> ${esc(rotulo(v))}<span class="n"></span></label>`).join("");
    el.addEventListener("change", ev => {
      const v = ev.target.value; ev.target.checked ? conjunto.add(v) : conjunto.delete(v);
      if (aoMudar) aoMudar();
      render();
    });
  }
  // setor/partido restringem as OM disponíveis: OM selecionadas que saem do filtro são desmarcadas
  const podarFracoes = () => S.fracoes.forEach(id => { if (!frVisivel(FR[id])) S.fracoes.delete(id); });
  const setores = [...new Set(M.fracoes.map(f => f.setor))];
  chips($("#fSetor"), setores, S.setores, s => setorCurto(s) + (setorSub(s) ? " · " + setorSub(s) : ""), podarFracoes);
  chips($("#fPartido"), [...new Set(M.fracoes.map(f => f.partido))], S.partidos, v => v, podarFracoes);
  chips($("#fTurno"), ["M", "T", "N"], S.turnos, t => ({ M: "Manhã", T: "Tarde", N: "Noite" }[t]));
  $("#fTipo").addEventListener("change", ev => { S.tipo = ev.target.value; render(); });

  // nº de OM de cada setor/partido compatível com o outro filtro; opções sem OM ficam desabilitadas
  function atualizarChips() {
    const marcar = (el, conj, conta) => el.querySelectorAll("label").forEach(l => {
      const v = l.dataset.v, n = conta(v), off = !n && !conj.has(v);
      l.querySelector(".n").textContent = n;
      l.classList.toggle("indisp", off);
      l.querySelector("input").disabled = off;
    });
    marcar($("#fSetor"), S.setores, v => M.fracoes.filter(f => f.setor === v && (!S.partidos.size || S.partidos.has(f.partido))).length);
    marcar($("#fPartido"), S.partidos, v => M.fracoes.filter(f => f.partido === v && (!S.setores.size || S.setores.has(f.setor))).length);
  }

  let contFr = {};
  function listaFracoes() {
    const q = norm($("#buscaFr").value);
    const visiveis = M.fracoes.filter(frVisivel);
    let html = "", ult = null;
    visiveis.forEach(f => {
      if (q && !norm(f.nome).includes(q)) return;
      if (f.setor !== ult) { html += `<div class="sep">${esc(setorCurto(f.setor))} · ${esc(setorSub(f.setor))}</div>`; ult = f.setor; }
      const n = contFr[f.id] || 0;
      html += `<label class="${n ? "" : "zero"}" title="${n} evento(s) com os filtros atuais"><input type="checkbox" value="${f.id}" ${S.fracoes.has(f.id) ? "checked" : ""}>
        <span>${esc(f.nome)} <small>${esc(f.partido)}</small></span><b class="qt">${n}</b></label>`;
    });
    const el = $("#fFracao"), rol = el.scrollTop;
    el.innerHTML = html || `<div class="vazio-msg">Nenhuma OM com esses filtros</div>`;
    el.scrollTop = rol;
    $("#nFr").textContent = visiveis.length < M.fracoes.length ? `${visiveis.length} de ${M.fracoes.length}` : "";
  }
  $("#fFracao").addEventListener("change", ev => { const v = ev.target.value; ev.target.checked ? S.fracoes.add(v) : S.fracoes.delete(v); render(); });
  $("#buscaFr").addEventListener("input", listaFracoes);
  $("#limparFr").addEventListener("click", () => { S.fracoes.clear(); render(); });
  let tBusca; $("#busca").addEventListener("input", ev => { clearTimeout(tBusca); tBusca = setTimeout(() => { S.q = ev.target.value.trim(); render(); }, 180); });
  $("#limparTudo").addEventListener("click", () => {
    [S.setores, S.partidos, S.turnos, S.fracoes].forEach(s => s.clear()); S.tipo = "all"; S.q = "";
    document.querySelectorAll(".filtros input[type=checkbox]").forEach(i => i.checked = false);
    document.querySelector('#fTipo input[value=all]').checked = true; $("#busca").value = ""; $("#buscaFr").value = "";
    render();
  });

  // ---------- mapa ----------
  const mapa = L.map("mapa", { zoomControl: true, preferCanvas: false }).setView([-20.6, -56.3], 7);
  // Provedores que funcionam mesmo abrindo o arquivo direto do computador (file://)
  const esri = (svc, nome) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, attribution: "Tiles © Esri — " + nome });
  const bases = {
    "Ruas (Esri)": esri("World_Street_Map", "Esri, HERE, Garmin, OSM"),
    "Satélite (Esri)": esri("World_Imagery", "Esri, Maxar, Earthstar"),
    "Topográfico (Esri)": esri("World_Topo_Map", "Esri, HERE, Garmin, OSM"),
    "Claro (CARTO)": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }),
  };
  bases["Ruas (Esri)"].addTo(mapa);
  L.control.layers(bases, null, { position: "topright" }).addTo(mapa);
  L.control.scale({ imperial: false }).addTo(mapa);
  const camada = L.layerGroup().addTo(mapa);
  const marcadorDoEvento = new Map();

  const btnEd = e => S.edicao ? ` <button class="ed-mini" data-editar="${e.id}" title="Editar este evento">✎</button>` : "";
  function popupHtml(lista, titulo, extra = "") {
    const porFr = {};
    lista.forEach(e => (porFr[e.fid] ||= []).push(e));
    return `<div class="pop"><h5>${esc(titulo)}</h5>` + Object.entries(porFr).map(([fid, evs]) =>
      `<b>${esc(FR[fid].nome)}</b> <span class="pc">${esc(FR[fid].partido)}</span><ul>` +
      evs.map(e => `<li>${S.dia === "ALL" ? `<span class="tag dia">${esc(DIA[e.dia].data)}</span> ` : ""}${esc(e.txt)}${e.editado ? ' <span class="tag ed">editado</span>' : ""}${btnEd(e)}</li>`).join("") + "</ul>"
    ).join("") + (lista[0].pc && lista[0].prec === "pc" ? `<div class="pc">${esc(lista[0].pc)}</div>` : "") + extra + "</div>";
  }

  function desenharMapa(evs, voar) {
    camada.clearLayers(); marcadorDoEvento.clear();
    const pontos = new Map(), locais = new Map(), limites = [];
    evs.forEach(e => {
      if (e.coords.length) {
        const k = e.coords[0].map(v => v.toFixed(4)).join(",") + "|" + (e.prec === "pc" ? "pc" : "x");
        (pontos.get(k) || pontos.set(k, []).get(k)).push(e);
        if (e.coords.length > 1) {
          L.polyline(e.coords, { color: COR[partKey(FR[e.fid].partido)] || "#555", weight: 3, opacity: .75, dashArray: "6 6" })
            .bindTooltip(FR[e.fid].nome).addTo(camada);
          e.coords.forEach(c => limites.push(c));
        }
      } else if (e.local && M.locais[e.local]) {
        (locais.get(e.local) || locais.set(e.local, []).get(e.local)).push(e);
      }
    });
    // localidades aproximadas (agrupadas)
    const popW = Math.min(380, innerWidth - 60);
    locais.forEach((lista, nome) => {
      const ll = M.locais[nome], n = lista.length, tam = Math.min(estreito() ? 54 : 70, (estreito() ? 24 : 30) + Math.sqrt(n) * 5);
      const dica = S.edicao ? `<div class="ed-dica">Arraste o círculo para ajustar a posição de <b>${esc(nome)}</b> (vale para todos os eventos desta localidade).`
        + (ED.locais[nome] ? ` <button class="link" data-restloc="${esc(nome)}">Restaurar posição original</button>` : "") + `</div>` : "";
      const mk = L.marker(ll, {
        icon: L.divIcon({ className: "", html: `<div class="loc-ic ${S.edicao ? "arrastavel" : ""}" style="width:${tam}px;height:${tam}px">${n}<small>${esc(nome)}</small></div>`, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] }),
        zIndexOffset: -500, draggable: S.edicao,
      }).bindPopup(popupHtml(lista, `${nome} · localização aproximada`, dica), { maxWidth: popW }).addTo(camada);
      mk.on("dragend", () => { const p = mk.getLatLng(); LOCAL.locais[nome] = [+p.lat.toFixed(6), +p.lng.toFixed(6)]; confirmar(`Posição de ${nome} ajustada`); });
      lista.forEach(e => marcadorDoEvento.set(e.id, mk));
      limites.push(ll);
    });
    // pontos exatos / PC
    pontos.forEach((lista, k) => {
      const e0 = lista[0], cor = COR[partKey(FR[e0.fid].partido)] || "#555";
      const temPms = lista.some(e => e.pms.length), ePc = k.endsWith("|pc");
      const cls = `mk ${temPms ? "pms" : ""} ${ePc ? "pc" : ""} ${lista.some(e => e.id === S.foco) ? "sel" : ""} ${S.edicao ? "arrastavel" : ""}`;
      const bg = temPms ? "var(--pms)" : cor;
      const dica = S.edicao ? `<div class="ed-dica">Arraste o ponto para reposicionar ${lista.length > 1 ? `os ${lista.length} eventos` : "o evento"}.</div>` : "";
      const mk = L.marker(e0.coords[0], {
        icon: L.divIcon({ className: "", html: `<div class="${cls}" style="background:${bg};--cor:${cor}"></div>${lista.length > 1 ? `<span class="mk-n">${lista.length}</span>` : ""}`, iconSize: [16, 16], iconAnchor: [8, 8] }),
        zIndexOffset: temPms ? 500 : 0, draggable: S.edicao,
      }).bindPopup(popupHtml(lista, ePc ? "Posição do PC" : (temPms ? "PMS · " + lista.flatMap(e => e.pms).map(p => "PMS " + p).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "Coordenada informada"), dica), { maxWidth: popW })
        .addTo(camada);
      mk.on("click", () => focar(lista[0].id, false));
      mk.on("dragend", () => {
        const p = mk.getLatLng(), ll = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
        lista.forEach(e => registrar(e, { ...campos(e), coords: [ll, ...e.coords.slice(1)], prec: e.prec }));
        confirmar(lista.length > 1 ? `${lista.length} eventos reposicionados` : "Evento reposicionado");
      });
      lista.forEach(e => marcadorDoEvento.set(e.id, mk));
      limites.push(e0.coords[0]);
    });
    if (voar && limites.length) mapa.flyToBounds(L.latLngBounds(limites).pad(0.15), { maxZoom: 12, duration: 0.8 });
  }

  // ---------- linha do tempo ----------
  function desenharDias() {
    const cont = DIAS.map(d => M.eventos.filter(e => e.dia === d.id && passa(e, true)));
    const max = Math.max(1, ...cont.map(c => c.length));
    $("#dias").innerHTML = DIAS.map((d, i) => {
      const n = cont[i].length, p = cont[i].filter(e => e.pms.length).length, h = 4 + 26 * n / max;
      return `<button class="dia ${S.dia === d.id ? "sel" : ""} ${n ? "" : "vazio"}" data-dia="${d.id}" title="${esc(d.data)} (${d.semana}) · ${n} eventos · ${p} PMS${d.marcos.length ? " · " + d.marcos.join(", ") : ""}">
        <span class="marco">${esc(d.marcos[0] || "")}</span>
        <span class="barra" style="height:${h}px"><i style="height:${n ? 100 * p / n : 0}%"></i></span>
        <b>${esc(d.data)}</b><small>${esc(d.relCalc)}</small></button>`;
    }).join("");
    $("#btnTodos").classList.toggle("ativo", S.dia === "ALL");
    const sel = $("#dias .sel"); if (sel) sel.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
  $("#dias").addEventListener("click", ev => { const b = ev.target.closest(".dia"); if (b) irPara(b.dataset.dia); });

  // ---------- painel lateral ----------
  function realcar(txt) {
    let h = esc(txt);
    if (S.q) norm(S.q).split(/\s+/).filter(t => t.length > 1).forEach(t => {
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      h = h.replace(re, "<mark>$1</mark>");
    });
    return h;
  }
  function itemHtml(e) {
    const loc = e.prec === "exata" ? "📍 coordenada" : e.prec === "pc" ? "📍 PC" : e.local ? `≈ ${e.local}` : "";
    const bt = `<button class="ev ${S.foco === e.id ? "foco" : ""}" data-ev="${e.id}">${realcar(e.txt)}
      <span class="meta">${S.dia === "ALL" ? `<span class="tag dia">${esc(DIA[e.dia].data)}</span>` : ""}
      ${e.pms.map(p => `<span class="tag pms">PMS ${esc(p)}</span>`).join("")}
      ${e.turno.map(t => `<span class="tag">${t}</span>`).join("")}
      ${loc ? `<span class="tag loc">${esc(loc)}</span>` : ""}
      ${e.editado ? `<span class="tag ed">${e.origem === "novo" ? "novo" : "editado"}</span>` : ""}</span></button>`;
    return S.edicao ? `<div class="ev-linha">${bt}<button class="ed-mini" data-editar="${e.id}" title="Editar">✎</button></div>` : bt;
  }
  function desenharLista(evs) {
    const d = DIA[S.dia];
    const nPms = evs.filter(e => e.pms.length).length;
    const nFr = new Set(evs.map(e => e.fid)).size;
    const destaques = evs.filter(e => e.pms.length).slice(0, 3);
    const kpis = `<div class="kpis"><div><b>${evs.length}</b>eventos</div><div><b>${nPms}</b>PMS</div>` + `<div><b>${nFr}</b>frações</div></div>`;
    const novo = S.edicao ? `<button id="edNovoCap" class="primario largura">+ Novo evento ${S.dia === "ALL" ? "" : "em " + esc(d.data)}</button>` : "";
    $("#capitulo").innerHTML = (S.dia === "ALL"
      ? `<h2>Todos os dias</h2><div class="sub">${esc(DIAS[0].data)} a ${esc(DIAS.at(-1).data)}</div>` + kpis
      : `<h2>${esc(d.data)} <small style="font-weight:400;color:var(--suave)">${esc(d.semana)} · ${esc(d.relCalc)}</small></h2>`
        + `<div class="sub">${d.marcos.length ? esc(d.marcos.join(" · ")) : "Dia " + (d.i + 1) + " de " + DIAS.length}</div>`
        + kpis
        + destaques.map(e => `<div class="destaque"><b>${esc(FR[e.fid].nome)}</b> — ${esc(e.txt.length > 140 ? e.txt.slice(0, 140) + "…" : e.txt)}</div>`).join("")) + novo;
    $("#contagem").textContent = `${evs.length} de ${M.eventos.filter(e => S.dia === "ALL" || e.dia === S.dia).length} no período`;

    if (!evs.length) { $("#eventos").innerHTML = `<div class="vazio-msg">Nenhum evento com esses filtros.</div>`; return; }
    const LIM = 600;
    const grupos = new Map();
    evs.slice(0, LIM).forEach(e => {
      const g = S.dia === "ALL" ? DIA[e.dia].data + " · " + DIA[e.dia].relCalc : setorCurto(FR[e.fid].setor) + " · " + setorSub(FR[e.fid].setor);
      if (!grupos.has(g)) grupos.set(g, new Map());
      const m = grupos.get(g); (m.get(e.fid) || m.set(e.fid, []).get(e.fid)).push(e);
    });
    let html = "";
    grupos.forEach((frs, g) => {
      html += `<div class="bloco"><h3>${esc(g)}</h3>`;
      frs.forEach((lista, fid) => {
        const f = FR[fid];
        html += `<div class="fr"><h4><span class="pt c-${partKey(f.partido)}">${esc(f.partido)}</span>${esc(f.nome)}</h4>${lista.map(itemHtml).join("")}</div>`;
      });
      html += `</div>`;
    });
    if (evs.length > LIM) html += `<div class="vazio-msg">Mostrando ${LIM} de ${evs.length}. Refine os filtros ou escolha um dia.</div>`;
    $("#eventos").innerHTML = html;
  }
  $("#eventos").addEventListener("click", ev => { const b = ev.target.closest(".ev"); if (b) focar(+b.dataset.ev, true); });

  function focar(id, abrirMapa) {
    S.foco = id;
    document.querySelectorAll(".ev.foco").forEach(x => x.classList.remove("foco"));
    const el = document.querySelector(`.ev[data-ev="${id}"]`);
    if (el) { el.classList.add("foco"); if (!abrirMapa) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    const mk = marcadorDoEvento.get(id);
    if (abrirMapa) {
      if (S.visao !== "mapa") trocarVisao("mapa");
      if (mk) { mapa.flyTo(mk.getLatLng(), Math.max(mapa.getZoom(), 11), { duration: .6 }); mk.openPopup(); }
    }
  }

  // ---------- matriz ----------
  function desenharMatriz() {
    const frs = M.fracoes.filter(f => frVisivel(f) && (!S.fracoes.size || S.fracoes.has(f.id)));
    const cont = {};
    M.eventos.forEach(e => { if (passa(e, true)) { const k = e.fid + "|" + e.dia; (cont[k] ||= { n: 0, p: 0, t: [] }); cont[k].n++; if (e.pms.length) cont[k].p++; if (cont[k].t.length < 4) cont[k].t.push(e.txt.slice(0, 90)); } });
    const max = Math.max(1, ...Object.values(cont).map(c => c.n));
    let html = `<table><thead><tr><th></th>${DIAS.map(d => `<th class="${S.dia === d.id ? "dsel" : ""}">${esc(d.data)}<br><small>${esc(d.relCalc)}</small></th>`).join("")}</tr></thead><tbody>`;
    let ult = null;
    frs.forEach(f => {
      if (f.setor !== ult) { html += `<tr><td class="nome setor" style="border-left-color:transparent">${esc(setorCurto(f.setor))} · ${esc(setorSub(f.setor))}</td></tr>`; ult = f.setor; }
      html += `<tr><td class="nome" style="border-left-color:${COR[partKey(f.partido)]}" title="${esc(f.nome)} · ${esc(f.partido)}">${esc(f.nome)}</td>`;
      DIAS.forEach(d => {
        const c = cont[f.id + "|" + d.id];
        if (!c) { html += `<td class="cel zero"></td>`; return; }
        const a = 0.15 + 0.7 * c.n / max;
        html += `<td class="cel ${c.p ? "p" : ""}" data-fr="${f.id}" data-dia="${d.id}" style="background:rgba(90,26,42,${a.toFixed(2)});color:${a > .5 ? "#fff" : "inherit"}" title="${esc(c.t.join("\n"))}${c.p ? `\n— ${c.p} PMS` : ""}">${c.n}</td>`;
      });
      html += `</tr>`;
    });
    $("#matriz").innerHTML = html + `</tbody></table>`;
  }
  $("#matriz").addEventListener("click", ev => {
    const c = ev.target.closest("td.cel:not(.zero)"); if (!c) return;
    S.fracoes = new Set([c.dataset.fr]); trocarVisao("mapa"); irPara(c.dataset.dia);
  });

  function trocarVisao(v) {
    S.visao = v;
    document.querySelectorAll(".visoes button").forEach(b => b.classList.toggle("ativo", b.dataset.visao === v));
    $("#matriz").classList.toggle("oculto", v !== "matriz");
    $(".palco").classList.toggle("em-matriz", v === "matriz");
    $("#mapa").style.visibility = v === "mapa" ? "visible" : "hidden";
    if (v === "matriz") desenharMatriz(); else setTimeout(() => mapa.invalidateSize(), 50);
  }
  document.querySelectorAll(".visoes button").forEach(b => b.addEventListener("click", () => trocarVisao(b.dataset.visao)));

  // ---------- navegação / reprodução ----------
  function irPara(dia) { S.dia = dia; S.foco = null; render(true); }
  function passo(delta) {
    const i = S.dia === "ALL" ? (delta > 0 ? -1 : DIAS.length) : DIA[S.dia].i;
    irPara(DIAS[(i + delta + DIAS.length) % DIAS.length].id);
  }
  $("#btnAnt").addEventListener("click", () => passo(-1));
  $("#btnProx").addEventListener("click", () => passo(1));
  $("#btnTodos").addEventListener("click", () => irPara("ALL"));
  let timer = null;
  $("#btnPlay").addEventListener("click", () => {
    if (timer) { clearInterval(timer); timer = null; $("#btnPlay").innerHTML = `▶<span class="rot"> Reproduzir</span>`; return; }
    $("#btnPlay").innerHTML = `❚❚<span class="rot"> Pausar</span>`;
    if (S.dia === "ALL") irPara(DIAS[0].id);
    timer = setInterval(() => { if (DIA[S.dia].i === DIAS.length - 1) $("#btnPlay").click(); else passo(1); }, 3500);
  });
  document.addEventListener("keydown", ev => {
    if (ev.target.matches("input, textarea, select") || $("#dlgEd").open) return;
    if (ev.key === "ArrowRight") passo(1);
    if (ev.key === "ArrowLeft") passo(-1);
  });

  // =====================================================================
  // ---------- MODO EDIÇÃO ----------
  // =====================================================================
  const campos = e => ({ fracao: FR[e.fid].nome, dia: e.dia, txt: e.txt, turno: clone(e.turno), pms: clone(e.pms),
    coords: clone(e.coords), local: e.local, prec: e.prec });
  const novoUid = () => "novo:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // grava a alteração de um evento em LOCAL (só os campos diferentes do original da planilha)
  function registrar(e, novo) {
    if (e.origem === "novo") { LOCAL.novos[e.chave] = { ...(ED.novos[e.chave] || {}), ...novo }; return; }
    const orig = campos(BASE_K[e.chave]), dif = {};
    Object.keys(novo).forEach(c => { if (!igual(novo[c], orig[c])) dif[c] = novo[c]; });
    if (Object.keys(dif).length) LOCAL.alterados[e.chave] = dif; else restaurar(e.chave, true);
  }
  function restaurar(k, semConfirmar) {
    if (k in PUB.alterados || PUB.removidos.includes(k)) LOCAL.alterados[k] = null; else delete LOCAL.alterados[k];
    LOCAL.removidos = LOCAL.removidos.filter(x => x !== k);
    if (!semConfirmar) confirmar("Evento restaurado ao original da planilha");
  }
  function excluir(e) {
    if (e.origem === "novo" && !PUB.novos[e.chave]) delete LOCAL.novos[e.chave];
    else { delete LOCAL.alterados[e.chave]; if (!LOCAL.removidos.includes(e.chave)) LOCAL.removidos.push(e.chave); }
  }
  function confirmar(msg) { salvarLocal(); aplicar(); render(false); if (msg) aviso(msg); }

  let tAviso;
  function aviso(msg) {
    const el = $("#aviso"); el.textContent = msg; el.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(() => el.hidden = true, 2600);
  }
  function resumoEdicao() {
    const n = pendentes(), tot = Object.keys(ED.alterados).length + ED.removidos.length + Object.keys(ED.novos).length + Object.keys(ED.locais).length;
    $("#edResumo").innerHTML = (n ? `<b>${n}</b> alteração(ões) não exportada(s)` : "Nenhuma alteração pendente")
      + ` · ${tot} no total` + (ORFAOS ? ` · <span class="alerta" title="Edições cujo texto original não existe mais no data.js (a planilha mudou)">${ORFAOS} sem correspondência</span>` : "");
    $("#btnEditar").classList.toggle("pendente", n > 0);
    $("#btnEditar").title = n ? `${n} alteração(ões) ainda não exportada(s)` : "Editar eventos e pontos do mapa";
  }

  $("#btnEditar").addEventListener("click", () => {
    S.edicao = !S.edicao;
    $("#btnEditar").classList.toggle("ativo", S.edicao);
    $("#barraEd").hidden = !S.edicao;
    document.body.classList.toggle("editando", S.edicao);
    render(false);
    setTimeout(() => mapa.invalidateSize(), 50);
  });

  // ---- formulário ----
  const dlg = $("#dlgEd");
  $("#edFr").innerHTML = setores.map(s => `<optgroup label="${esc(setorCurto(s))} · ${esc(setorSub(s))}">` +
    M.fracoes.filter(f => f.setor === s).map(f => `<option value="${esc(f.nome)}">${esc(f.nome)} (${esc(f.partido)})</option>`).join("") + `</optgroup>`).join("");
  $("#edDia").innerHTML = DIAS.map(d => `<option value="${d.id}">${esc(d.data)} · ${esc(d.semana)} ${esc(d.relCalc)}</option>`).join("");
  const opcoesLocal = () => `<option value="">— nenhuma —</option>` + Object.keys(M.locais).map(n => `<option>${esc(n)}</option>`).join("");

  const fmtCoords = cs => cs.map(c => c.map(v => +(+v).toFixed(6)).join(", ")).join("; ");
  // aceita graus decimais ("-20.47, -54.62") ou GMS ("20°28'10"S 54°37'12"W"); vários pontos separados por ";"
  function lerCoords(txt) {
    const out = [];
    for (const seg of txt.split(";").map(s => s.trim()).filter(Boolean)) {
      const gms = [...seg.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*([\d.,]+)\s*(?:"+|″|''|”)?\s*([NSWOEL])/gi)]
        .map(m => (+m[1] + +m[2] / 60 + parseFloat(m[3].replace(",", ".")) / 3600) * (/[SWO]/i.test(m[4]) ? -1 : 1));
      const nums = gms.length === 2 ? gms : (seg.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      if (nums.length !== 2 || Math.abs(nums[0]) > 90 || Math.abs(nums[1]) > 180) return null;
      out.push([+nums[0].toFixed(6), +nums[1].toFixed(6)]);
    }
    return out;
  }

  let edAtual = null;   // evento em edição (null = novo)
  function abrirEditor(e, padrao = {}) {
    edAtual = e || null;
    const c = e ? campos(e) : { fracao: padrao.fracao, dia: padrao.dia, txt: "", turno: [], pms: [], coords: [], local: null, prec: null };
    $("#edTitulo").textContent = e ? "Editar evento" : "Novo evento";
    $("#edFr").value = c.fracao || M.fracoes[0].nome;
    $("#edDia").value = c.dia || DIAS[0].id;
    $("#edTxt").value = c.txt;
    document.querySelectorAll("#fmEd input[name=edTurno]").forEach(i => i.checked = c.turno.includes(i.value));
    $("#edPms").value = c.pms.join(", ");
    $("#edLocal").innerHTML = opcoesLocal(); $("#edLocal").value = c.local || "";
    $("#edCoords").value = fmtCoords(c.coords);
    $("#edPrecInfo").textContent = c.prec === "pc" ? "Coordenada herdada da posição do PC na planilha." : "";
    $("#edErro").textContent = "";
    const b = e && e.origem !== "novo" ? BASE_K[e.chave] : null;
    $("#edOrig").innerHTML = b && e.editado ? `<b>Original da planilha:</b> ${esc(FR[b.fid].nome)} · ${esc(DIA[b.dia].data)}<br>${esc(b.txt)}` : "";
    $("#edOrig").hidden = !(b && e.editado);
    $("#edRestaurar").hidden = !(b && e.editado);
    $("#edExcluir").hidden = !e;
    $("#edExcluir").textContent = "Excluir"; $("#edExcluir").classList.remove("confirmar");
    dlg.showModal();
    $("#edTxt").focus();
  }
  function lerForm() {
    const coords = lerCoords($("#edCoords").value);
    if (coords === null) { $("#edErro").textContent = "Coordenada inválida. Use “lat, lon” em graus decimais (ex.: -20.4697, -54.6201) ou GMS."; return null; }
    const txt = $("#edTxt").value.trim();
    if (!txt) { $("#edErro").textContent = "Informe a descrição do evento."; return null; }
    const local = $("#edLocal").value || null;
    const n = {
      fracao: $("#edFr").value, dia: $("#edDia").value, txt,
      turno: [...document.querySelectorAll("#fmEd input[name=edTurno]:checked")].map(i => i.value),
      pms: $("#edPms").value.split(/[,;\s]+/).map(s => s.replace(/^PMS/i, "").trim()).filter(Boolean),
      coords, local,
    };
    n.prec = edAtual && igual(coords, edAtual.coords) && local === edAtual.local ? edAtual.prec
      : coords.length ? "exata" : local ? "aprox" : null;
    return n;
  }
  // preenche turno/PMS a partir do texto, como faz o script da planilha
  $("#edDetectar").addEventListener("click", () => {
    const t = $("#edTxt").value;
    const pms = [...t.matchAll(/PMS\s*(\d+(?:\.\d+)?)/g)].map(m => m[1]);
    const tur = new Set([...t.matchAll(/\(((?:M|T|N)(?:\s*\/\s*(?:M|T|N))*)\)/g)].flatMap(m => m[1].split(/\s*\/\s*/)));
    if (pms.length) $("#edPms").value = [...new Set(pms)].join(", ");
    document.querySelectorAll("#fmEd input[name=edTurno]").forEach(i => { if (tur.size) i.checked = tur.has(i.value); });
    const gms = t.match(/\d{1,3}\s*[°º]\s*\d{1,2}\s*['′’]\s*[\d.,]+\s*(?:"+|″|''|”)?\s*[NSWOEL]/gi) || [];
    const pares = []; for (let i = 0; i + 1 < gms.length; i += 2) pares.push(gms[i] + " " + gms[i + 1]);
    const c = pares.length ? lerCoords(pares.join("; ")) : null;
    if (c && c.length && !$("#edCoords").value) $("#edCoords").value = fmtCoords(c);
  });

  $("#fmEd").addEventListener("submit", ev => {
    ev.preventDefault();
    const n = lerForm(); if (!n) return;
    let id;
    if (edAtual) { registrar(edAtual, n); id = edAtual.id; }
    else { const uid = novoUid(); LOCAL.novos[uid] = { ...n, seq: Date.now() }; id = idPara(uid); }
    dlg.close();
    confirmar(edAtual ? "Evento salvo" : "Evento criado");
    const e = EV.get(id);
    if (e && S.dia !== "ALL" && e.dia !== S.dia) aviso(`Salvo em ${DIA[e.dia].data} (outro dia)`);
    else if (e && !passa(e)) aviso("Salvo – fora dos filtros atuais");
    else if (e) focar(id, false);
  });
  $("#edCancelar").addEventListener("click", () => dlg.close());
  $("#edRestaurar").addEventListener("click", () => { if (!edAtual) return; dlg.close(); restaurar(edAtual.chave); });
  $("#edExcluir").addEventListener("click", () => {
    const b = $("#edExcluir");
    if (!b.classList.contains("confirmar")) { b.classList.add("confirmar"); b.textContent = "Clique de novo para excluir"; return; }
    dlg.close(); excluir(edAtual); confirmar("Evento excluído");
  });
  $("#edLimparC").addEventListener("click", () => { $("#edCoords").value = ""; });

  // marcar coordenada clicando no mapa
  $("#edPick").addEventListener("click", () => {
    if (S.visao !== "mapa") trocarVisao("mapa");
    dlg.close();
    $("#escolha").hidden = false; document.body.classList.add("escolhendo");
    const fim = ll => {
      $("#escolha").hidden = true; document.body.classList.remove("escolhendo");
      document.removeEventListener("keydown", esc_); mapa.off("click", clique);
      if (ll) { $("#edCoords").value = fmtCoords([[ll.lat, ll.lng]]); }
      dlg.showModal();
    };
    const clique = ev => fim(ev.latlng);
    const esc_ = ev => { if (ev.key === "Escape") fim(null); };
    mapa.once("click", clique);
    document.addEventListener("keydown", esc_);
    $("#escolhaCancelar").onclick = () => fim(null);
  });
  dlg.addEventListener("cancel", () => { edAtual = null; });

  // cliques em "✎" (lista e popups do mapa), "novo evento" e "restaurar localidade"
  document.addEventListener("click", ev => {
    const ed = ev.target.closest("[data-editar]");
    if (ed) { ev.stopPropagation(); mapa.closePopup(); abrirEditor(EV.get(+ed.dataset.editar)); return; }
    if (ev.target.closest("#edNovoCap, #edNovo")) {
      const fr = S.fracoes.size ? FR[[...S.fracoes][0]] : M.fracoes.find(frVisivel);
      abrirEditor(null, { fracao: fr && fr.nome, dia: S.dia === "ALL" ? DIAS[0].id : S.dia });
      return;
    }
    const rl = ev.target.closest("[data-restloc]");
    if (rl) {
      const n = rl.dataset.restloc;
      if (n in PUB.locais) LOCAL.locais[n] = null; else delete LOCAL.locais[n];
      mapa.closePopup(); confirmar(`Posição original de ${n} restaurada`);
    }
  });

  // ---- exportar / importar / descartar ----
  function conjuntoFinal() {
    const t = combinar(PUB, LOCAL);
    t.removidos = t.removidos.filter(k => { if (t.novos[k]) { delete t.novos[k]; return false; } return true; });
    return { atualizado: new Date().toISOString(), ...t };
  }
  function baixar(nome, txt, tipo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: tipo }));
    a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $("#edExportar").addEventListener("click", () => {
    const t = conjuntoFinal();
    baixar("edicoes.js", `/* Edições do StoryMap – geradas em ${t.atualizado}.\n   Coloque este arquivo na pasta do StoryMap (substituindo o anterior) para publicar as edições. */\n`
      + `window.MATRIZ_EDICOES = ${JSON.stringify(t, null, 1)};\n`, "text/javascript");
    aviso("edicoes.js exportado – substitua o arquivo na pasta do sistema");
  });
  // planilha CSV com todos os eventos já com as edições (para conferência ou para levar à matriz oficial)
  $("#edCsv").addEventListener("click", () => {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [["Setor", "Partido", "OM", "Dia", "Descrição", "Turno", "PMS", "Localidade", "Coordenadas", "Situação"]]
      .concat(M.eventos.map(e => { const f = FR[e.fid]; return [f.setor, f.partido, f.nome, DIA[e.dia].data, e.txt, e.turno.join("/"), e.pms.join(", "), e.local, fmtCoords(e.coords), e.origem === "novo" ? "novo" : e.editado ? "editado" : ""]; }));
    baixar("matriz_eventos.csv", "﻿" + linhas.map(l => l.map(q).join(";")).join("\r\n"), "text/csv");
  });
  $("#edImportar").addEventListener("change", async ev => {
    const arq = ev.target.files[0]; ev.target.value = "";
    if (!arq) return;
    try {
      const t = await arq.text();
      const imp = normED(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)));
      LOCAL = combinar(LOCAL, imp);
      confirmar(`Edições importadas de ${arq.name}`);
    } catch (err) { aviso("Não foi possível ler o arquivo: " + err.message); }
  });
  $("#edDescartar").addEventListener("click", () => {
    const b = $("#edDescartar");
    if (!pendentes()) { aviso("Não há alterações locais"); return; }
    if (!b.classList.contains("confirmar")) {
      b.classList.add("confirmar"); b.textContent = `Confirmar: descartar ${pendentes()}?`;
      setTimeout(() => { b.classList.remove("confirmar"); b.textContent = "Descartar alterações locais"; }, 4000);
      return;
    }
    b.classList.remove("confirmar"); b.textContent = "Descartar alterações locais";
    LOCAL = vazioED(); confirmar("Alterações locais descartadas");
  });
  addEventListener("beforeunload", ev => { if (pendentes() && S.edicao) { ev.preventDefault(); ev.returnValue = ""; } });

  // ---------- render ----------
  function render(voar = true) {
    const evs = M.eventos.filter(e => passa(e));
    contFr = {};
    M.eventos.forEach(e => { if (passa(e, false, true)) contFr[e.fid] = (contFr[e.fid] || 0) + 1; });
    atualizarChips();
    listaFracoes();
    desenharDias();
    desenharLista(evs);
    desenharMapa(evs, voar);
    if (S.visao === "matriz") desenharMatriz();
    resumoEdicao();
  }
  // no celular: filtros recolhidos e zoom por gesto (libera espaço no mapa)
  if (estreito()) { $(".filtros").open = false; mapa.zoomControl.remove(); }
  addEventListener("resize", () => mapa.invalidateSize());
  render(true);
})();
