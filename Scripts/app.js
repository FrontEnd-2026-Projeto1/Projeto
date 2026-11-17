import {
    getLoginLock,
    getSessionCustomer,
    getSessionState,
    login,
    logout,
    renewSession,
    seedAdministrator
} from "./auth.js";
import {
    createCustomer,
    deleteCustomer,
    getCustomerValidationErrors,
    updateCustomer,
    verifyCustomerPassword
} from "./customers.js";
import {
    digitsOnly,
    formatCPF,
    isValidEmail,
    normalizeEmail,
    passwordStrength
} from "./utils.js";

const SESSION_PROTECTED_PAGES = new Set(["perfil.html", "relatorios.html"]);
let activeSession = null;
let handledExpiration = false;

function showNotice(message, type = "info") {
    let region = document.querySelector("#aviso-global");

    if (!region) {
        region = document.createElement("div");
        region.id = "aviso-global";
        region.className = "aviso-global";
        region.setAttribute("role", "status");
        region.setAttribute("aria-live", "polite");
        document.body.prepend(region);
    }

    region.textContent = message;
    region.dataset.tipo = type;
    region.hidden = false;
}

function reportOperationError(error, region) {
    console.error(error);
    if (region) {
        region.textContent = "Não foi possível concluir. Tente novamente.";
    } else {
        showNotice("Não foi possível abrir a página. Tente novamente.", "erro");
    }
}

function clearFieldErrors(form) {
    form.querySelectorAll("[data-error-for]").forEach((message) => {
        message.textContent = "";
    });
    form.querySelectorAll("[aria-invalid='true']").forEach((field) => {
        field.removeAttribute("aria-invalid");
    });
}

function renderFieldErrors(form, errors) {
    clearFieldErrors(form);

    Object.entries(errors).forEach(([name, message]) => {
        const field = form.elements.namedItem(name);
        const output = form.querySelector(`[data-error-for="${name}"]`);

        if (field && output && message) {
            field.setAttribute("aria-invalid", "true");
            output.textContent = message;
        }
    });
}

function focusFirstError(form, errors) {
    const firstField = Array.from(form.elements).find((field) => errors[field.name]);
    firstField?.focus();
}

function customerFormErrors(data, confirmation, excludeId = null, requirePassword = true) {
    const errors = getCustomerValidationErrors(data, excludeId, requirePassword);
    if ((requirePassword || data.senha || confirmation) && confirmation !== data.senha) {
        errors.confirmacao = "As senhas não correspondem.";
    }

    return errors;
}

function formCustomerData(form) {
    const values = new FormData(form);
    return {
        nome: String(values.get("nome") ?? ""),
        email: String(values.get("email") ?? ""),
        telefone: String(values.get("telefone") ?? ""),
        cpf: String(values.get("cpf") ?? ""),
        senha: String(values.get("senha") ?? "")
    };
}

function setupRegistrationForm() {
    const form = document.querySelector("#form-cadastro");
    if (!form) return;

    const strength = document.querySelector("#forca-senha");
    const feedback = document.querySelector("#cadastro-mensagem");
    const touched = new Set();
    let submitted = false;
    const refreshErrors = () => {
        const data = formCustomerData(form);
        const allErrors = customerFormErrors(data, form.elements.confirmacao.value);
        const visibleErrors = Object.fromEntries(
            Object.entries(allErrors).filter(([name]) => submitted || touched.has(name))
        );
        renderFieldErrors(form, visibleErrors);
        if (strength) {
            const result = passwordStrength(data.senha);
            strength.value = result.value;
            strength.textContent = result.label;
            strength.setAttribute("aria-label", `Força da senha: ${result.label}`);
        }
    };

    form.addEventListener("input", (event) => {
        touched.add(event.target.name);
        if (event.target.name === "senha" && event.target.value) {
            touched.add("senhaAtual");
        }
        if (event.target.name === "cpf") {
            event.target.value = formatCPF(event.target.value);
        }
        if (event.target.name === "telefone") {
            event.target.value = digitsOnly(event.target.value).slice(0, 11);
        }
        refreshErrors();
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitted = true;
        feedback.textContent = "";
        const data = formCustomerData(form);
        const errors = customerFormErrors(data, form.elements.confirmacao.value);
        renderFieldErrors(form, errors);

        if (Object.keys(errors).length) {
            focusFirstError(form, errors);
            return;
        }

        try {
            await createCustomer(data);
            window.location.href = "login.html?cadastro=sucesso";
        } catch (error) {
            if (error.message.includes("já está cadastrado")) {
                const field = error.message.includes("e-mail") ? "email" : "cpf";
                const fieldErrors = { [field]: error.message };
                renderFieldErrors(form, fieldErrors);
                focusFirstError(form, fieldErrors);
                return;
            }
            reportOperationError(error, feedback);
        }
    });
    refreshErrors();
}

