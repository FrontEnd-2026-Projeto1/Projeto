export function normalizeEmail(email) {
    return email.trim().toLocaleLowerCase("pt-BR");
}

export function digitsOnly(value) {
    return value.replace(/\D/g, "");
}

export function formatCPF(value) {
    const digits = digitsOnly(value).slice(0, 11);

    return digits
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function isValidCPF(value) {
    const cpf = digitsOnly(value);

    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    const calculateDigit = (sliceLength) => {
        let total = 0;

        for (let index = 0; index < sliceLength; index += 1) {
            total += Number(cpf[index]) * (sliceLength + 1 - index);
        }

        const remainder = (total * 10) % 11;
        return remainder === 10 ? 0 : remainder;
    };

    return calculateDigit(9) === Number(cpf[9])
        && calculateDigit(10) === Number(cpf[10]);
}

export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function isValidName(name) {
    const parts = name.trim().split(/\s+/);
    return name.trim().length >= 3 && parts.length >= 2 && parts.every((part) => part.length > 0);
}

export function isValidPhone(phone) {
    return /^\d{10,11}$/.test(phone);
}

export function isValidPassword(password) {
    return password.length >= 8 && /[A-Za-zÀ-ÿ]/.test(password) && /\d/.test(password);
}

export function passwordStrength(password) {
    if (!password) {
        return { value: 0, label: "Não informada" };
    }

    let value = 0;
    if (password.length >= 8) value += 1;
    if (password.length >= 12) value += 1;
    if (/[A-Za-zÀ-ÿ]/.test(password) && /\d/.test(password)) value += 1;
    if (/[^A-Za-zÀ-ÿ\d]/.test(password)) value += 1;

    const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
    return { value, label: labels[value] };
}

export function createSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest("SHA-256", data);

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password, salt, expectedHash) {
    const actualHash = await hashPassword(password, salt);
    return actualHash === expectedHash;
}
