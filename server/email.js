// Backend only: never expose these settings through Vite or /config.js.
export async function sendRecoveryEmail({ recipientEmail, resetUrl }) {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } = process.env;
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !BREVO_SENDER_NAME) {
    throw new Error("BREVO_NOT_CONFIGURED");
  }

  let response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
        to: [{ email: recipientEmail }],
        subject: "Recupera tu contraseña — El torneo de los magos",
        textContent: `Para cambiar tu contraseña, abre este enlace:\n${resetUrl}\n\n` +
          "El enlace caduca en 30 minutos y solo se puede usar una vez. " +
          "Si no lo has solicitado, ignora este mensaje.",
      }),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error("BREVO_TIMEOUT");
    const code = error?.cause?.code;
    const known = ["EACCES", "EPERM", "ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"];
    throw new Error(known.includes(code) ? `BREVO_NETWORK_${code}` : "BREVO_NETWORK_ERROR");
  }

  // Do not include provider response bodies, recipients or request data in errors.
  if (!response.ok) throw new Error(`BREVO_HTTP_${response.status}`);
}
