import { createHash } from "node:crypto";

// Shared by registration and password recovery. Passwords are never trimmed.
export async function validateNewPassword(password, { fetchImpl = fetch, logger = console } = {}) {
  if (typeof password !== "string" || [...password].length < 12) {
    return "La contraseña debe tener como mínimo 12 caracteres.";
  }
  try {
    // SHA-1 is only for the HIBP lookup; stored passwords still use Argon2id.
    const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("HIBP_UNAVAILABLE");
    const compromised = (await response.text()).split(/\r?\n/).some((line) => {
      const [suffix, count] = line.split(":");
      return suffix?.toUpperCase() === hash.slice(5) && Number(count) > 0;
    });
    if (compromised) return "Esta contraseña ya es conocida y no es segura. Prueba con una frase de varias palabras que puedas recordar.";
  } catch {
    // Preserve the original registration behavior during provider outages.
    logger.warn("Password policy: HIBP_UNAVAILABLE");
  }
  return null;
}
