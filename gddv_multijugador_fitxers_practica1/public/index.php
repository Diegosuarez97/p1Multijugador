<?php

// Cada petició executa aquest fitxer de nou.
// La cookie conté un identificador que permet recuperar les dades
// de la sessió desades al servidor.
session_start();

// valors per defecte
$template = 'home';
$db_connection = 'sqlite:..\private\users.db';
$configuration = array(
    '{FEEDBACK}'          => '',
    '{LOGIN_LOGOUT_TEXT}' => 'Identificar-me',
    '{LOGIN_LOGOUT_URL}'  => '/?page=login',
    '{METHOD}'            => 'GET', // es veuen els paràmetres a l'URL i a la consola (???)
    '{REGISTER_URL}'      => '/?page=register',
    '{SITE_NAME}'         => 'La meva pàgina'
);
// processament de paràmetres
$parameters = $_GET;
$post_parameters = $_POST;
if (isset($parameters['page'])) {
    if ($parameters['page'] == 'register') {
        $template = 'register';
        $configuration['{REGISTER_USERNAME}'] = '';
        $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Ja tinc un compte';
    } else if ($parameters['page'] == 'login') {
        $template = 'login';
        $configuration['{LOGIN_USERNAME}'] = '';
    } else if ($parameters['page'] == 'forgot') { //Canvi a la plantilla recuperar contrasenya
            $template = 'forgot_pass';
    } else if ($parameters['page'] == 'logout') {
        $_SESSION = array(); // oblida les dades carregades en aquesta petició
        session_destroy();  // elimina la sessió desada al servidor
    }
}

else if (isset($_POST['forgot_password'])) {
    $user_name = trim($_POST['user_name'] ?? '');

    if ($user_name === '') {
        $template = 'forgot';
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Escriu el nom d\'usuari</mark>';
    } else {
        $db = new PDO($db_connection);

        $sql = 'SELECT user_id FROM users WHERE user_name = :user_name';
        $query = $db->prepare($sql);
        $query->bindValue(':user_name', $user_name);
        $query->execute();
        $user = $query->fetchObject();

        if ($user) {
            $token = bin2hex(random_bytes(32));
            $token_hash = hash('sha256', $token);
            $expires_at = time() + 3600;

            $sql = 'INSERT INTO password_resets (user_id, token_hash, expires_at)
                    VALUES (:user_id, :token_hash, :expires_at)';
            $query = $db->prepare($sql);
            $query->bindValue(':user_id', $user->user_id);
            $query->bindValue(':token_hash', $token_hash);
            $query->bindValue(':expires_at', $expires_at);
            $query->execute();

            $reset_link = '/?page=reset&token=' . urlencode($token);

            $configuration['{FEEDBACK}'] =
                'Enllaç de recuperació: <a href="' . htmlentities($reset_link) . '">Canviar contrasenya</a>';
        } else {
            $configuration['{FEEDBACK}'] =
                'Si l\'usuari existeix, s\'ha generat un enllaç de recuperació.';
        }
    }
}

else if (isset($parameters['register'])) {
    $db = new PDO($db_connection);
    $sql = 'INSERT INTO users (user_name, user_password) VALUES (:user_name, :user_password)';
    $query = $db->prepare($sql);
    $query->bindValue(':user_name', $parameters['user_name']);
    $query->bindValue(':user_password', $parameters['user_password']);
    if ($query->execute()) {
        $configuration['{FEEDBACK}'] = 'Creat el compte <b>' . htmlentities($parameters['user_name']) . '</b>';
        $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Tancar sessió';
    } else {
        // això no s'executarà mai (???)
        $configuration['{FEEDBACK}'] = "<mark>ERROR: No s'ha pogut crear el compte <b>"
            . htmlentities($parameters['user_name']) . '</b></mark>';
    }
}

else if (isset($parameters['login'])) {
    $db = new PDO($db_connection);
    $sql = 'SELECT * FROM users WHERE user_name = :user_name and user_password = :user_password';
    $query = $db->prepare($sql);
    $query->bindValue(':user_name', $parameters['user_name']);
    $query->bindValue(':user_password', $parameters['user_password']);
    $query->execute();
    $result_row = $query->fetchObject();
    if ($result_row) {
        // nou identificador de sessió per no reutilitzar el que tenia abans del login
        session_regenerate_id(true);
        $_SESSION['user_name'] = $result_row->user_name;
        $configuration['{FEEDBACK}'] = 'Sessió iniciada com <b>' . htmlentities($parameters['user_name']) . '</b>';
        $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Tancar sessió';
        $configuration['{LOGIN_LOGOUT_URL}'] = '/?page=logout';
    } else {
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Usuari desconegut o contrasenya incorrecta</mark>';
    }
}
// adaptem la pàgina inicial a l'usuari identificat
if ($template == 'home' && isset($_SESSION['user_name'])) {
    $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Tancar sessió';
    $configuration['{LOGIN_LOGOUT_URL}'] = '/?page=logout';
    if ($configuration['{FEEDBACK}'] == '') {
        $configuration['{FEEDBACK}'] = 'Sessió iniciada com <b>' . htmlentities($_SESSION['user_name']) . '</b>';
    }
}
// processament amb la plantilla i generació de la pàgina
$html = file_get_contents('plantilla_' . $template . '.html', true);
$html = str_replace(array_keys($configuration), array_values($configuration), $html);
echo $html;