function safeReturnTarget(profile) {
    const requested = new URLSearchParams(window.location.search).get("return");
    if (!requested) return "index.html";

    try {
        const target = new URL(requested, window.location.href);
        const appDirectory = new URL(".", window.location.href).pathname;
        if (target.origin !== window.location.origin || !target.pathname.startsWith(appDirectory)) {
            return "index.html";
        }
        if (target.pathname.endsWith("/relatorios.html") && profile !== "administrador") {
            return "index.html";
        }
        return `${target.pathname}${target.search}${target.hash}`;
    } catch {
        return "index.html";
    }
}

function setupLoginForm() {
    const form = document.querySelector("#form-login");
    if (!form) return;

    const feedback = document.querySelector("#login-mensagem");
    const submitButton = form.querySelector("button[type='submit']");
    let countdown;

    const updateLockMessage = () => {
        try {
            const lock = getLoginLock();
            const remaining = Math.max(0, Math.ceil((lock.bloqueadoAte - Date.now()) / 1000));

            if (remaining > 0) {
                const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
                const seconds = String(remaining % 60).padStart(2, "0");
                feedback.textContent = `Muitas tentativas. Aguarde ${minutes}:${seconds} para tentar de novo.`;
                feedback.dataset.tipo = "erro";
                submitButton.disabled = true;
            } else {
                if (feedback.textContent.startsWith("Muitas tentativas.")) {
                    feedback.textContent = "";
                }
                submitButton.disabled = false;
            }
        } catch (error) {
            reportOperationError(error, feedback);
            submitButton.disabled = true;
        }
    };

    const query = new URLSearchParams(window.location.search);
    const notices = {
        "sessao-expirada": "Sua sessão expirou. Entre novamente.",
        "acesso-negado": "Entre para acessar esta página."
    };
    if (query.get("cadastro") === "sucesso") {
        feedback.textContent = "Cadastro realizado. Entre com seu e-mail e senha.";
    } else if (notices[query.get("mensagem")]) {
        feedback.textContent = notices[query.get("mensagem")];
    }
    if (feedback.textContent) feedback.dataset.tipo = "info";

    form.addEventListener("input", () => {
        if (!submitButton.disabled) feedback.textContent = "";
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        feedback.textContent = "";

        const email = form.elements.email.value.trim();
        const password = form.elements.senha.value;
        if (!isValidEmail(email) || !password) {
            feedback.textContent = "E-mail ou senha inválidos.";
            feedback.dataset.tipo = "erro";
            form.elements[!isValidEmail(email) ? "email" : "senha"].focus();
            return;
        }

        submitButton.disabled = true;
        try {
            const result = await login(email, password);
            if (!result.ok) {
                feedback.textContent = "E-mail ou senha inválidos.";
                feedback.dataset.tipo = "erro";
                updateLockMessage();
                return;
            }

            window.location.href = safeReturnTarget(result.session.perfil);
        } catch (error) {
            reportOperationError(error, feedback);
        } finally {
            updateLockMessage();
        }
    });

    updateLockMessage();
    countdown = window.setInterval(updateLockMessage, 1000);
    window.addEventListener("pagehide", () => window.clearInterval(countdown), { once: true });
}

