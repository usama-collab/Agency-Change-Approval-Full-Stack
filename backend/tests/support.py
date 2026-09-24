import re

ORIGIN = "http://localhost:5173"


def token_from(inbox):
    return re.search(r"token=([^\s]+)", inbox[-1][2]).group(1)


def post(client, path, data, csrf):
    return client.post(path, json=data, headers={"Origin": ORIGIN, "X-CSRF-Token": csrf})


def pre_csrf(client):
    return client.get("/api/auth/csrf").json()["csrf_token"]


def create_owner(client, inbox, email):
    csrf = pre_csrf(client)
    response = post(
        client, "/api/auth/register", {"email": email, "password": "long-safe-password-123"}, csrf
    )
    assert response.status_code == 201, response.text
    verify_token = token_from(inbox)
    assert post(client, "/api/auth/verify", {"token": verify_token}, csrf).status_code == 200
    assert post(client, "/api/auth/verify", {"token": verify_token}, csrf).status_code == 400
    login = post(
        client, "/api/auth/login", {"email": email, "password": "long-safe-password-123"}, csrf
    )
    assert login.status_code == 200, login.text
    return login.json()["csrf_token"]
