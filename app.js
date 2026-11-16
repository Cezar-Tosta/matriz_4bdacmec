/* Matriz de Sincronização - Operação Perseu (HTML + CSS + JS puro, Leaflet para o mapa) */
(() => {
  const M = window.MATRIZ;
  const FR = Object.fromEntries(M.fracoes.map(f => [f.id, f]));
  const FR_IDX = Object.fromEntries(M.fracoes.map((f, i) => [f.id, i]));

  // eventos manuais (extras.js): entram logo após os eventos da mesma fração no mesmo dia
  (window.MATRIZ_EXTRAS || []).forEach(x => {
    const f = M.fracoes.find(f => f.nome === x.fracao);
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

  // ---------- eventos ----------
  M.eventos.forEach((e, i) => { e.id = i; e.ordem = i; e.n = norm(e.txt + " " + FR[e.fid].nome); });

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
    tipo: "all", q: "", foco: null, visao: "mapa",
  };
  calcMarcos();

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

  function popupHtml(lista, titulo) {
    const porFr = {};
    lista.forEach(e => (porFr[e.fid] ||= []).push(e));
    return `<div class="pop"><h5>${esc(titulo)}</h5>` + Object.entries(porFr).map(([fid, evs]) =>
      `<b class="om" data-om="${fid}" title="Clique para filtrar só esta OM">${esc(FR[fid].nome)}</b> <span class="pc">${esc(FR[fid].partido)}</span><ul>` +
      evs.map(e => `<li>${S.dia === "ALL" ? `<span class="tag dia">${esc(DIA[e.dia].data)}</span> ` : ""}${esc(e.txt)}</li>`).join("") + "</ul>"
    ).join("") + (lista[0].pc && lista[0].prec === "pc" ? `<div class="pc">${esc(lista[0].pc)}</div>` : "") + "</div>";
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
      const mk = L.marker(ll, {
        icon: L.divIcon({ className: "", html: `<div class="loc-ic" style="width:${tam}px;height:${tam}px">${n}<small>${esc(nome)}</small></div>`, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] }),
        zIndexOffset: -500,
      }).bindPopup(popupHtml(lista, `${nome} · localização aproximada`), { maxWidth: popW }).addTo(camada);
      lista.forEach(e => marcadorDoEvento.set(e.id, mk));
      limites.push(ll);
    });
    // pontos exatos / PC
    pontos.forEach((lista, k) => {
      const e0 = lista[0], cor = COR[partKey(FR[e0.fid].partido)] || "#555";
      const temPms = lista.some(e => e.pms.length), ePc = k.endsWith("|pc");
      const cls = `mk ${temPms ? "pms" : ""} ${ePc ? "pc" : ""} ${lista.some(e => e.id === S.foco) ? "sel" : ""}`;
      const bg = temPms ? "var(--pms)" : cor;
      const mk = L.marker(e0.coords[0], {
        icon: L.divIcon({ className: "", html: `<div class="${cls}" style="background:${bg};--cor:${cor}"></div>${lista.length > 1 ? `<span class="mk-n">${lista.length}</span>` : ""}`, iconSize: [16, 16], iconAnchor: [8, 8] }),
        zIndexOffset: temPms ? 500 : 0,
      }).bindPopup(popupHtml(lista, ePc ? "Posição do PC" : (temPms ? "PMS · " + lista.flatMap(e => e.pms).map(p => "PMS " + p).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "Coordenada informada")), { maxWidth: popW })
        .addTo(camada);
      mk.on("click", () => focar(lista[0].id, false));
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
</span></button>`;
    return bt;
  }
  function desenharLista(evs) {
    const d = DIA[S.dia];
    const nPms = evs.filter(e => e.pms.length).length;
    const nFr = new Set(evs.map(e => e.fid)).size;
    const destaques = evs.filter(e => e.pms.length).slice(0, 3);
    const kpis = `<div class="kpis"><div><b>${evs.length}</b>eventos</div><div><b>${nPms}</b>PMS</div>` + `<div><b>${nFr}</b>frações</div></div>`;
    $("#capitulo").innerHTML = (S.dia === "ALL"
      ? `<h2>Todos os dias</h2><div class="sub">${esc(DIAS[0].data)} a ${esc(DIAS.at(-1).data)}</div>` + kpis
      : `<h2>${esc(d.data)} <small style="font-weight:400;color:var(--suave)">${esc(d.semana)} · ${esc(d.relCalc)}</small></h2>`
        + `<div class="sub">${d.marcos.length ? esc(d.marcos.join(" · ")) : "Dia " + (d.i + 1) + " de " + DIAS.length}</div>`
        + kpis
        + destaques.map(e => `<div class="destaque"><b>${esc(FR[e.fid].nome)}</b> — ${esc(e.txt.length > 140 ? e.txt.slice(0, 140) + "…" : e.txt)}</div>`).join(""));
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
        html += `<div class="fr"><h4 class="om" data-om="${fid}" title="Clique para filtrar só esta OM"><span class="pt c-${partKey(f.partido)}">${esc(f.partido)}</span>${esc(f.nome)}</h4>${lista.map(itemHtml).join("")}</div>`;
      });
      html += `</div>`;
    });
    if (evs.length > LIM) html += `<div class="vazio-msg">Mostrando ${LIM} de ${evs.length}. Refine os filtros ou escolha um dia.</div>`;
    $("#eventos").innerHTML = html;
  }
  $("#eventos").addEventListener("click", ev => {
    const om = ev.target.closest("[data-om]"); if (om) { selecionarOM(om.dataset.om); return; }
    const b = ev.target.closest(".ev"); if (b) focar(+b.dataset.ev, true);
  });
  // popup do mapa: nome da OM também filtra
  document.addEventListener("click", ev => {
    const om = ev.target.closest(".pop [data-om]"); if (om) { mapa.closePopup(); selecionarOM(om.dataset.om); }
  });

  // ---------- filtro por OM (clique no nome) + botão "Limpar Filtro" ----------
  function selecionarOM(fid) { S.fracoes = new Set([fid]); S.foco = null; render(true); }
  function filtroAtivo() {
    const n = S.fracoes.size;
    $("#filtroAtivo").hidden = !n;
    $(".palco").classList.toggle("com-filtro", !!n);
    if (!n) return;
    const nomes = [...S.fracoes].map(id => FR[id].nome);
    $("#filtroNome").textContent = n === 1 ? nomes[0] : `${n} OM selecionadas`;
    $("#filtroNome").title = nomes.join(", ");
  }
  $("#btnLimparFiltro").addEventListener("click", () => { S.fracoes.clear(); render(true); });

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
      html += `<tr><td class="nome ${S.fracoes.has(f.id) ? "sel" : ""}" data-om="${f.id}" style="border-left-color:${COR[partKey(f.partido)]}" title="${esc(f.nome)} · ${esc(f.partido)} — clique para filtrar só esta OM">${esc(f.nome)}</td>`;
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
    const om = ev.target.closest("td[data-om]");
    if (om) { selecionarOM(om.dataset.om); return; }
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
    if (ev.target.matches("input, textarea, select")) return;
    if (ev.key === "ArrowRight") passo(1);
    if (ev.key === "ArrowLeft") passo(-1);
  });

  // ---------- utilitários ----------
  let tAviso;
  function aviso(msg) {
    const el = $("#aviso"); el.textContent = msg; el.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(() => el.hidden = true, 2600);
  }
  function baixar(nome, txt, tipo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: tipo }));
    a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fmtCoords = cs => cs.map(c => c.map(v => +(+v).toFixed(6)).join(", ")).join("; ");

  // =====================================================================
  // ---------- EXPORTAÇÃO (PDF / KML / KMZ) conforme os filtros ----------
  // =====================================================================
  const TITULO = "Matriz de Sincronização - Operação Perseu";
  const eventosFiltrados = () => M.eventos.filter(e => passa(e))
    .sort((a, b) => DIA[a.dia].i - DIA[b.dia].i || FR_IDX[a.fid] - FR_IDX[b.fid] || a.ordem - b.ordem);
  const turnoNome = { M: "Manhã", T: "Tarde", N: "Noite" };

  // descrição legível dos filtros ativos (vai no cabeçalho do PDF e na descrição do KML)
  function descreverFiltros() {
    const l = [["Período", S.dia === "ALL" ? `Todos os dias (${DIAS[0].data} a ${DIAS.at(-1).data})` : `${DIA[S.dia].data} (${DIA[S.dia].semana}${DIA[S.dia].relCalc ? " · " + DIA[S.dia].relCalc : ""})`]];
    if (S.setores.size) l.push(["Setor", [...S.setores].map(s => setorCurto(s) + (setorSub(s) ? " · " + setorSub(s) : "")).join("; ")]);
    if (S.partidos.size) l.push(["Partido", [...S.partidos].join(", ")]);
    if (S.fracoes.size) l.push(["OM", [...S.fracoes].map(id => FR[id].nome).join(", ")]);
    if (S.tipo !== "all") l.push(["Tipo", S.tipo === "pms" ? "Só PMS" : "Sem PMS"]);
    if (S.turnos.size) l.push(["Turno", [...S.turnos].map(t => turnoNome[t]).join(", ")]);
    if (S.q) l.push(["Busca", `“${S.q}”`]);
    return l;
  }
  const localTxt = e => e.prec === "exata" ? fmtCoords(e.coords) : e.prec === "pc" ? "PC: " + fmtCoords(e.coords)
    : e.local ? `≈ ${e.local}` : "";
  const carimbo = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const nomeArq = ext => {
    const per = S.dia === "ALL" ? "todos-os-dias" : S.dia;
    const om = S.fracoes.size === 1 ? "_" + FR[[...S.fracoes][0]].nome : "";
    return `Matriz_Perseu_${per}${om}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_") + "." + ext;
  };

  // ---- menu ----
  const menu = $("#menuExp");
  function abrirMenu(abrir) {
    menu.hidden = !abrir; $("#btnExportar").setAttribute("aria-expanded", abrir);
    if (!abrir) return;
    const evs = eventosFiltrados(), semLoc = evs.filter(e => !e.coords.length && !(e.local && M.locais[e.local])).length;
    $("#expResumo").innerHTML = `<b>${evs.length}</b> evento(s) · ` + descreverFiltros().map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ");
    $("#expNota").textContent = semLoc ? `${semLoc} evento(s) sem localização entram no PDF, mas não no KML/KMZ.` : "";
    menu.querySelectorAll("button").forEach(b => b.disabled = !evs.length);
  }
  $("#btnExportar").addEventListener("click", ev => { ev.stopPropagation(); abrirMenu(menu.hidden); });
  document.addEventListener("click", ev => { if (!menu.hidden && !ev.target.closest(".exportar")) abrirMenu(false); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") abrirMenu(false); });
  menu.addEventListener("click", ev => {
    const b = ev.target.closest("[data-exp]"); if (!b) return;
    abrirMenu(false);
    const evs = eventosFiltrados();
    if (b.dataset.exp === "pdf") exportarPdf(evs);
    else exportarKml(evs, b.dataset.exp === "kmz");
  });

  // ---- PDF (jsPDF + AutoTable via CDN; sem internet cai para a impressão do navegador) ----
  const carregar = src => new Promise((ok, falha) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => falha(new Error(src)); document.head.appendChild(s);
  });
  let libsPdf;
  const libsPdfProntas = () => libsPdf ||= carregar("https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js")
    .then(() => carregar("https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"))
    .catch(err => { libsPdf = null; throw err; });
  // fontes padrão do PDF só têm Latin-1: troca tipografia "especial" por equivalentes simples
  const pdfTxt = s => String(s ?? "").replace(/[–—]/g, "-").replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/…/g, "...")
    .replace(/≈/g, "~").replace(/[•·]/g, "·").replace(/[^\x00-\xff]/g, "");
  function linhasTabela(evs) {
    return evs.map(e => { const f = FR[e.fid]; return {
      dia: `${DIA[e.dia].data}${DIA[e.dia].relCalc ? " " + DIA[e.dia].relCalc : ""}`,
      setor: setorCurto(f.setor) + (setorSub(f.setor) ? " · " + setorSub(f.setor) : ""),
      om: f.nome, partido: f.partido, txt: e.txt, turno: e.turno.join("/"),
      pms: e.pms.join(", "), local: localTxt(e), temPms: !!e.pms.length,
    }; });
  }
  async function exportarPdf(evs) {
    aviso("Gerando PDF…");
    try { await libsPdfProntas(); } catch { aviso("Sem acesso à biblioteca de PDF (internet). Abrindo versão para imprimir/salvar em PDF."); return imprimirTabela(evs); }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), mg = 10;
    let logo = null;
    try { const im = $(".marca .brasao"), c = document.createElement("canvas"); c.width = c.height = 128; c.getContext("2d").drawImage(im, 0, 0, 128, 128); logo = c.toDataURL("image/png"); } catch { }
    const filtros = descreverFiltros();
    const cab = () => {
      doc.setFillColor(90, 26, 42); doc.rect(0, 0, W, 16, "F");
      if (logo) doc.addImage(logo, "PNG", mg, 2, 12, 12);
      doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(pdfTxt(TITULO), mg + (logo ? 15 : 0), 8.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(pdfTxt("4ª Bda C Mec"), mg + (logo ? 15 : 0), 13);
      doc.text(pdfTxt(`Gerado em ${carimbo()}`), W - mg, 13, { align: "right" });
      doc.setTextColor(0);
    };
    cab();
    doc.setFontSize(8.5); let y = 21;
    filtros.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold"); doc.text(pdfTxt(k + ":"), mg, y);
      doc.setFont("helvetica", "normal");
      const ls = doc.splitTextToSize(pdfTxt(v), W - 2 * mg - 22); doc.text(ls, mg + 22, y); y += 4 * ls.length;
    });
    const nPms = evs.filter(e => e.pms.length).length;
    doc.setFont("helvetica", "bold");
    doc.text(pdfTxt(`${evs.length} evento(s) · ${nPms} PMS · ${new Set(evs.map(e => e.fid)).size} OM`), mg, y); y += 2;
    const linhas = linhasTabela(evs);
    doc.autoTable({
      startY: y + 1, margin: { left: mg, right: mg, top: 20, bottom: 12 },
      head: [["Dia", "Setor", "OM", "Partido", "Descrição", "Turno", "PMS", "Localização"]],
      body: linhas.map(r => [r.dia, r.setor, r.om, r.partido, r.txt, r.turno, r.pms, r.local].map(pdfTxt)),
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.4, valign: "top", lineColor: [222, 219, 210], lineWidth: .15, overflow: "linebreak" },
      headStyles: { fillColor: [90, 26, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 247, 243] },
      columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 48 }, 2: { cellWidth: 34, fontStyle: "bold" }, 3: { cellWidth: 15 },
        4: { cellWidth: "auto" }, 5: { cellWidth: 12, halign: "center" }, 6: { cellWidth: 14, halign: "center" }, 7: { cellWidth: 36 } },
      didParseCell: d => {
        if (d.section !== "body") return;
        const r = linhas[d.row.index];
        if (r.temPms) { d.cell.styles.fillColor = [241, 232, 250]; if (d.column.index === 6) { d.cell.styles.textColor = [123, 44, 191]; d.cell.styles.fontStyle = "bold"; } }
        if (d.column.index === 3) d.cell.styles.textColor = { FADST: [37, 99, 168], FOROP: [192, 57, 43], DIREX: [160, 105, 10] }[partKey(r.partido)] || 0;
      },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > 1) cab(); },
    });
    const tot = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tot; i++) {
      doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(110); doc.setFont("helvetica", "normal");
      doc.text(pdfTxt(`${TITULO} · Linhas em lilás contêm PMS`), mg, H - 5);
      doc.text(`Página ${i} de ${tot}`, W - mg, H - 5, { align: "right" });
    }
    doc.save(nomeArq("pdf"));
    aviso("PDF gerado");
  }
  // alternativa offline: tabela numa janela nova + diálogo de impressão ("Salvar como PDF")
  function imprimirTabela(evs) {
    const w = open("", "_blank"); if (!w) { aviso("Permita pop-ups para gerar o PDF"); return; }
    const l = linhasTabela(evs);
    w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(TITULO)}</title><style>
      @page{size:A4 landscape;margin:10mm}body{font:10px system-ui,sans-serif;color:#111}h1{font-size:15px;margin:0;color:#5a1a2a}
      .f{margin:4px 0 8px}table{border-collapse:collapse;width:100%}th{background:#5a1a2a;color:#fff;text-align:left}
      th,td{border:1px solid #ccc;padding:3px 4px;vertical-align:top}tr.p td{background:#f1e8fa}thead{display:table-header-group}tr{break-inside:avoid}</style>
      <h1>${esc(TITULO)}</h1><div>4ª Bda C Mec · gerado em ${carimbo()}</div>
      <div class="f">${descreverFiltros().map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(" &nbsp; ")} &nbsp; <b>${evs.length}</b> evento(s)</div>
      <table><thead><tr><th>Dia</th><th>Setor</th><th>OM</th><th>Partido</th><th>Descrição</th><th>Turno</th><th>PMS</th><th>Localização</th></tr></thead><tbody>
      ${l.map(r => `<tr class="${r.temPms ? "p" : ""}">${[r.dia, r.setor, r.om, r.partido, r.txt, r.turno, r.pms, r.local].map(c => `<td>${esc(c).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`).join("")}
      </tbody></table><script>onload=()=>setTimeout(()=>print(),200)<\/script></html>`);
    w.document.close();
  }

  // ---- KML / KMZ ----
  const xml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  const kmlCor = (hex, a = "ff") => a + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);   // #rrggbb → aabbggrr
  // ano da operação: o primeiro em que o dia da semana da planilha bate com a data
  const ANO = (() => {
    const d0 = DIAS[0], m = (d0.data.match(/\d+\s+(\w{3})/) || [])[1], mes = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"].indexOf((m || "").toUpperCase());
    const sem = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].indexOf(d0.semana), hoje = new Date().getFullYear();
    if (mes < 0 || sem < 0) return null;
    for (const a of [hoje, hoje + 1, hoje - 1, hoje + 2, hoje - 2]) if (new Date(a, mes, parseInt(d0.data)).getDay() === sem) return a;
    return null;
  })();
  const isoDia = d => { if (!ANO) return null; const m = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"].indexOf(d.data.slice(-3).toUpperCase()); return m < 0 ? null : `${ANO}-${String(m + 1).padStart(2, "0")}-${d.data.slice(0, 2)}`; };

  function gerarKml(evs) {
    const estilos = Object.entries({ FADST: "#2563a8", FOROP: "#c0392b", DIREX: "#c98a12", OUTRO: "#555555" }).map(([k, c]) => `
  <Style id="${k}"><IconStyle><color>${kmlCor(c)}</color><scale>1.0</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.7</scale></LabelStyle><LineStyle><color>${kmlCor(c)}</color><width>3</width></LineStyle></Style>
  <Style id="${k}_aprox"><IconStyle><color>${kmlCor(c, "aa")}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/open-diamond.png</href></Icon></IconStyle><LabelStyle><scale>0.6</scale></LabelStyle></Style>`).join("") + `
  <Style id="PMS"><IconStyle><color>${kmlCor("#7b2cbf")}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/star.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle><LineStyle><color>${kmlCor("#7b2cbf")}</color><width>3</width></LineStyle></Style>`;
    let semLoc = 0, n = 0;
    const porDia = new Map();
    evs.forEach(e => {
      const pts = e.coords.length ? e.coords : e.local && M.locais[e.local] ? [M.locais[e.local]] : null;
      if (!pts) { semLoc++; return; }
      const f = FR[e.fid], pk = COR[partKey(f.partido)] ? partKey(f.partido) : "OUTRO", aprox = !e.coords.length;
      const estilo = e.pms.length ? "PMS" : pk + (aprox ? "_aprox" : "");
      const coordStr = pts.map(([la, lo]) => `${lo},${la},0`).join(" ");
      const geo = pts.length > 1 ? `<MultiGeometry><Point><coordinates>${pts[0][1]},${pts[0][0]},0</coordinates></Point><LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString></MultiGeometry>`
        : `<Point><coordinates>${coordStr}</coordinates></Point>`;
      const d = DIA[e.dia], iso = isoDia(d);
      const desc = `<b>${f.nome}</b> (${f.partido})<br>${setorCurto(f.setor)}${setorSub(f.setor) ? " · " + setorSub(f.setor) : ""}<br><b>${d.data}</b> ${d.semana} ${d.relCalc}<hr>${e.txt}`
        + (e.turno.length ? `<br><b>Turno:</b> ${e.turno.map(t => turnoNome[t]).join(", ")}` : "") + (e.pms.length ? `<br><b>PMS:</b> ${e.pms.join(", ")}` : "")
        + `<br><b>Localização:</b> ${aprox ? "aproximada – " + e.local : e.prec === "pc" ? "posição do PC" : "coordenada informada"}` + (e.pc ? `<br><i>${e.pc}</i>` : "");
      const pm = `
      <Placemark><name>${xml((e.pms.length ? "PMS " + e.pms.join("/") + " · " : "") + f.nome)}</name>${iso ? `<TimeStamp><when>${iso}</when></TimeStamp>` : ""}<styleUrl>#${estilo}</styleUrl>
        <description><![CDATA[${desc.replace(/]]>/g, "]] >")}]]></description>
        <ExtendedData><Data name="Dia"><value>${xml(d.data)}</value></Data><Data name="OM"><value>${xml(f.nome)}</value></Data><Data name="Partido"><value>${xml(f.partido)}</value></Data><Data name="Setor"><value>${xml(f.setor)}</value></Data><Data name="Descricao"><value>${xml(e.txt)}</value></Data><Data name="Turno"><value>${xml(e.turno.join("/"))}</value></Data><Data name="PMS"><value>${xml(e.pms.join(", "))}</value></Data><Data name="Precisao"><value>${aprox ? "aproximada" : e.prec}</value></Data></ExtendedData>
        ${geo}</Placemark>`;
      if (!porDia.has(e.dia)) porDia.set(e.dia, new Map());
      const m = porDia.get(e.dia); (m.get(e.fid) || m.set(e.fid, []).get(e.fid)).push(pm); n++;
    });
    const pastas = [...porDia].map(([dia, frs]) => { const d = DIA[dia]; return `
    <Folder><name>${xml(`${d.data} (${d.semana}${d.relCalc ? " · " + d.relCalc : ""})`)}</name>${[...frs].map(([fid, pms]) => `
     <Folder><name>${xml(FR[fid].nome + " · " + FR[fid].partido)}</name>${pms.join("")}
     </Folder>`).join("")}
    </Folder>`; }).join("");
    const descDoc = descreverFiltros().map(([k, v]) => `${k}: ${v}`).join("\n") + `\nGerado em ${carimbo()}` + (semLoc ? `\n${semLoc} evento(s) sem localização não incluídos.` : "");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${xml(TITULO)}</name>
  <description>${xml(descDoc)}</description>${estilos}${pastas}
</Document>
</kml>
`;
    return { kml, n, semLoc };
  }

  // ZIP mínimo (sem compressão) para o KMZ — dispensa bibliotecas externas
  const CRC_T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  function zipar(arquivos) {
    const enc = new TextEncoder(), partes = [], central = []; let off = 0;
    const dt = new Date(), hora = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1), data = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    arquivos.forEach(({ nome, dados }) => {
      const nm = enc.encode(nome), crc = crc32(dados), loc = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, hora, 2], [12, data, 2], [14, crc, 4], [18, dados.length, 4], [22, dados.length, 4], [26, nm.length, 2], [28, 0, 2]]
        .forEach(([p, v, t]) => t === 4 ? loc.setUint32(p, v, true) : loc.setUint16(p, v, true));
      const cen = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, hora, 2], [14, data, 2], [16, crc, 4], [20, dados.length, 4], [24, dados.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]]
        .forEach(([p, v, t]) => t === 4 ? cen.setUint32(p, v, true) : cen.setUint16(p, v, true));
      partes.push(loc, nm, dados); central.push(cen, nm);
      off += 30 + nm.length + dados.length;
    });
    const tamC = central.reduce((s, x) => s + x.byteLength, 0), fim = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, arquivos.length, 2], [10, arquivos.length, 2], [12, tamC, 4], [16, off, 4], [20, 0, 2]]
      .forEach(([p, v, t]) => t === 4 ? fim.setUint32(p, v, true) : fim.setUint16(p, v, true));
    return new Blob([...partes, ...central, fim], { type: "application/vnd.google-earth.kmz" });
  }

  function exportarKml(evs, kmz) {
    const { kml, n, semLoc } = gerarKml(evs);
    if (!n) { aviso("Nenhum evento com localização nos filtros atuais"); return; }
    const nota = semLoc ? ` (${semLoc} sem localização ficaram de fora)` : "";
    if (kmz) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zipar([{ nome: "doc.kml", dados: new TextEncoder().encode(kml) }]));
      a.download = nomeArq("kmz"); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else baixar(nomeArq("kml"), kml, "application/vnd.google-earth.kml+xml");
    aviso(`${kmz ? "KMZ" : "KML"} gerado com ${n} evento(s)${nota}`);
  }

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
    filtroAtivo();
  }
  // no celular: filtros recolhidos e zoom por gesto (libera espaço no mapa)
  if (estreito()) { $(".filtros").open = false; mapa.zoomControl.remove(); }
  addEventListener("resize", () => mapa.invalidateSize());
  render(true);
})();
