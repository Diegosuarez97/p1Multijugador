export function initPasswordRecovery({ api, show, showLogin }) {
  const $ = (id) => document.getElementById(id);
  const forgotForm = $("forgot-password-form");
  const resetForm = $("reset-password-form");
  const message = $("recovery-message");
  let resetToken = "";

  function open(kind) {
    forgotForm.hidden = kind !== "forgot";
    resetForm.hidden = kind !== "reset";
    message.textContent = "";
    show("recovery");
    $(kind === "forgot" ? "recovery-email" : "recovery-password").focus();
  }

  function readLink() {
    if (location.hash === "#forgot-password") {
      resetToken = "";
      history.replaceState(null, "", location.pathname + location.search);
      open("forgot");
    } else if (location.hash.startsWith("#reset-password=")) {
      resetToken = location.hash.slice("#reset-password=".length);
      // Keep the token only in memory, not in history or persistent storage.
      history.replaceState(null, "", location.pathname + location.search);
      resetForm.reset();
      open("reset");
      if (!/^[a-f0-9]{64}$/.test(resetToken)) {
        resetToken = "";
        resetForm.hidden = true;
        message.textContent = "El enlace no es válido. Solicita uno nuevo.";
      }
    }
  }

  $("forgot-password-link").onclick = () => { resetToken = ""; open("forgot"); };
  $("request-another-reset").onclick = () => { resetToken = ""; open("forgot"); };
  $("recovery-back").onclick = () => {
    resetToken = "";
    forgotForm.reset();
    resetForm.reset();
    showLogin();
    show("menu");
    $("user").focus();
  };

  async function submit(form, endpoint, payload, success) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = "Enviando…";
    try {
      const response = await fetch(`${api}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      message.textContent = response.ok ? data.message : data.error || "No se ha podido completar la solicitud.";
      if (response.ok) success?.();
    } catch {
      message.textContent = "No se ha podido conectar con el servidor. Inténtalo más tarde.";
    } finally {
      button.disabled = false;
    }
  }

  forgotForm.onsubmit = (event) => {
    event.preventDefault();
    void submit(forgotForm, "forgot-password", { email: $("recovery-email").value.trim() });
  };
  resetForm.onsubmit = (event) => {
    event.preventDefault();
    const password = $("recovery-password").value;
    const confirmPassword = $("recovery-confirm").value;
    if (password !== confirmPassword) {
      message.textContent = "Las contraseñas no coinciden.";
      $("recovery-confirm").focus();
      return;
    }
    void submit(resetForm, "reset-password", { token: resetToken, password, confirmPassword }, () => {
      resetToken = "";
      resetForm.reset();
      resetForm.hidden = true;
    });
  };

  window.addEventListener("hashchange", readLink);
  readLink();
}
