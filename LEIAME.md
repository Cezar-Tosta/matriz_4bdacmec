# StoryMap – Matriz de Sincronização 4ª Bda C Mec

Sistema web estático (HTML + CSS + JS puro; mapa com Leaflet via CDN).

## Arquivos
- `index.html` – estrutura da página
- `style.css` – visual
- `app.js` – lógica (filtros, linha do tempo, mapa, matriz, reprodução)
- `data.js` – dados extraídos da planilha (gerado automaticamente)
- `extras.js` – eventos inseridos à mão; não é sobrescrito pelo script
- `edicoes.js` – edições feitas no próprio navegador (Modo edição); não é sobrescrito pelo script
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

## Editar pelo navegador (Modo edição)
1. Clique em **✎ Editar** no topo.
2. Clique no **✎** ao lado de qualquer evento (na lista ou no balão do mapa) para alterar OM, dia,
   descrição, turno, PMS, localidade ou coordenadas (graus decimais ou GMS; "📍 Marcar no mapa" pega o ponto com um clique).
   Também é possível **excluir**, **restaurar o original da planilha** ou criar um **+ Novo evento**.
3. **Arraste** pontos no mapa para reposicioná-los; arrastar o círculo de uma localidade (ex.: Betione)
   corrige a posição dela para todos os eventos.
4. As alterações ficam salvas no navegador (localStorage) até serem exportadas.
   **⬇ Exportar edicoes.js** baixa o arquivo; substitua o `edicoes.js` da pasta/servidor para publicar a todos.
   **⬆ Importar** junta edições recebidas de outra pessoa; **⬇ CSV** gera planilha com tudo já editado.

As edições são guardadas pela chave *OM | dia | texto original*. Ao regenerar o `data.js` com uma
nova versão da planilha, elas continuam valendo; se o texto original mudou na planilha, a barra de
edição avisa quantas ficaram "sem correspondência".
