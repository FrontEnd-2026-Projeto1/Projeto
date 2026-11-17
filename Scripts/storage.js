export const STORAGE_KEYS = Object.freeze({
    customers: "loja:clientes",
    counters: "loja:contadores",
    session: "loja:sessao",
    loginLock: "loja:login-bloqueio"
});

export function readJSON(key, fallback) {
    let raw;

    try {
        raw = localStorage.getItem(key);
    } catch (error) {
        throw new Error(`Não foi possível ler os dados locais (${key}).`, { cause: error });
    }

    if (raw === null) {
        return fallback;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(`Os dados locais (${key}) estão corrompidos.`, { cause: error });
    }
}

export function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        throw new Error(`Não foi possível salvar os dados locais (${key}).`, { cause: error });
    }
}

export function removeItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        throw new Error(`Não foi possível remover os dados locais (${key}).`, { cause: error });
    }
}
