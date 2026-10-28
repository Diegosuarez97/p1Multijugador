function changePassword() {
    console.log("Changing password...");
}

function updateProfile() {
    const nickname = document.getElementById("data_nickname").value;
    const $avatar = document.getElementById("data_avatar");

    const data = new FormData();
    data.append("nickname", nickname);
    if ($avatar.files[0]) data.append("avatar", $avatar.files[0]);

    console.log(data)

    fetch("/api/profile", { method: "PUT", body: data }).then(res => res.json()).then(res => {
        console.log(res);
    }).catch(err => {
        console.log(err);
    });
}