function setupProfileForm(session) {
    const form = document.querySelector("#form-perfil");
    if (!form) return;

    let customer = getSessionCustomer(session);
    if (!customer || customer.perfil !== "cliente") {
        window.location.replace("index.html");
        return;
    }

    form.elements.id.value = customer.id;
    form.elements.nome.value = customer.nome;
    form.elements.email.value = customer.email;
    form.elements.telefone.value = customer.telefone;
    form.elements.cpf.value = formatCPF(customer.cpf);

    const feedback = document.querySelector("#perfil-mensagem");
    const touched = new Set();
    let submitted = false;
    const refreshErrors = () => {
        const data = formCustomerData(form);
        const allErrors = customerFormErrors(
            data,
            form.elements.confirmacao.value,
            customer.id,
            false
        );
        if (data.senha && !form.elements.senhaAtual.value) {
            allErrors.senhaAtual = "Digite sua senha atual para trocar a senha.";
        }
        const errors = Object.fromEntries(
            Object.entries(allErrors).filter(([name]) => submitted || touched.has(name))
        );
        renderFieldErrors(form, errors);
    };

    form.addEventListener("input", (event) => {
        touched.add(event.target.name);
        if (event.target.name === "senha" && event.target.value) {
            touched.add("senhaAtual");
        }
        if (event.target.name === "cpf") {
            event.target.value = formatCPF(event.target.value);
        }
        if (event.target.name === "telefone") {
            event.target.value = digitsOnly(event.target.value).slice(0, 11);
        }
        refreshErrors();
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitted = true;
        feedback.textContent = "";
        const data = formCustomerData(form);
        const confirmation = form.elements.confirmacao.value;
        const errors = customerFormErrors(data, confirmation, customer.id, false);

        if (data.senha && !form.elements.senhaAtual.value) {
            errors.senhaAtual = "Digite sua senha atual para trocar a senha.";
        }
        renderFieldErrors(form, errors);

        if (Object.keys(errors).length) {
            focusFirstError(form, errors);
            return;
        }

        const changed = data.nome.trim().replace(/\s+/g, " ") !== customer.nome
            || normalizeEmail(data.email) !== customer.email
            || data.telefone !== customer.telefone
            || digitsOnly(data.cpf) !== customer.cpf
            || Boolean(data.senha);
        if (!changed) {
            feedback.textContent = "Você não fez nenhuma alteração.";
            return;
        }

        try {
            if (data.senha && !(await verifyCustomerPassword(customer, form.elements.senhaAtual.value))) {
                const passwordError = { senhaAtual: "A senha atual está incorreta." };
                renderFieldErrors(form, passwordError);
                focusFirstError(form, passwordError);
                return;
            }

            customer = await updateCustomer(customer.id, data);
            form.elements.senhaAtual.value = "";
            form.elements.senha.value = "";
            form.elements.confirmacao.value = "";
            feedback.textContent = "Dados atualizados.";
            updateNavigation(activeSession);
        } catch (error) {
            if (error.message.includes("já está cadastrado")) {
                const field = error.message.includes("e-mail") ? "email" : "cpf";
                const fieldErrors = { [field]: error.message };
                renderFieldErrors(form, fieldErrors);
                focusFirstError(form, fieldErrors);
                return;
            }
            reportOperationError(error, feedback);
        }
    });
    refreshErrors();

    const dialog = document.querySelector("#confirmar-exclusao");
    const openButton = document.querySelector("#abrir-exclusao");
    const cancelButton = document.querySelector("#cancelar-exclusao");
    const confirmButton = document.querySelector("#confirmar-exclusao-conta");
    openButton.addEventListener("click", () => dialog.showModal());
    cancelButton.addEventListener("click", () => dialog.close());
    confirmButton.addEventListener("click", () => {
        try {
            deleteCustomer(customer.id);
            logout();
            window.location.href = "index.html?conta=excluida";
        } catch (error) {
            dialog.close();
            reportOperationError(error, feedback);
        }
    });
}

