function login() {
    const valid = (value) => value !== null && value !== undefined && value.trim() !== "";

    const username = document.getElementById("login_username").value;
    const password = document.getElementById("login_password").value;
    const $feedback = document.querySelector(".auth-feedback");
    $feedback.textContent = "";

    if (!valid(username) || !valid(password)) {
        $feedback.textContent = "Si us plau, ompliu tots els camps.";
        return;
    }

    axios.post("/api/login", { username: username, password: password }).then(({ data }) => {
        if (data.redirect) {
            location.href = data.redirect;
        } else {
            location.href = "/";
        }
    }).catch(err => {
        const data = err.response?.data;
        if (data?.redirect) {
            location.href = data.redirect;
        } else if (err.response?.status === 401) {
            $feedback.textContent = "Nom d'usuari o contrasenya incorrectes.";
        } else if (err.response) {
            $feedback.textContent = "No s'ha pogut iniciar sessió. Torna-ho a provar.";
        } else {
            $feedback.textContent = "No s'ha pogut connectar amb el servidor. Torna-ho a provar.";
        }
    });
}
