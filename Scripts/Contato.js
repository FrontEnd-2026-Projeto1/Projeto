fetch('../Templates/LogoPG.html')
    .then(response => response.text())
    .then(data => {
        document.getElementById('header-abas').innerHTML = data;

        const paginaAtual = window.location.pathname.split('/').pop().toLowerCase();        
        document.querySelectorAll('.aba-nav').forEach(el => el.classList.remove('active'));

        if (paginaAtual.includes('produtos')) {
            document.getElementById('tab-produtos').classList.add('active');
        } else if (paginaAtual.includes('compras')) {
            document.getElementById('tab-compras').classList.add('active');
        } else if (paginaAtual.includes('contato')) {
            document.getElementById('tab-contato').classList.add('active');
        } else {
            document.getElementById('tab-inicio').classList.add('active');
        }
    });