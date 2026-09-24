// Afegeix aquí el teu codi JavaScript
// Afegeix aquí el teu codi JavaScript

async function calcularSha1Hexadecimal(msg) {
    const enc = new TextEncoder();
    const data = enc.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const bytes = new Uint8Array(hashBuffer);
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex.toUpperCase();
}

async function passwordEstaFiltrada(password) {
    const hash = await calcularSha1Hexadecimal(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!resp.ok) {
        throw new Error(`Error HTTP ${resp.status}`);
    }
    const txt = await resp.text();

    const lines = txt.trim().split(/\r?\n/);
    for (const line of lines) {
        const [suff] = line.split(':');
        if (suff && suff.toUpperCase() === suffix) {
            return true;
        }
    }
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('input[name="register"]')?.closest('form');
    if (!form) return;

    const minimumPasswordLength = 12;
    const passwordInput = form.querySelector('input[name="user_password"]');
    const passwordCount = document.getElementById('password-count');
    const passwordProgress = document.getElementById('password-progress');

    function updatePasswordLength() {
        const characterCount = [...passwordInput.value].length;
        passwordCount.textContent = `${characterCount} caràcters (mínim ${minimumPasswordLength})`;
        passwordProgress.value = Math.min(characterCount, minimumPasswordLength);
    }

    passwordInput.addEventListener('input', updatePasswordLength);
    updatePasswordLength();

    form.addEventListener('submit', async (event) => {
        const password = passwordInput.value;

        event.preventDefault();

        if ([...password].length < minimumPasswordLength) {
            alert('La contrasenya ha de tenir com a mínim 12 caràcters');
            return;
        }
        try {
            const filtrada = await passwordEstaFiltrada(password);
            if (filtrada) {
                alert('Aquesta contrasenya ha aparegut en filtracions de dades. Tria\'n una altra.');
                return;
            }
        } catch (err) {
            console.warn('No se ha podido comprobar la contraseña con HIBP:', err);
        }

        // CREEM UN INPUT AMAGAT PERQUÈ PHP DETECTI EL CLIC DE "REGISTER"
        const inputHidden = document.createElement('input');
        inputHidden.type = 'hidden';
        inputHidden.name = 'register';
        inputHidden.value = '1';
        form.appendChild(inputHidden);

        form.submit();
    });
});
