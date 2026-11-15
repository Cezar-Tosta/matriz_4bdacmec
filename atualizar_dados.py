#!/usr/bin/env python3
"""Converte a Matriz de Sincronização (.xlsx) em data.js para o StoryMap.

Uso:  python3 atualizar_dados.py Matriz.xlsx  [saida=data.js]
Requer: pip install openpyxl
"""
import sys, re, json, math
import openpyxl

ABA = 0            # primeira aba (matriz completa)
COL_INI = 4        # coluna D = 1º dia
UTM_ZONA = 21      # Mato Grosso do Sul (hemisfério sul)

# Localidades conhecidas (coordenadas aproximadas do centro urbano / área)
LOCAIS = {
    "Campo Grande": (-20.4697, -54.6201),
    "Aquidauana": (-20.4711, -55.7872),
    "Dourados": (-22.2211, -54.8056),
    "Jardim": (-21.4803, -56.1381),
    "Porto Murtinho": (-21.6989, -57.8825),
    "Corumbá": (-19.0089, -57.6514),
    "Nioaque": (-21.1353, -55.8297),
    "Betione": (-20.43, -56.43),
    "Bertione": (-20.43, -56.43),
    "Lins": (-21.6786, -49.7425),
    "Forte Coimbra": (-19.9167, -57.7917),
    "Porto da Manga": (-19.2588, -57.2344),
}
ALIAS = {"Bertione": "Betione"}


def utm_para_latlon(e, n, zona=UTM_ZONA, sul=True):
    a, f = 6378137.0, 1 / 298.257222101  # SIRGAS2000/GRS80
    k0 = 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x = e - 500000.0
    y = n - 10000000.0 if sul else n
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    p1 = (mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
          + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
          + (151 * e1**3 / 96) * math.sin(6 * mu)
          + (1097 * e1**4 / 512) * math.sin(8 * mu))
    c1 = ep2 * math.cos(p1)**2
    t1 = math.tan(p1)**2
    n1 = a / math.sqrt(1 - e2 * math.sin(p1)**2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(p1)**2)**1.5
    d = x / (n1 * k0)
    lat = p1 - (n1 * math.tan(p1) / r1) * (
        d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d**3 / 6
           + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120) / math.cos(p1)
    lon0 = math.radians((zona - 1) * 6 - 180 + 3)
    return round(math.degrees(lat), 6), round(math.degrees(lon0 + lon), 6)


_G, _M, _S = r"\s*[°º]\s*", r"\s*['′’]\s*", r"\s*(?:\"+|″|''|”)?\s*"
RE_DMS = re.compile(r"(\d{1,2})" + _G + r"(\d{1,2})" + _M + r"([\d.,]+)" + _S + r"([SN])"
                    r"[\s/,;\-–]*"
                    r"(\d{1,3})" + _G + r"(\d{1,2})" + _M + r"([\d.,]+)" + _S + r"([WOE])")
RE_UTM = re.compile(r"(\d{6}(?:\.\d+)?)\s*m\s*E\s*°?\s*,\s*(\d{7}(?:\.\d+)?)\s*m\s*S")
RE_PMS = re.compile(r"PMS\s*(\d+(?:\.\d+)?)")
RE_TURNO = re.compile(r"\(((?:M|T|N)(?:\s*/\s*(?:M|T|N))*)\)")


def dms(g, m, s, h):
    v = int(g) + int(m) / 60 + float(s.replace(',', '.').rstrip('.')) / 3600
    return -v if h in "SWO" else v


def extrair_coords(txt):
    pts = []
    for mt in RE_DMS.finditer(txt):
        pts.append((mt.start(), [round(dms(*mt.group(1, 2, 3, 4)), 6), round(dms(*mt.group(5, 6, 7, 8)), 6)]))
    for mt in RE_UTM.finditer(txt):
        pts.append((mt.start(), list(utm_para_latlon(float(mt.group(1)), float(mt.group(2))))))
    return [p for _, p in sorted(pts)]


def achar_local(txt):
    for nome in LOCAIS:
        if re.search(nome.replace(" ", r"\s*"), txt, re.I):
            return ALIAS.get(nome, nome)
    return None


