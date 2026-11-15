/* StoryMap – Matriz de Sincronização (HTML + CSS + JS puro, Leaflet para o mapa) */
(() => {
  const M = window.MATRIZ;
  const FR = Object.fromEntries(M.fracoes.map(f => [f.id, f]));
  const DIAS = M.dias;
  const idxD = DIAS.findIndex(d => d.rel === "D");
  DIAS.forEach((d, i) => { d.i = i; d.relCalc = d.rel || (idxD >= 0 ? (i < idxD ? `D-${idxD - i}` : `D+${i - idxD}`) : ""); });
  const DIA = Object.fromEntries(DIAS.map(d => [d.id, d]));
  const partKey = p => (p || "").replace(/\s/g, "").toUpperCase();
  const COR = { FADST: "#2563a8", FOROP: "#c0392b", DIREX: "#c98a12" };
  const setorCurto = s => (s || "").replace(/\s*\(.*$/, "").trim();
  const setorSub = s => ((s || "").match(/\((.*)\)/) || [, ""])[1];

  // marcos automáticos por dia
  DIAS.forEach(d => {
    const tx = M.eventos.filter(e => e.dia === d.id).map(e => e.txt).join(" ");
    d.marcos = [];
    if (d.rel === "D") d.marcos.push("Dia D");
    if (/APRONTO OPERACIONAL/.test(tx)) d.marcos.push("Apronto Op");
    if (d.marco) d.marcos.push(d.marco.replace("VISITA OPERACIONAL", "Visita Op"));
    if (/\bAPA\b/.test(tx) && /Participar da APA em Campo Grande/i.test(tx)) d.marcos.push("APA");
  });

  // ---------- estado ----------
  const S = {
    dia: DIAS[idxD >= 0 ? idxD : 0].id,
    setores: new Set(), partidos: new Set(), turnos: new Set(), fracoes: new Set(),
    tipo: "all", q: "", foco: null, visao: "mapa",
  };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  M.eventos.forEach((e, i) => { e.id = i; e.n = norm(e.txt + " " + FR[e.fid].nome); });

  // ---------- filtros ----------
  function passa(e, ignorarDia = false) {
    const f = FR[e.fid];
    if (!ignorarDia && S.dia !== "ALL" && e.dia !== S.dia) return false;
    if (S.setores.size && !S.setores.has(f.setor)) return false;
    if (S.partidos.size && !S.partidos.has(f.partido)) return false;
    if (S.fracoes.size && !S.fracoes.has(f.id)) return false;
    if (S.tipo === "pms" && !e.pms.length) return false;
    if (S.tipo === "nopms" && e.pms.length) return false;
    if (S.turnos.size && !e.turno.some(t => S.turnos.has(t))) return false;
    if (S.q) { const termos = norm(S.q).split(/\s+/).filter(Boolean); if (!termos.every(t => e.n.includes(t))) return false; }
    return true;
  }

  function chips(el, valores, conjunto, rotulo = v => v) {
    el.innerHTML = valores.map(v => `<label><input type="checkbox" value="${esc(v)}"> ${esc(rotulo(v))}</label>`).join("");
    el.addEventListener("change", ev => {
      const v = ev.target.value; ev.target.checked ? conjunto.add(v) : conjunto.delete(v); render();
    });
  }
  const setores = [...new Set(M.fracoes.map(f => f.setor))];
  chips($("#fSetor"), setores, S.setores, s => setorCurto(s) + (setorSub(s) ? " · " + setorSub(s) : ""));
  chips($("#fPartido"), [...new Set(M.fracoes.map(f => f.partido))], S.partidos);
  chips($("#fTurno"), ["M", "T", "N"], S.turnos, t => ({ M: "Manhã", T: "Tarde", N: "Noite" }[t]));
  $("#fTipo").addEventListener("change", ev => { S.tipo = ev.target.value; render(); });

  function listaFracoes() {
    const q = norm($("#buscaFr").value);
    let html = "", ult = null;
    M.fracoes.forEach(f => {
      if (q && !norm(f.nome).includes(q)) return;
      if (f.setor !== ult) { html += `<div class="sep">${esc(setorCurto(f.setor))} · ${esc(setorSub(f.setor))}</div>`; ult = f.setor; }
      html += `<label><input type="checkbox" value="${f.id}" ${S.fracoes.has(f.id) ? "checked" : ""}>
        <span>${esc(f.nome)} <small>${esc(f.partido)}</small></span></label>`;
    });
    $("#fFracao").innerHTML = html || `<div class="vazio-msg">Nenhuma fração</div>`;
  }
  $("#fFracao").addEventListener("change", ev => { const v = ev.target.value; ev.target.checked ? S.fracoes.add(v) : S.fracoes.delete(v); render(); });
  $("#buscaFr").addEventListener("input", listaFracoes);
  $("#limparFr").addEventListener("click", () => { S.fracoes.clear(); listaFracoes(); render(); });
  let tBusca; $("#busca").addEventListener("input", ev => { clearTimeout(tBusca); tBusca = setTimeout(() => { S.q = ev.target.value.trim(); render(); }, 180); });
  $("#limparTudo").addEventListener("click", () => {
    [S.setores, S.partidos, S.turnos, S.fracoes].forEach(s => s.clear()); S.tipo = "all"; S.q = "";
    document.querySelectorAll(".filtros input[type=checkbox]").forEach(i => i.checked = false);
    document.querySelector('#fTipo input[value=all]').checked = true; $("#busca").value = ""; $("#buscaFr").value = "";
    listaFracoes(); render();
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
      `<b>${esc(FR[fid].nome)}</b> <span class="pc">${esc(FR[fid].partido)}</span><ul>` +
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
    locais.forEach((lista, nome) => {
      const ll = M.locais[nome], n = lista.length, tam = Math.min(70, 30 + Math.sqrt(n) * 5);
      const mk = L.marker(ll, {
        icon: L.divIcon({ className: "", html: `<div class="loc-ic" style="width:${tam}px;height:${tam}px">${n}<small>${esc(nome)}</small></div>`, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] }),
        zIndexOffset: -500,
      }).bindPopup(popupHtml(lista, `${nome} · localização aproximada`), { maxWidth: 380 }).addTo(camada);
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
      }).bindPopup(popupHtml(lista, ePc ? "Posição do PC" : (temPms ? "PMS · " + lista.flatMap(e => e.pms).map(p => "PMS " + p).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "Coordenada informada")), { maxWidth: 380 })
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
    return `<button class="ev ${S.foco === e.id ? "foco" : ""}" data-ev="${e.id}">${realcar(e.txt)}
      <span class="meta">${S.dia === "ALL" ? `<span class="tag dia">${esc(DIA[e.dia].data)}</span>` : ""}
      ${e.pms.map(p => `<span class="tag pms">PMS ${esc(p)}</span>`).join("")}
      ${e.turno.map(t => `<span class="tag">${t}</span>`).join("")}
      ${loc ? `<span class="tag loc">${esc(loc)}</span>` : ""}</span></button>`;
  }
  function desenharLista(evs) {
    const d = DIA[S.dia];
    const nPms = evs.filter(e => e.pms.length).length;
    const nFr = new Set(evs.map(e => e.fid)).size;
    const destaques = evs.filter(e => e.pms.length).slice(0, 3);
    $("#capitulo").innerHTML = S.dia === "ALL"
      ? `<h2>Todos os dias</h2><div class="sub">${esc(DIAS[0].data)} a ${esc(DIAS.at(-1).data)}</div>`
        + `<div class="kpis"><div><b>${evs.length}</b>eventos</div><div><b>${nPms}</b>PMS</div><div><b>${nFr}</b>frações</div></div>`
      : `<h2>${esc(d.data)} <small style="font-weight:400;color:var(--suave)">${esc(d.semana)} · ${esc(d.relCalc)}</small></h2>`
        + `<div class="sub">${d.marcos.length ? esc(d.marcos.join(" · ")) : "Dia " + (d.i + 1) + " de " + DIAS.length}</div>`
        + `<div class="kpis"><div><b>${evs.length}</b>eventos</div><div><b>${nPms}</b>PMS</div><div><b>${nFr}</b>frações</div></div>`
        + destaques.map(e => `<div class="destaque"><b>${esc(FR[e.fid].nome)}</b> — ${esc(e.txt.length > 140 ? e.txt.slice(0, 140) + "…" : e.txt)}</div>`).join("");
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
    const frs = M.fracoes.filter(f => (!S.setores.size || S.setores.has(f.setor)) && (!S.partidos.size || S.partidos.has(f.partido)) && (!S.fracoes.size || S.fracoes.has(f.id)));
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
    S.fracoes = new Set([c.dataset.fr]); listaFracoes(); trocarVisao("mapa"); irPara(c.dataset.dia);
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
    if (timer) { clearInterval(timer); timer = null; $("#btnPlay").textContent = "▶ Reproduzir"; return; }
    $("#btnPlay").textContent = "❚❚ Pausar";
    if (S.dia === "ALL") irPara(DIAS[0].id);
    timer = setInterval(() => { if (DIA[S.dia].i === DIAS.length - 1) $("#btnPlay").click(); else passo(1); }, 3500);
  });
  document.addEventListener("keydown", ev => {
    if (ev.target.matches("input")) return;
    if (ev.key === "ArrowRight") passo(1);
    if (ev.key === "ArrowLeft") passo(-1);
  });

  function render(voar = false) {
    const evs = M.eventos.filter(e => passa(e));
    desenharDias();
    desenharLista(evs);
    desenharMapa(evs, true);
    if (S.visao === "matriz") desenharMatriz();
    render.ja = true;
  }
  listaFracoes();
  render(true);
})();
