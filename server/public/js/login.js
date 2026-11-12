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

    fetch("/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: username,
            password: password
        })
    }).then(res => {
        if (res.ok) {
            location.href = "/";
        } else {
            $feedback.textContent = res.status === 401
                ? "Nom d'usuari o contrasenya incorrectes."
                : "No s'ha pogut iniciar sessió. Torna-ho a provar.";
        }
    }).catch(err => {
        $feedback.textContent = "No s'ha pogut connectar amb el servidor. Torna-ho a provar.";
        console.log(err);
    });
}
