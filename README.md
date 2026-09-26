# Leitor NFC-e (Python)

Web app local e mobile-first para inserir a URL de cupons NFC-e, consultar o cupom e exportar seus itens e valores em CSV. Esta é a versão em Python (Flask) do projeto original em Node.js.

## Requisitos

- Python 3.9 ou superior
- Conexão com a internet (a consulta é feita ao portal da NFC-e)

## Instalação

No PowerShell, dentro desta pasta:

```powershell
python -m pip install -r requirements.txt
```

## Executar

Para iniciar sem usar o terminal, dê duplo clique em `iniciar-servidor.bat` e mantenha a janela aberta. Em seguida, abra `http://localhost:8000` no Chrome.

Ou, no PowerShell, dentro desta pasta, execute:

```powershell
python server.py
```

Abra `http://localhost:8000` no computador. Não abra o `index.html` diretamente com `file:///`: a consulta dos itens precisa do servidor local. A própria página exibirá se o servidor está conectado antes de liberar o botão de consulta.

## Dados e exportação

Após inserir uma URL, o servidor local consulta a página pública da NFC-e e identifica os itens do cupom. As leituras ficam no armazenamento local do navegador. O botão **Baixar CSV** exporta uma linha por item, com `chave_acesso`, `url_cupom`, `data_leitura`, `descricao_item`, `quantidade`, `valor_unitario` e `valor_total`.

## Formato reconhecido

O aplicativo procura a chave no parâmetro `p` da URL por esta expressão:

```
/[?&]p=(\d{44})(?=\||&|$)/
```

Exemplo: `https://www.nfce.fazenda.sp.gov.br/qrcode?p=35260861233151003442650160000267191000330645|3|1`.

> A leitura por câmera está temporariamente suspensa para facilitar os testes locais. O app continua utilizável com a inserção manual da URL.

## Estrutura

```
server.py            # servidor Flask: arquivos estáticos e API (/api/health, /api/cupom)
scraper.py           # extração dos itens do HTML da NFC-e (BeautifulSoup)
requirements.txt     # dependências Python
iniciar-servidor.bat # atalho para iniciar o servidor no Windows
static/              # frontend (index.html, app.js, styles.css)
```
