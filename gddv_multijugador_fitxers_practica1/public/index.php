<?php

// Cada petició executa aquest fitxer de nou.
// La cookie conté un identificador que permet recuperar les dades
// de la sessió desades al servidor.
session_start();

require_once __DIR__ . '/../vendor/autoload.php';
$smtp_config = require __DIR__ . '/../private/smtp_config.php';

// valors per defecte
$template = 'home';
$db_connection = 'sqlite:..\private\users.db';
$configuration = array(
    '{FEEDBACK}' => '',
    '{LOGIN_LOGOUT_TEXT}' => 'Identificar-me',
    '{LOGIN_LOGOUT_URL}' => '/?page=login',
    '{METHOD}' => 'POST',
    '{REGISTER_URL}' => '/?page=register',
    '{RESET_TOKEN}' => '',
    '{SITE_NAME}' => 'La meva pàgina'
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
    $birth_date_text = $post_parameters['birth_date'] ?? '';
    $birth_date = false;
    $valid_birth_date = false;
    if ($birth_date_text !== '') {
        $birth_date = DateTimeImmutable::createFromFormat('!Y-m-d', $birth_date_text);
        $valid_birth_date = $birth_date && $birth_date->format('Y-m-d') === $birth_date_text;
    }
    $today = new DateTimeImmutable('today');

    if (trim($post_parameters['user_name']) == '') {
        $_SESSION['feedback'] = '<mark>ERROR: Has d\'introduir un nom d\'usuari</mark>';
        $_SESSION['old_username'] = '';
        header('Location: /?page=register');
        exit();
    } else if (iconv_strlen(trim($post_parameters['user_name']), 'UTF-8') < 3) {
        $_SESSION['feedback'] = '<mark>ERROR: El nom d\'usuari ha de tenir com a mínim 3 caràcters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if (iconv_strlen($post_parameters['user_password'], 'UTF-8') < 12) {
        $_SESSION['feedback'] = '<mark>ERROR: La contrasenya ha de tenir mínim 12 caràcters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if (!filter_var($post_parameters['user_email'] ?? '', FILTER_VALIDATE_EMAIL)) {
        $_SESSION['feedback'] = '<mark>El correu electrònic no és vàlid</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if (!$valid_birth_date) {
        $_SESSION['feedback'] = '<mark>Introdueix una data de naixement vàlida</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
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
            $password_hash = password_hash($post_parameters['user_password'], PASSWORD_DEFAULT);
            $sql = 'INSERT INTO users (user_name, user_email, birth_date, user_password)
                    VALUES (:user_name, :user_email, :birth_date, :user_password)';
            $query = $db->prepare($sql);
            $query->bindValue(':user_name', $post_parameters['user_name']);
            $query->bindValue(':user_password', $password_hash);
            $query->bindValue(':user_email', $post_parameters['user_email']);
            $query->bindValue(':birth_date', $birth_date_text);

            if ($query->execute()) {
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
            $passwordMatchs = hash_equals($userRow->user_password, $post_parameters['user_password']);
        }
    }

    if ($userRow && $passwordMatchs) {
        session_regenerate_id(true);
        $_SESSION['user_name'] = $userRow->user_name;

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
} else if (isset($post_parameters['forgot_password'])) {
    $user_email = trim($post_parameters['user_email'] ?? '');

    if (!filter_var($user_email, FILTER_VALIDATE_EMAIL)) {
        $template = 'forgot_pass';
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Escriu un correu electrònic vàlid</mark>';
    } else {
        $db = new PDO($db_connection);

        $sql = 'SELECT user_id, user_email FROM users WHERE user_email = :user_email';
        $query = $db->prepare($sql);
        $query->bindValue(':user_email', $user_email);
        $query->execute();
        $user = $query->fetchObject();

        if ($user) {
            $token = bin2hex(random_bytes(32));
            $token_hash = hash('sha256', $token);
            $expires_at = time() + 900; // 15 minuts

            $sql = 'INSERT INTO password_resets (user_id, token_hash, expires_at)
                    VALUES (:user_id, :token_hash, :expires_at)';
            $query = $db->prepare($sql);
            $query->bindValue(':user_id', $user->user_id);
            $query->bindValue(':token_hash', $token_hash);
            $query->bindValue(':expires_at', $expires_at);
            $query->execute();

            $reset_link = 'http://localhost:8000/?page=reset&token=' . urlencode($token);

            $subject = 'Recuperació de contrasenya';
            $message = "Fes servir aquest enllaç per crear una nova contrasenya:\n\n"
                . $reset_link
                . "\n\nAquest enllaç caduca en 15 minuts.";
            $headers = 'From: no-reply@lamevapagina.local';

            $mail = new PHPMailer\PHPMailer\PHPMailer(true);

            try {
                $mail->isSMTP();
                $mail->Host = $smtp_config['host'];
                $mail->SMTPAuth = true;
                $mail->Username = $smtp_config['username'];
                $mail->Password = $smtp_config['password'];
                $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
                $mail->Port = $smtp_config['port'];

                $mail->CharSet = 'UTF-8';
                $mail->setFrom($smtp_config['from_email'], $smtp_config['from_name']);
                $mail->addAddress($user->user_email);

                $mail->Subject = $subject;
                $mail->Body = $message;

                $mail->send();
            } catch (Exception $e) {
                error_log('Error enviant correu de recuperació: ' . $mail->ErrorInfo);
            }
        }

        $template = 'forgot_pass';
        $configuration['{FEEDBACK}'] = 'Si el correu existeix, s\'ha enviat un enllaç de recuperació.';
    }
} else if (isset($post_parameters['reset_password'])) {
    $reset_token = $post_parameters['reset_token'] ?? '';
    $new_password = $post_parameters['new_password'] ?? '';
    $confirm_new_password = $post_parameters['confirm_new_password'] ?? '';

    if ($reset_token === '') {
        $template = 'forgot_pass';
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Enllaç de recuperació invàlid</mark>';
    } else if ($new_password !== $confirm_new_password) {
        $template = 'reset_pass';
        $configuration['{RESET_TOKEN}'] = htmlentities($reset_token);
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Les contrasenyes no coincideixen</mark>';
    } else if (iconv_strlen($new_password, 'UTF-8') < 12) {
        $template = 'reset_pass';
        $configuration['{RESET_TOKEN}'] = htmlentities($reset_token);
        $configuration['{FEEDBACK}'] = '<mark>ERROR: La nova contrasenya ha de tenir mínim 12 caràcters</mark>';
    } else {
        $db = new PDO($db_connection);

        $token_hash = hash('sha256', $reset_token);

        $sql = 'SELECT reset_id, user_id
                FROM password_resets
                WHERE token_hash = :token_hash
                  AND used_at IS NULL
                  AND expires_at >= :now
                ORDER BY reset_id DESC
                LIMIT 1';
        $query = $db->prepare($sql);
        $query->bindValue(':token_hash', $token_hash);
        $query->bindValue(':now', time());
        $query->execute();
        $reset = $query->fetchObject();

        if ($reset) {
            $password_hash = password_hash($new_password, PASSWORD_DEFAULT);

            $sql = 'UPDATE users SET user_password = :user_password WHERE user_id = :user_id';
            $query = $db->prepare($sql);
            $query->bindValue(':user_password', $password_hash);
            $query->bindValue(':user_id', $reset->user_id);
            $query->execute();

            $sql = 'UPDATE password_resets SET used_at = :used_at WHERE reset_id = :reset_id';
            $query = $db->prepare($sql);
            $query->bindValue(':used_at', time());
            $query->bindValue(':reset_id', $reset->reset_id);
            $query->execute();

            $_SESSION['feedback'] = 'Contrasenya canviada correctament. Ja pots iniciar sessió.';
            header('Location: /?page=login');
            exit();
        } else {
            $template = 'forgot_pass';
            $configuration['{FEEDBACK}'] = '<mark>ERROR: Enllaç incorrecte, caducat o ja utilitzat</mark>';
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
    } else if ($parameters['page'] == 'forgot') {
        $template = 'forgot_pass';
    } else if ($parameters['page'] == 'reset') {
        $template = 'reset_pass';
        $configuration['{RESET_TOKEN}'] = htmlentities($parameters['token'] ?? '');
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
