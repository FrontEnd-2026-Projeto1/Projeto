import { findCustomerById, listCustomers, verifyCustomerPassword } from "./customers.js";
import { readJSON, removeItem, writeJSON, STORAGE_KEYS } from "./storage.js";
import { createSalt, hashPassword, normalizeEmail } from "./utils.js";

const SESSION_DURATION = 30 * 60 * 1000;
const LOGIN_LOCK_DURATION = 60 * 1000;

function validSession(session) {
    return session
        && typeof session.userId === "string"
        && ["cliente", "administrador"].includes(session.perfil)
        && Number.isFinite(session.inicio)
        && Number.isFinite(session.expiraEm);
}

export async function seedAdministrator() {
    if (listCustomers().some((customer) => customer.perfil === "administrador")) {
        return;
    }

    const saltValue = createSalt();
    const passwordHash = await hashPassword("Admin123!", saltValue);
    const customers = listCustomers();

    if (customers.some((customer) => customer.perfil === "administrador")) {
        return;
    }

    customers.push({
        id: "A001",
        nome: "Administrador AdriExpress",
        email: "admin@adriexpress.com.br",
        telefone: "",
        cpf: "",
        salt: saltValue,
        passwordHash,
        perfil: "administrador",
        bloqueado: false,
        criadoEm: new Date().toISOString()
    });

    writeJSON(STORAGE_KEYS.customers, customers);
}

export function getLoginLock() {
    const lock = readJSON(STORAGE_KEYS.loginLock, { tentativas: 0, bloqueadoAte: 0 });

    if (!lock
        || typeof lock !== "object"
        || Array.isArray(lock)
        || !Number.isInteger(lock.tentativas)
        || !Number.isFinite(lock.bloqueadoAte)) {
        throw new Error("O estado de bloqueio do login está em formato inválido.");
    }

    if (lock.bloqueadoAte > 0 && lock.bloqueadoAte <= Date.now()) {
        removeItem(STORAGE_KEYS.loginLock);
        return { tentativas: 0, bloqueadoAte: 0 };
    }

    return lock;
}

function recordFailedAttempt(lock) {
    const attempts = lock.tentativas + 1;
    const updatedLock = attempts >= 3
        ? { tentativas: 3, bloqueadoAte: Date.now() + LOGIN_LOCK_DURATION }
        : { tentativas: attempts, bloqueadoAte: 0 };

    writeJSON(STORAGE_KEYS.loginLock, updatedLock);
    return updatedLock;
}

export async function login(emailInput, password) {
    let lock = getLoginLock();

    if (lock.bloqueadoAte > Date.now()) {
        return { ok: false, bloqueadoAte: lock.bloqueadoAte };
    }

    const email = normalizeEmail(emailInput);
    const customer = listCustomers().find((item) => item.email === email);
    let validCredentials = false;
    if (customer) {
        validCredentials = await verifyCustomerPassword(customer, password);
    } else {
        await hashPassword(password, "00000000000000000000000000000000");
    }

    lock = getLoginLock();
    if (lock.bloqueadoAte > Date.now()) {
        return { ok: false, bloqueadoAte: lock.bloqueadoAte };
    }

    if (!customer || !validCredentials || customer.bloqueado) {
        const updatedLock = recordFailedAttempt(lock);
        return {
            ok: false,
            bloqueadoAte: updatedLock.bloqueadoAte
        };
    }

    removeItem(STORAGE_KEYS.loginLock);
    const now = Date.now();
    const session = {
        userId: customer.id,
        perfil: customer.perfil,
        inicio: now,
        expiraEm: now + SESSION_DURATION
    };

    writeJSON(STORAGE_KEYS.session, session);
    return { ok: true, session };
}

export function getSessionState() {
    const session = readJSON(STORAGE_KEYS.session, null);

    if (session === null) {
        return { session: null, expired: false };
    }
    if (!validSession(session)) {
        throw new Error("A sessão salva está em formato inválido.");
    }
    if (session.expiraEm <= Date.now()) {
        logout();
        return { session: null, expired: true };
    }

    const customer = findCustomerById(session.userId);
    if (!customer || customer.perfil !== session.perfil || customer.bloqueado) {
        logout();
        return { session: null, expired: false };
    }

    return { session, expired: false };
}

export function renewSession() {
    const { session } = getSessionState();

    if (!session) {
        return null;
    }

    const renewed = { ...session, expiraEm: Date.now() + SESSION_DURATION };
    writeJSON(STORAGE_KEYS.session, renewed);
    return renewed;
}

export function logout() {
    removeItem(STORAGE_KEYS.session);
}

export function getSessionCustomer(session) {
    return session ? findCustomerById(session.userId) : null;
}
