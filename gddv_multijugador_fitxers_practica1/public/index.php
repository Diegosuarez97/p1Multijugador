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
    '{METHOD}'            => 'POST',
    '{REGISTER_URL}'      => '/?page=register',
    '{SITE_NAME}'         => 'La meva pàgina'
);

// Recuperar missatges temporals de la sessió (després d'una redirecció PRG)
if (isset($_SESSION['feedback'])) {
    $configuration['{FEEDBACK}'] = $_SESSION['feedback'];
    unset($_SESSION['feedback']);
}
if (isset($_SESSION['old_username'])) {
    $configuration['{REGISTER_USERNAME}'] = htmlentities($_SESSION['old_username']);
    unset($_SESSION['old_username']);
}

// processament de paràmetres
$parameters = $_GET;
$post_parameters = $_POST;

if (isset($post_parameters['register'])) {
    // 0. Validar que el nom d'usuari no estigui buit
    if (trim($post_parameters['user_name']) == '') {
        $_SESSION['feedback'] = '<mark>ERROR: Has d\'introduir un nom d\'usuari</mark>';
        $_SESSION['old_username'] = '';
        header('Location: /?page=register');
        exit();
    // 1. Validar que el nom d'usuari tingui com a mínim 3 caràcters
    } else if (iconv_strlen(trim($post_parameters['user_name']), 'UTF-8') < 3) {
        $_SESSION['feedback'] = '<mark>ERROR: El nom d\'usuari ha de tenir com a mínim 3 caràcters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    // 2. Validar longitud mínima de contrasenya (12 caràcters)
    } else if (iconv_strlen($post_parameters['user_password'], 'UTF-8') < 12) {
        $_SESSION['feedback'] = '<mark>ERROR: La contrasenya ha de tenir mínim 12 caràcters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else {
        $db = new PDO($db_connection);

        // 3. Comprobar si l'usuari ja existeix
        $sql_check = 'SELECT COUNT(*) FROM users WHERE user_name = :user_name';
        $comprovarNomUsuari = $db->prepare($sql_check);
        $comprovarNomUsuari->bindValue(':user_name', $post_parameters['user_name']);
        $comprovarNomUsuari->execute();

        if ($comprovarNomUsuari->fetchColumn() > 0) {
            $_SESSION['feedback'] = '<mark>ERROR: Aquest usuari ja existeix</mark>';
            $_SESSION['old_username'] = $post_parameters['user_name'];
            header('Location: /?page=register');
            exit();
        } else {
            // 4. Desa només el hash de la contrasenya.
            $password_hash = password_hash($post_parameters['user_password'], PASSWORD_DEFAULT);
            $sql = 'INSERT INTO users (user_name, user_password) VALUES (:user_name, :user_password)';
            $query = $db->prepare($sql);
            $query->bindValue(':user_name', $post_parameters['user_name']);
            $query->bindValue(':user_password', $password_hash);

            if ($query->execute()) {
                // Inicia la sessió del compte nou i regenera l'identificador.
                session_regenerate_id(true);
                $_SESSION['user_name'] = $post_parameters['user_name'];
                $_SESSION['feedback'] = 'Compte creat. Sessió iniciada com <b>' . htmlentities($post_parameters['user_name']) . '</b>';
                header('Location: /');
                exit();
            } else {
                $_SESSION['feedback'] = '<mark>ERROR al crear el compte</mark>';
                header('Location: /?page=register');
                exit();
            }
        }
    }
} else if (isset($post_parameters['login'])) {
    $db = new PDO($db_connection);
    $sql = 'SELECT * FROM users WHERE user_name = :user_name';
    $query = $db->prepare($sql);
    $query->bindValue(':user_name', $post_parameters['user_name']);
    $query->execute();
    $userRow = $query->fetchObject();
    $passwordMatchs = false;
    if ($userRow) {
        $storedPassword = password_get_info($userRow->user_password);
        if ($storedPassword['algo'] !== null && $storedPassword['algo'] !== 0) {
            $passwordMatchs = password_verify($post_parameters['user_password'], $userRow->user_password);
        } else {
            // Compatibilitat temporal amb comptes creats abans d'emmagatzemar hashes.
            $passwordMatchs = hash_equals($userRow->user_password, $post_parameters['user_password']);
        }
    }
    if ($userRow && $passwordMatchs) {
        session_regenerate_id(true);
        $_SESSION['user_name'] = $userRow->user_name;
        // Migra contrasenyes antigues i actualitza hashes si canvien les opcions de PHP.
        if ($storedPassword['algo'] === null || $storedPassword['algo'] === 0 || password_needs_rehash($userRow->user_password, PASSWORD_DEFAULT)) {
            $update = $db->prepare('UPDATE users SET user_password = :user_password WHERE user_id = :user_id');
            $update->bindValue(':user_password', password_hash($post_parameters['user_password'], PASSWORD_DEFAULT));
            $update->bindValue(':user_id', $userRow->user_id);
            $update->execute();
        }
        $configuration['{FEEDBACK}'] = 'Sessió iniciada com <b>' . htmlentities($post_parameters['user_name']) . '</b>';
        $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Tancar sessió';
        $configuration['{LOGIN_LOGOUT_URL}'] = '/?page=logout';
    } else {
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Usuari desconegut o contrasenya incorrecta</mark>';
    }
} else if (isset($parameters['page'])) {
    if ($parameters['page'] == 'register') {
        $template = 'register';
        if (!isset($configuration['{REGISTER_USERNAME}'])) {
            $configuration['{REGISTER_USERNAME}'] = '';
        }
        $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Ja tinc un compte';
    } else if ($parameters['page'] == 'login') {
        $template = 'login';
        $configuration['{LOGIN_USERNAME}'] = '';
    } else if ($parameters['page'] == 'logout') {
        $_SESSION = array();
        session_destroy();
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
