<?php

// Cada petició executa aquest fitxer de nou.
// La cookie conté un identificador que permet recuperar les dades
// de la sessió desades al servidor.
session_start();

// valors per defecte
$template = 'home';
$db_connection = 'sqlite:' . dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'users.db';
$configuration = array(
    '{FEEDBACK}'          => '',
    '{LOGIN_LOGOUT_TEXT}' => 'Identificar-me',
    '{LOGIN_LOGOUT_URL}'  => '/?page=login',
    '{METHOD}'            => 'GET', // es veuen els paràmetres a l'URL i a la consola (???)
    '{REGISTER_URL}'      => '/?page=register',
    '{DELETE_ACCOUNT_URL}'=> '/?page=delete',
    '{SITE_NAME}'         => 'La meva pàgina'
);
// processament de paràmetres
$parameters = $_GET;
if (isset($parameters['page'])) {
    if ($parameters['page'] == 'register') {
        $template = 'register';
        $configuration['{REGISTER_USERNAME}'] = '';
        $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Ja tinc un compte';
    } else if ($parameters['page'] == 'login') {
        $template = 'login';
        $configuration['{LOGIN_USERNAME}'] = '';
    } else if ($parameters['page'] == 'logout') {
        $_SESSION = array(); // oblida les dades carregades en aquesta petició
        session_destroy();  // elimina la sessió desada al servidor
    } else if ($parameters['page'] == 'delete') {
        if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['delete'])) {
            if (isset($_SESSION['user_name'])) {
                $db = new PDO($db_connection);
                $sql = 'DELETE FROM users WHERE user_name = :user_name';
                $query = $db->prepare($sql);
                $query->bindValue(':user_name', $_SESSION['user_name']);
                $query->execute();

                $_SESSION = array();
                session_destroy();
                $configuration['{FEEDBACK}'] = 'El compte s\'ha eliminat correctament';
            }
            $template = 'home';
        } else if (isset($_SESSION['user_name'])) {
            $template = $parameters['page'];
            $configuration['{METHOD}'] = 'POST';
        } else {
            $configuration['{FEEDBACK}'] = 'Cal iniciar sessió per eliminar el compte';
        }
    }
} else if (isset($parameters['register'])) {
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
} else if (isset($parameters['login'])) {
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
$template_path = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR
    . 'plantilla_' . $template . '.html';
$html = file_get_contents($template_path, true);
$html = str_replace(array_keys($configuration), array_values($configuration), $html);
echo $html;
