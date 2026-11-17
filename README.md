# AdriExpress

Projeto da disciplina de Front-end 1 do curso de ADS do IFSC. O site começou como uma interface em HTML e CSS e agora está recebendo as funções da Parte 2.

## Páginas do site

- `Abas/index.html`: destaque da loja, descrição, galeria com dez produtos e contato.
- `Abas/cadastro.html`: criação de conta.
- `Abas/login.html`: entrada na conta.
- `Abas/perfil.html`: edição e exclusão da conta.
- `Abas/loja.html`: catálogo com filtros visuais e dez produtos.
- `Abas/relatorios.html`: relatórios de clientes e compras, com versão para impressão.
- `Abas/Contato.html`: página de contato com informações e formulário.

## Integrantes

- Adriel Alves Ferreira De Souza.

## Pastas

- `Abas/`: páginas HTML.
- `CSS/`: estilos compartilhados e estilos das páginas.
- `Imgs/`: imagens do catálogo e da página inicial.
- `Scripts/`: funções de cadastro, acesso e armazenamento dos dados.

## Como abrir o site

Como o site usa módulos JavaScript, inicie um servidor na pasta do projeto:

```powershell
python -m http.server 8000
```

Abra `http://localhost:8000/Abas/index.html` no navegador. Não abra o arquivo HTML direto.

## Conta de administrador

Na primeira abertura, é criada esta conta:

- E-mail: `admin@adriexpress.com.br`
- Senha: `Admin123!`

Use-a apenas para testar o projeto. As contas ficam salvas no `localStorage` do navegador.

## Dados salvos no navegador

O arquivo `Scripts/storage.js` lê e grava os dados. Estas são as chaves usadas:

- `loja:clientes`: contas e senhas protegidas com SHA-256 e um valor aleatório por conta.
- `loja:contadores`: próximo número de cadastro.
- `loja:sessao`: conta conectada e tempo da sessão.
- `loja:login-bloqueio`: tentativas de acesso e tempo de espera.
