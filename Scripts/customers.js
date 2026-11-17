import { readJSON, writeJSON, STORAGE_KEYS } from "./storage.js";
import {
    createSalt,
    digitsOnly,
    hashPassword,
    isValidCPF,
    isValidEmail,
    isValidName,
    isValidPassword,
    isValidPhone,
    normalizeEmail,
    verifyPassword
} from "./utils.js";

function getCustomers() {
    const customers = readJSON(STORAGE_KEYS.customers, []);

    if (!Array.isArray(customers) || customers.some((customer) => (
        !customer
        || typeof customer !== "object"
        || typeof customer.id !== "string"
        || typeof customer.email !== "string"
        || typeof customer.perfil !== "string"
    ))) {
        throw new Error("A lista de clientes salva está em formato inválido.");
    }

    return customers;
}

export function listCustomers() {
    return getCustomers();
}

export function findCustomerById(id) {
    return getCustomers().find((customer) => customer.id === id) ?? null;
}

export function getCustomerValidationErrors(data, excludeId = null, requirePassword = true) {
    const customers = getCustomers();
    const email = normalizeEmail(data.email);
    const cpf = digitsOnly(data.cpf);
    const errors = {};

    if (!isValidName(data.nome)) {
        errors.nome = "Digite seu nome e sobrenome (ao menos 3 caracteres).";
    }
    if (!isValidEmail(email)) {
        errors.email = "Digite um e-mail válido.";
    } else if (customers.some((customer) => customer.id !== excludeId && customer.email === email)) {
        errors.email = "Este e-mail já está em uso.";
    }
    if (!isValidPhone(data.telefone)) {
        errors.telefone = "Digite o telefone com DDD, só números (10 ou 11 dígitos).";
    }
    if (!isValidCPF(cpf)) {
        errors.cpf = "Digite um CPF válido.";
    } else if (customers.some((customer) => customer.id !== excludeId && customer.cpf === cpf)) {
        errors.cpf = "Este CPF já está em uso.";
    }
    if ((requirePassword || data.senha) && !isValidPassword(data.senha)) {
        errors.senha = "Use pelo menos 8 caracteres, com letras e números.";
    }

    return errors;
}

export function validateCustomerData(data, excludeId = null, requirePassword = true) {
    const [field, message] = Object.entries(
        getCustomerValidationErrors(data, excludeId, requirePassword)
    )[0] ?? [];
    return field ? { field, message } : null;
}

function nextCustomerId(customers) {
    const counters = readJSON(STORAGE_KEYS.counters, {});
    if (!counters || typeof counters !== "object" || Array.isArray(counters)) {
        throw new Error("O contador de clientes salvo está em formato inválido.");
    }
    if (counters.proximoCliente !== undefined
        && (!Number.isSafeInteger(counters.proximoCliente) || counters.proximoCliente < 1)) {
        throw new Error("O próximo identificador de cliente está em formato inválido.");
    }

    const highestId = customers.reduce((highest, customer) => {
        const match = /^C(\d+)$/.exec(customer.id);
        return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    const next = Math.max(counters.proximoCliente ?? 1, highestId + 1);
    if (!Number.isSafeInteger(next) || next >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Não foi possível gerar um identificador sequencial válido.");
    }
    const updatedCounters = { ...counters, proximoCliente: next + 1 };

    writeJSON(STORAGE_KEYS.counters, updatedCounters);
    return `C${String(next).padStart(3, "0")}`;
}

export async function createCustomer(data) {
    const validationError = validateCustomerData(data);
    if (validationError) {
        throw new Error(validationError.message);
    }

    const salt = createSalt();
    const passwordHash = await hashPassword(data.senha, salt);
    const customers = getCustomers();
    const latestValidationError = validateCustomerData(data);
    if (latestValidationError) {
        throw new Error(latestValidationError.message);
    }

    const customer = {
        id: nextCustomerId(customers),
        nome: data.nome.trim().replace(/\s+/g, " "),
        email: normalizeEmail(data.email),
        telefone: data.telefone,
        cpf: digitsOnly(data.cpf),
        salt,
        passwordHash,
        perfil: "cliente",
        bloqueado: false,
        criadoEm: new Date().toISOString()
    };

    customers.push(customer);
    writeJSON(STORAGE_KEYS.customers, customers);
    return customer;
}

export async function updateCustomer(id, data) {
    if (!getCustomers().some((customer) => customer.id === id)) {
        throw new Error("O cliente da sessão não foi encontrado.");
    }

    const validationError = validateCustomerData(data, id, false);
    if (validationError) {
        throw new Error(validationError.message);
    }

    let credentials;
    if (data.senha) {
        const salt = createSalt();
        credentials = { salt, passwordHash: await hashPassword(data.senha, salt) };
    }

    const customers = getCustomers();
    const index = customers.findIndex((customer) => customer.id === id);
    if (index < 0) {
        throw new Error("O cliente da sessão não foi encontrado.");
    }
    const latestValidationError = validateCustomerData(data, id, false);
    if (latestValidationError) {
        throw new Error(latestValidationError.message);
    }

    const updated = {
        ...customers[index],
        nome: data.nome.trim().replace(/\s+/g, " "),
        email: normalizeEmail(data.email),
        telefone: data.telefone,
        cpf: digitsOnly(data.cpf)
    };

    if (credentials) {
        updated.salt = credentials.salt;
        updated.passwordHash = credentials.passwordHash;
    }

    customers[index] = updated;
    writeJSON(STORAGE_KEYS.customers, customers);
    return updated;
}

export function deleteCustomer(id) {
    const customers = getCustomers();
    const updated = customers.filter((customer) => customer.id !== id);

    if (updated.length === customers.length) {
        throw new Error("O cliente da sessão não foi encontrado.");
    }

    writeJSON(STORAGE_KEYS.customers, updated);
}

export async function verifyCustomerPassword(customer, password) {
    return verifyPassword(password, customer.salt, customer.passwordHash);
}
