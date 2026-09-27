<?php

// Cada peticio executa aquest fitxer de nou.
// La cookie conte un identificador que permet recuperar les dades
// de la sessio desades al servidor.
session_start();

require_once __DIR__ . '/../private/vendor/autoload.php';
$smtp_config = require __DIR__ . '/../private/smtp_config.php';

// valors per defecte
$template = 'home';
$db_connection = 'sqlite:' . dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'users.db';
$configuration = array(
    '{FEEDBACK}' => '',
    '{ACCOUNT_ACTIONS}' => '',
    '{REGISTER_ACTION}' => '<a class="home-action home-register" href="{REGISTER_URL}">
                <img class="home-cat" src="/images/register.png" alt="">
                <span>Registrarme</span>
            </a>',
    '{LOGIN_LOGOUT_TEXT}' => 'Identificar-me',
    '{LOGIN_LOGOUT_URL}' => '/?page=login',
    '{METHOD}' => 'POST',
    '{REGISTER_URL}' => '/?page=register',
    '{RESET_TOKEN}' => '',
    '{SITE_NAME}' => 'La meva pagina'
);

// Recuperar missatges temporals de la sessio.
if (isset($_SESSION['feedback'])) {
    $configuration['{FEEDBACK}'] = $_SESSION['feedback'];
    unset($_SESSION['feedback']);
}
if (isset($_SESSION['old_username'])) {
    $configuration['{REGISTER_USERNAME}'] = htmlentities($_SESSION['old_username']);
    unset($_SESSION['old_username']);
}