def limpar(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def main(xlsx, saida="data.js"):
    wb = openpyxl.load_workbook(xlsx)
    ws = wb.worksheets[ABA]
    # expande células mescladas
    grade = {}
    for r in ws.iter_rows():
        for c in r:
            grade[(c.row, c.column)] = c.value
    for mr in ws.merged_cells.ranges:
        v = ws.cell(mr.min_row, mr.min_col).value
        for rr in range(mr.min_row, mr.max_row + 1):
            for cc in range(mr.min_col, mr.max_col + 1):
                grade[(rr, cc)] = v

    dias = []
    for c in range(COL_INI, ws.max_column + 1):
        h = grade.get((1, c))
        if not h:
            continue
        linhas = [l.strip() for l in str(h).split("\n") if l.strip()]
        m = re.match(r"(\d{2})\s*(\w{3})", linhas[0])
        rel = re.search(r"\((D(?:\+\d+)?)\)", str(h))
        extra = [l for l in linhas[1:] if not l.startswith("(")]
        sem = re.search(r"\((Seg|Ter|Qua|Qui|Sex|Sáb|Dom)\)", str(h))
        dias.append({"col": c, "id": f"{m.group(1)}{m.group(2)}", "data": f"{m.group(1)} {m.group(2)}",
                     "semana": sem.group(1) if sem else "", "rel": rel.group(1) if rel else "",
                     "marco": " ".join(extra)})

    fracoes, eventos = [], []
    setor = partido = None
    for r in range(2, ws.max_row + 1):
        fr = limpar(grade.get((r, 3)))
        if not fr:
            continue
        if grade.get((r, 1)):
            setor = limpar(grade[(r, 1)])
        if grade.get((r, 2)):
            partido = limpar(grade[(r, 2)]).upper().replace("DIREX", "DIREX")
        fid = f"f{len(fracoes)}"
        fracoes.append({"id": fid, "nome": fr, "setor": setor, "partido": partido})
        local_atual = None
        for d in dias:
            cel = grade.get((r, d["col"]))
            if not cel or not str(cel).strip():
                continue
            txt = str(cel)
            # linhas "(PC - ...)" descrevem o posto de comando da fração naquele dia
            pc_txt, corpo = None, []
            for ln in txt.split("\n"):
                if re.match(r"\s*\(\s*PC\b", ln):
                    pc_txt = limpar(ln).strip("() ")
                else:
                    corpo.append(ln)
            corpo = "\n".join(corpo)
            pc_coords = extrair_coords(pc_txt) if pc_txt else []
            local_cel = achar_local(txt)
            itens = [limpar(x) for x in re.split(r"\n\s*-\s*|^\s*-\s*", corpo) if limpar(x)]
            for it in itens:
                coords = extrair_coords(it)
                proprio = achar_local(it)
                if coords:
                    prec = "exata"
                elif proprio:
                    prec = "aprox"
                elif pc_coords:
                    coords, prec = [pc_coords[0]], "pc"
                elif local_cel or local_atual:
                    prec = "aprox"
                else:
                    prec = None
                pms = RE_PMS.findall(it)
                turno = RE_TURNO.findall(it)
                eventos.append({
                    "fid": fid, "dia": d["id"], "txt": it, "pc": pc_txt,
                    "pms": pms, "turno": sorted({t for g in turno for t in re.split(r"\s*/\s*", g)}),
                    "coords": coords, "local": proprio or local_cel or local_atual, "prec": prec,
                })
            if local_cel:
                local_atual = local_cel

    for d in dias:
        d.pop("col")
    out = {"titulo": "Matriz de Sincronização – 4ª Bda C Mec", "dias": dias, "fracoes": fracoes,
           "eventos": eventos, "locais": {k: v for k, v in LOCAIS.items() if k not in ALIAS}}
    with open(saida, "w", encoding="utf-8") as f:
        f.write("window.MATRIZ = ")
        json.dump(out, f, ensure_ascii=False, indent=0)
        f.write(";\n")
    print(f"{len(dias)} dias, {len(fracoes)} frações, {len(eventos)} eventos, "
          f"{sum(1 for e in eventos if e['prec']=='exata')} c/ coord. exata, {sum(1 for e in eventos if e['prec']=='pc')} pela posição do PC, "
          f"{sum(1 for e in eventos if e['pms'])} PMS → {saida}")


if __name__ == "__main__":
    main(*sys.argv[1:])
