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
    '{METHOD}'            => 'POST', //ja no es veuen al URL
    '{REGISTER_URL}'      => '/?page=register',
    '{SITE_NAME}'         => 'La meva pàgina'
);

// Recuperar missatges temporals de la sessió
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
    $birth_date_text = $post_parameters['birth_date'] ?? '';
    $birth_date = false;
    $valid_birth_date = false;
    if ($birth_date_text !== '') {
        $birth_date = DateTimeImmutable::createFromFormat('!Y-m-d', $birth_date_text);
        $valid_birth_date = $birth_date && $birth_date->format('Y-m-d') === $birth_date_text;
    }
    $today = new DateTimeImmutable('today');

    // revisa el nom d'usuari no estigui buit
    if (trim($post_parameters['user_name']) == '') {
        $_SESSION['feedback'] = '<mark>ERROR: Has d\'introduir un nom d\'usuari</mark>';
        $_SESSION['old_username'] = '';
        header('Location: /?page=register');
        exit();
    //  mínim 3 caràcters
    } else if (iconv_strlen(trim($post_parameters['user_name']), 'UTF-8') < 3) {
        $_SESSION['feedback'] = '<mark>ERROR: El nom d\'usuari ha de tenir com a mínim 3 caràcters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    // longitud mínima de contrasenya (12 caràcters)
    } else if (iconv_strlen($post_parameters['user_password'], 'UTF-8') < 12) {
        $_SESSION['feedback'] = '<mark>ERROR: La contrasenya ha de tenir mínim 12 caràcters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    }  else if (!filter_var($post_parameters['user_email'] ?? '', FILTER_VALIDATE_EMAIL)) {
          $_SESSION['feedback'] = '<mark>El correu electrònic no és vàlid</mark>';
          $_SESSION['old_username'] = $post_parameters['user_name'];
          header('Location: /?page=register');
          exit();
      // edat
      } else if (!$valid_birth_date) {
          $_SESSION['feedback'] = '<mark>Introdueix una data de naixement vàlida</mark>';
          $_SESSION['old_username'] = $post_parameters['user_name'];
          header('Location: /?page=register');
          exit();
          //comprovacio de edat
      } else if ($birth_date > $today) {
          $_SESSION['feedback'] = '<mark>La data de naixement no pot ser futura</mark>';
          $_SESSION['old_username'] = $post_parameters['user_name'];
          header('Location: /?page=register');
          exit();
      } else if ($birth_date->diff($today)->y < 16) {
          $_SESSION['feedback'] = '<mark>Has de tenir com a mínim 16 anys</mark>';
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
            // Comprova el correu al registrar-se; el formulari d'inici de sessió no l'envia.
            $comprovarCorreu = $db->prepare('SELECT COUNT(*) FROM users WHERE user_email = :user_email');
            $comprovarCorreu->bindValue(':user_email', $post_parameters['user_email']);
            $comprovarCorreu->execute();

            if ($comprovarCorreu->fetchColumn() > 0) {
                $_SESSION['feedback'] = '<mark>ERROR: Aquest correu ja està registrat</mark>';
                $_SESSION['old_username'] = $post_parameters['user_name'];
                header('Location: /?page=register');
                exit();
            }

            // Desa només el hash de la contrasenya.
            $password_hash = password_hash($post_parameters['user_password'], PASSWORD_DEFAULT);
            $sql = 'INSERT INTO users (user_name, user_email, birth_date, user_password)
                    VALUES (:user_name, :user_email, :birth_date, :user_password)';
            $query = $db->prepare($sql);
            $query->bindValue(':user_name', $post_parameters['user_name']);
            $query->bindValue(':user_password', $password_hash);
            $query->bindValue(':user_email', $post_parameters['user_email']);
            $query->bindValue(':birth_date', $birth_date_text);

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
    $template = 'login';
    $login_username = $post_parameters['user_name'] ?? '';
    $login_password = $post_parameters['user_password'] ?? '';
    $configuration['{LOGIN_USERNAME}'] = htmlentities($login_username);

    if (trim($login_username) === '' || $login_password === '') {
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Introdueix el nom d\'usuari i la contrasenya</mark>';
    } else {
        $db = new PDO($db_connection);

        $sql = 'SELECT * FROM users WHERE user_name = :user_name';
        $query = $db->prepare($sql);
        $query->bindValue(':user_name', $login_username);
        $query->execute();
        $userRow = $query->fetchObject();
        $passwordMatchs = false;

        if ($userRow) {
            $passwordMatchs = password_verify($login_password, $userRow->user_password);
        }
        if ($userRow && $passwordMatchs) {
            $template = 'home';
            session_regenerate_id(true);
            $_SESSION['user_name'] = $userRow->user_name;
            $configuration['{FEEDBACK}'] = 'Sessió iniciada com <b>' . htmlentities($login_username) . '</b>';
            $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Tancar sessió';
            $configuration['{LOGIN_LOGOUT_URL}'] = '/?page=logout';
        } else {
            $configuration['{FEEDBACK}'] = '<mark>ERROR: Usuari desconegut o contrasenya incorrecta</mark>';
        }
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