function updateNavigation(session) {
    activeSession = session;
    const navigation = document.querySelector(".navegacao");
    if (!navigation) return;

    navigation.querySelectorAll(".auth-gerado").forEach((item) => item.remove());
    navigation.querySelectorAll("a").forEach((link) => {
        const file = link.getAttribute("href")?.split(/[?#]/)[0];
        if (["login.html", "cadastro.html", "perfil.html", "relatorios.html"].includes(file)) {
            link.remove();
        }
    });

    const customer = getSessionCustomer(session);
    const addLink = (label, href, className = "") => {
        const link = document.createElement("a");
        link.textContent = label;
        link.href = href;
        link.className = `auth-gerado ${className}`.trim();
        if (href === "perfil.html" && window.location.pathname.endsWith("/perfil.html")) {
            link.setAttribute("aria-current", "page");
        } else if (href === "cadastro.html" && window.location.pathname.endsWith("/cadastro.html")) {
            link.setAttribute("aria-current", "page");
        } else if (href === "login.html" && window.location.pathname.endsWith("/login.html")) {
            link.setAttribute("aria-current", "page");
        } else if (href === "relatorios.html" && window.location.pathname.endsWith("/relatorios.html")) {
            link.setAttribute("aria-current", "page");
        }
        navigation.append(link);
    };

    if (!session || !customer) {
        addLink("Entrar", "login.html");
        addLink("Cadastrar", "cadastro.html");
        return;
    }

    const greeting = document.createElement("span");
    greeting.className = "saudacao-menu auth-gerado";
    greeting.textContent = `Olá, ${customer.nome}`;
    navigation.append(greeting);

    if (session.perfil === "cliente") {
        addLink("Meu perfil", "perfil.html");
    } else {
        addLink("Relatórios", "relatorios.html");
    }

    const logoutButton = document.createElement("button");
    logoutButton.type = "button";
    logoutButton.className = "botao-sair auth-gerado";
    logoutButton.textContent = "Sair";
    logoutButton.addEventListener("click", () => {
        try {
            logout();
            updateNavigation(null);
            window.location.href = "index.html";
        } catch (error) {
            reportOperationError(error);
        }
    });
    navigation.append(logoutButton);
}

function requestedPage() {
    return window.location.pathname.split("/").pop();
}

function loginRedirect(message) {
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const params = new URLSearchParams({ return: returnPath, mensagem: message });
    window.location.replace(`login.html?${params.toString()}`);
}

function enforcePageAccess(session, expired = false) {
    const page = requestedPage();

    if (SESSION_PROTECTED_PAGES.has(page) && !session) {
        loginRedirect(expired ? "sessao-expirada" : "acesso-negado");
        return false;
    }
    if (page === "relatorios.html" && session?.perfil !== "administrador") {
        loginRedirect("acesso-negado");
        return false;
    }
    return true;
}

function handleSessionState(state) {
    updateNavigation(state.session);

    if (state.expired && !handledExpiration) {
        handledExpiration = true;
        if (SESSION_PROTECTED_PAGES.has(requestedPage())) {
            loginRedirect("sessao-expirada");
        } else {
            showNotice("Sua sessão expirou. Entre novamente.");
        }
    }
}

function setupSessionManagement() {
    const updateActivity = () => {
        try {
            const state = getSessionState();
            if (state.expired) {
                handleSessionState(state);
                enforcePageAccess(null, true);
                return;
            }
            const renewed = renewSession();
            if (renewed) {
                activeSession = renewed;
            }
        } catch (error) {
            reportOperationError(error);
        }
    };

    ["pointerdown", "keydown", "input", "change", "submit"].forEach((eventName) => {
        document.addEventListener(eventName, updateActivity, { passive: true, capture: true });
    });

    window.setInterval(() => {
        try {
            handleSessionState(getSessionState());
            enforcePageAccess(activeSession);
        } catch (error) {
            reportOperationError(error);
        }
    }, 5000);

    window.addEventListener("storage", (event) => {
        if ([null, "loja:sessao", "loja:clientes"].includes(event.key)) {
            try {
                const state = getSessionState();
                handleSessionState(state);
                enforcePageAccess(state.session);
            } catch (error) {
                reportOperationError(error);
            }
        }
    });
}

async function startApplication() {
    try {
        await seedAdministrator();
        const state = getSessionState();
        activeSession = state.session;
        updateNavigation(state.session);

        if (!enforcePageAccess(state.session, state.expired)) return;
        if (state.expired) showNotice("Sua sessão expirou. Entre novamente.");
        if (new URLSearchParams(window.location.search).get("conta") === "excluida") {
            showNotice("Conta excluída.");
        }

        setupRegistrationForm();
        setupLoginForm();
        setupProfileForm(state.session);
        setupSessionManagement();
    } catch (error) {
        reportOperationError(error);
    }
}

startApplication();