// processament de parametres
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

    if (trim($post_parameters['user_name'] ?? '') === '') {
        $_SESSION['feedback'] = '<mark>ERROR: Has d\'introduir un nom d\'usuari</mark>';
        $_SESSION['old_username'] = '';
        header('Location: /?page=register');
        exit();
    } else if (iconv_strlen(trim($post_parameters['user_name']), 'UTF-8') < 3) {
        $_SESSION['feedback'] = '<mark>ERROR: El nom d\'usuari ha de tenir com a minim 3 caracters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if (iconv_strlen($post_parameters['user_password'] ?? '', 'UTF-8') < 12) {
        $_SESSION['feedback'] = '<mark>ERROR: La contrasenya ha de tenir minim 12 caracters</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if (!filter_var($post_parameters['user_email'] ?? '', FILTER_VALIDATE_EMAIL)) {
        $_SESSION['feedback'] = '<mark>El correu electronic no es valid</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if (!$valid_birth_date) {
        $_SESSION['feedback'] = '<mark>Introdueix una data de naixement valida</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if ($birth_date > $today) {
        $_SESSION['feedback'] = '<mark>La data de naixement no pot ser futura</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else if ($birth_date->diff($today)->y < 16) {
        $_SESSION['feedback'] = '<mark>Has de tenir com a minim 16 anys</mark>';
        $_SESSION['old_username'] = $post_parameters['user_name'];
        header('Location: /?page=register');
        exit();
    } else {
        $db = new PDO($db_connection);

        $comprovarNomUsuari = $db->prepare('SELECT COUNT(*) FROM users WHERE user_name = :user_name');
        $comprovarNomUsuari->bindValue(':user_name', $post_parameters['user_name']);
        $comprovarNomUsuari->execute();

        if ($comprovarNomUsuari->fetchColumn() > 0) {
            $_SESSION['feedback'] = '<mark>ERROR: Aquest usuari ja existeix</mark>';
            $_SESSION['old_username'] = $post_parameters['user_name'];
            header('Location: /?page=register');
            exit();
        }

        $comprovarCorreu = $db->prepare('SELECT COUNT(*) FROM users WHERE user_email = :user_email');
        $comprovarCorreu->bindValue(':user_email', $post_parameters['user_email']);
        $comprovarCorreu->execute();

        if ($comprovarCorreu->fetchColumn() > 0) {
            $_SESSION['feedback'] = '<mark>ERROR: Aquest correu ja esta registrat</mark>';
            $_SESSION['old_username'] = $post_parameters['user_name'];
            header('Location: /?page=register');
            exit();
        }

        $password_hash = password_hash($post_parameters['user_password'], PASSWORD_DEFAULT);
        $sql = 'INSERT INTO users (user_name, user_email, birth_date, user_password)
                VALUES (:user_name, :user_email, :birth_date, :user_password)';
        $query = $db->prepare($sql);
        $query->bindValue(':user_name', $post_parameters['user_name']);
        $query->bindValue(':user_email', $post_parameters['user_email']);
        $query->bindValue(':birth_date', $birth_date_text);
        $query->bindValue(':user_password', $password_hash);

        if ($query->execute()) {
            session_regenerate_id(true);
            $_SESSION['user_name'] = $post_parameters['user_name'];
            $_SESSION['feedback'] = 'Compte creat. Sessio iniciada com <b>' . htmlentities($post_parameters['user_name']) . '</b>';
            header('Location: /');
            exit();
        } else {
            $_SESSION['feedback'] = '<mark>ERROR al crear el compte</mark>';
            header('Location: /?page=register');
            exit();
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
            $configuration['{FEEDBACK}'] = 'Sessio iniciada com <b>' . htmlentities($login_username) . '</b>';
            $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Tancar sessio';
            $configuration['{LOGIN_LOGOUT_URL}'] = '/?page=logout';
        } else {
            $configuration['{FEEDBACK}'] = '<mark>ERROR: Usuari desconegut o contrasenya incorrecta</mark>';
        }
    }
} else if (isset($post_parameters['forgot_password'])) {
    $user_email = trim($post_parameters['user_email'] ?? '');

    if (!filter_var($user_email, FILTER_VALIDATE_EMAIL)) {
        $template = 'forgot_pass';
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Escriu un correu electronic valid</mark>';
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
            $expires_at = time() + 900;

            $sql = 'INSERT INTO password_resets (user_id, token_hash, expires_at)
                    VALUES (:user_id, :token_hash, :expires_at)';
            $query = $db->prepare($sql);
            $query->bindValue(':user_id', $user->user_id);
            $query->bindValue(':token_hash', $token_hash);
            $query->bindValue(':expires_at', $expires_at);
            $query->execute();

            $reset_link = 'http://localhost:8000/?page=reset&token=' . urlencode($token);

            $subject = 'Recuperacio de contrasenya';
            $message = "Fes servir aquest enllac per crear una nova contrasenya:\n\n"
                . $reset_link
                . "\n\nAquest enllac caduca en 15 minuts.";

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
                error_log('Error enviant correu de recuperacio: ' . $mail->ErrorInfo);
            }
        }

        $template = 'forgot_pass';
        $configuration['{FEEDBACK}'] = 'Si el correu existeix, s\'ha enviat un enllac de recuperacio.';
    }
} else if (isset($post_parameters['reset_password'])) {
    $reset_token = $post_parameters['reset_token'] ?? '';
    $new_password = $post_parameters['new_password'] ?? '';
    $confirm_new_password = $post_parameters['confirm_new_password'] ?? '';

    if ($reset_token === '') {
        $template = 'forgot_pass';
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Enllac de recuperacio invalid</mark>';
    } else if ($new_password !== $confirm_new_password) {
        $template = 'reset_pass';
        $configuration['{RESET_TOKEN}'] = htmlentities($reset_token);
        $configuration['{FEEDBACK}'] = '<mark>ERROR: Les contrasenyes no coincideixen</mark>';
    } else if (iconv_strlen($new_password, 'UTF-8') < 12) {
        $template = 'reset_pass';
        $configuration['{RESET_TOKEN}'] = htmlentities($reset_token);
        $configuration['{FEEDBACK}'] = '<mark>ERROR: La nova contrasenya ha de tenir minim 12 caracters</mark>';
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

            $_SESSION['feedback'] = 'Contrasenya canviada correctament. Ja pots iniciar sessio.';
            header('Location: /?page=login');
            exit();
        } else {
            $template = 'forgot_pass';
            $configuration['{FEEDBACK}'] = '<mark>ERROR: Enllac incorrecte, caducat o ja utilitzat</mark>';
        }
    }
} else if (isset($post_parameters['change_password'])) {
    if (isset($_SESSION['user_name'])) {
        $current_password = $post_parameters['current_password'] ?? '';
        $new_password = $post_parameters['new_password'] ?? '';
        $confirm_new_password = $post_parameters['confirm_new_password'] ?? '';

        if ($current_password === '' || $new_password === '' || $confirm_new_password === '') {
            $_SESSION['feedback'] = '<mark>ERROR: Omple tots els camps de contrasenya</mark>';
            header('Location: /?page=edit');
            exit();
        } else if ($new_password !== $confirm_new_password) {
            $_SESSION['feedback'] = '<mark>ERROR: Les contrasenyes noves no coincideixen</mark>';
            header('Location: /?page=edit');
            exit();
        } else if (iconv_strlen($new_password, 'UTF-8') < 12) {
            $_SESSION['feedback'] = '<mark>ERROR: La nova contrasenya ha de tenir minim 12 caracters</mark>';
            header('Location: /?page=edit');
            exit();
        } else {
            $db = new PDO($db_connection);

            $sql = 'SELECT user_password FROM users WHERE user_name = :user_name';
            $query = $db->prepare($sql);
            $query->bindValue(':user_name', $_SESSION['user_name']);
            $query->execute();
            $userRow = $query->fetchObject();

            if (!$userRow || !password_verify($current_password, $userRow->user_password)) {
                $_SESSION['feedback'] = '<mark>ERROR: La contrasenya actual no es correcta</mark>';
                header('Location: /?page=edit');
                exit();
            }

            $password_hash = password_hash($new_password, PASSWORD_DEFAULT);
            $sql = 'UPDATE users SET user_password = :user_password WHERE user_name = :user_name';
            $query = $db->prepare($sql);
            $query->bindValue(':user_password', $password_hash);
            $query->bindValue(':user_name', $_SESSION['user_name']);

            if ($query->execute()) {
                $_SESSION['feedback'] = 'Contrasenya canviada correctament';
            } else {
                $_SESSION['feedback'] = '<mark>ERROR: No s\'ha pogut canviar la contrasenya</mark>';
            }
            header('Location: /?page=edit');
            exit();
        }
    } else {
        $_SESSION['feedback'] = 'Cal iniciar sessio per canviar la contrasenya';
        header('Location: /?page=login');
        exit();
    }
} else if (isset($post_parameters['delete'])) {
    if (isset($_SESSION['user_name'])) {
        $db = new PDO($db_connection);
        $sql = 'DELETE FROM users WHERE user_name = :user_name';
        $query = $db->prepare($sql);
        $query->bindValue(':user_name', $_SESSION['user_name']);
        $query->execute();
        if ($query->execute()) {
            $_SESSION = array();
            session_destroy();
            $configuration['{FEEDBACK}'] = 'El compte s\'ha eliminat correctament';
        } else {
            $configuration['{FEEDBACK}'] = '<mark>ERROR: No s\'ha pogut eliminar el compte</mark>';
        }
    } else {
        $configuration['{FEEDBACK}'] = 'Cal iniciar sessió per eliminar el compte';
    }
} else if (isset($post_parameters['edit'])) {
    if (isset($_SESSION['user_name'])) {
        $avatar = $_FILES['data_avatar'] ?? null;
        $avatar_path = null;

        if ($avatar !== null) {
            $allowed_mime_types = array('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml');
            $avatar_is_valid = in_array($avatar['type'], $allowed_mime_types, true);

            if (!$avatar_is_valid) {
                $configuration['{FEEDBACK}'] = '<mark>ERROR: L\'avatar ha de ser una imatge vàlida</mark>';
            } else {
                $filename = $avatar["name"];
                $tempname = $avatar["tmp_name"];
                $uploads_directory = __DIR__ . DIRECTORY_SEPARATOR . 'uploads';
                $folder = $uploads_directory . DIRECTORY_SEPARATOR . $filename;

                if (!is_dir($uploads_directory) && !mkdir($uploads_directory, 0755, true)) {
                    $configuration['{FEEDBACK}'] = '<mark>ERROR: No s\'ha pogut crear la carpeta d\'avatars</mark>';
                } else if (move_uploaded_file($tempname, $folder)) {
                    $avatar_path = '/uploads/' . $filename;
                } else {
                    $configuration['{FEEDBACK}'] = '<mark>ERROR: No s\'ha pogut desar l\'avatar</mark>';
                }
            }
        }

        // si no hi ha cap feedback es que tot ha anat be, fins ara
        if ($configuration['{FEEDBACK}'] === '') {
            $db = new PDO($db_connection);
            if ($avatar_path !== null) {
                $sql = 'UPDATE users SET nickname = :new_nickname, avatar = :avatar WHERE user_name = :user_name';
            } else {
                $sql = 'UPDATE users SET nickname = :new_nickname WHERE user_name = :user_name';
            }
            $query = $db->prepare($sql);
            $query->bindValue(':new_nickname', $post_parameters['data_nickname']);
            if ($avatar_path !== null) {
                $query->bindValue(':avatar', $avatar_path);
            }
            $query->bindValue(':user_name', $_SESSION['user_name']);
            if ($query->execute()) {
                $configuration['{FEEDBACK}'] = 'El perfil s\'ha actualitzat correctament';
            } else {
                $configuration['{FEEDBACK}'] = '<mark>ERROR: No s\'ha pogut actualitzar el perfil</mark>';
            }
        }
    } else {
        $configuration['{FEEDBACK}'] = 'Cal iniciar sessió per editar el perfil';
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
    } else if ($parameters['page'] == 'delete') {
        if (isset($_SESSION['user_name'])) {
            $template = 'delete';
        } else {
            $configuration['{FEEDBACK}'] = 'Cal iniciar sessió per eliminar el compte';
        }
    } else if ($parameters['page'] == 'edit') {
        if (isset($_SESSION['user_name'])) {
            $db = new PDO($db_connection);
            $sql = 'SELECT * FROM users WHERE user_name = :user_name';
            $query = $db->prepare($sql);
            $query->bindValue(':user_name', $_SESSION['user_name']);
            $query->execute();
            $result_row = $query->fetchObject();
            if ($result_row) {
                $template = 'edit';
                $configuration['{DATA_USERNAME}'] = $result_row->user_name;
                $configuration['{DATA_EMAIL}'] = $result_row->user_email;
                $configuration['{DATA_NICKNAME}'] = $result_row->nickname;
                $configuration['{DATA_AVATAR}'] = $result_row->avatar;
                $configuration['{DATA_BIRTHDATE}'] = $result_row->birth_date;
            } else {
                $configuration['{FEEDBACK}'] = "<mark>ERROR: No s'ha pogut obtenir les dades del perfil</mark>";
            }

        } else {
            $configuration['{FEEDBACK}'] = 'Cal iniciar sessió per editar el perfil';
        }
    }
}

// adaptem la pagina inicial a l'usuari identificat
if ($template == 'home' && isset($_SESSION['user_name'])) {
    $configuration['{LOGIN_LOGOUT_TEXT}'] = 'Tancar sessio';
    $configuration['{LOGIN_LOGOUT_URL}'] = '/?page=logout';
    $configuration['{REGISTER_ACTION}'] = '';
    $configuration['{ACCOUNT_ACTIONS}'] = <<<'HTML'
            <a class="home-action home-delete" href="/?page=delete">
                <img class="home-cat" src="/images/eliminar.png" alt="">
                <span>Eliminar compte</span>
            </a>
            <a class="home-action home-edit" href="/?page=edit">
                <img class="home-cat" src="/images/register.png" alt="">
                <span>Editar perfil</span>
            </a>
HTML;
    if ($configuration['{FEEDBACK}'] == '') {
        $configuration['{FEEDBACK}'] = 'Sessio iniciada com <b>' . htmlentities($_SESSION['user_name']) . '</b>';
    }
}

// processament amb la plantilla i generacio de la pagina
$template_path = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'plantilla_' . $template . '.html';
$html = file_get_contents($template_path, true);
$html = str_replace(array_keys($configuration), array_values($configuration), $html);
echo $html;
