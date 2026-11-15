# StoryMap – Matriz de Sincronização 4ª Bda C Mec

Sistema web estático (HTML + CSS + JS puro; mapa com Leaflet via CDN).

## Arquivos
- `index.html` – estrutura da página
- `style.css` – visual
- `app.js` – lógica (filtros, linha do tempo, mapa, matriz, reprodução)
- `data.js` – dados extraídos da planilha (gerado automaticamente)
- `extras.js` – eventos inseridos à mão; não é sobrescrito pelo script
- `atualizar_dados.py` – regenera o `data.js` a partir da planilha
- `img/` – brasão da 4ª Bda C Mec (cabeçalho e favicon)

## Como abrir
Abra `index.html` no navegador (precisa de internet para o Leaflet e para os mapas de fundo).
Para hospedar, basta copiar a pasta para qualquer servidor estático (GitHub Pages, Nginx, intranet).

## Atualizar quando a matriz mudar
    pip install openpyxl
    python3 atualizar_dados.py "Matriz de Sincronização - 4ª Bda C Mec.xlsx" data.js

O script lê a 1ª aba, expande células mescladas, separa cada linha "- ..." como um evento,
identifica PMS, turnos (M/T/N), coordenadas geográficas (GMS) e UTM (fuso 21 S),
e a linha "(PC - ...)" de cada célula como posição do PC.
Coordenadas de cidades (Campo Grande, Aquidauana, Betione etc.) são aproximadas e
ficam no dicionário `LOCAIS` do script – ajuste ali se precisar de mais precisão.
