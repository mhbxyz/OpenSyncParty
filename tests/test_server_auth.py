import importlib.util
import json
import os
import pathlib
import time
import uuid

import jwt
from fastapi.testclient import TestClient


ROOT = pathlib.Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "session-server" / "app.py"


def load_app(env):
    for key in ["JWT_SECRET", "JWT_AUDIENCE", "JWT_ISSUER", "INVITE_TTL_SECONDS", "HOST_ROLES", "INVITE_ROLES"]:
        if key in os.environ:
            del os.environ[key]
    for key, value in env.items():
        os.environ[key] = value
    module_name = f"session_server_app_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, APP_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def encode_token(secret, claims):
    return jwt.encode(claims, secret, algorithm="HS256")


def ws_send(ws, payload):
    ws.send_text(json.dumps(payload))


def ws_recv(ws):
    return json.loads(ws.receive_text())


def test_create_room_requires_auth():
    module = load_app({"JWT_SECRET": "secret"})
    client = TestClient(module.app)

    with client.websocket_connect("/ws") as ws:
        ws_send(
            ws,
            {
                "type": "create_room",
                "room": "room-auth",
                "client": "host-1",
                "payload": {"media_url": "demo", "start_pos": 0, "name": "Host"},
                "ts": int(time.time() * 1000),
            },
        )
        msg = ws_recv(ws)
        assert msg["type"] == "error"
        assert msg["payload"]["code"] == "auth_required"


def test_create_room_requires_role():
    module = load_app({"JWT_SECRET": "secret", "HOST_ROLES": "admin"})
    client = TestClient(module.app)

    token = encode_token("secret", {"user_id": "u1", "username": "Host", "role": "user", "exp": int(time.time()) + 3600})

    with client.websocket_connect("/ws") as ws:
        ws_send(
            ws,
            {
                "type": "create_room",
                "room": "room-role",
                "client": "host-1",
                "payload": {"media_url": "demo", "start_pos": 0, "name": "Host", "auth_token": token},
                "ts": int(time.time() * 1000),
            },
        )
        msg = ws_recv(ws)
        assert msg["type"] == "error"
        assert msg["payload"]["code"] == "forbidden"


def test_create_room_with_role_ok():
    module = load_app({"JWT_SECRET": "secret", "HOST_ROLES": "admin"})
    client = TestClient(module.app)

    token = encode_token("secret", {"user_id": "u1", "username": "Host", "role": "admin", "exp": int(time.time()) + 3600})

    with client.websocket_connect("/ws") as ws:
        ws_send(
            ws,
            {
                "type": "create_room",
                "room": "room-ok",
                "client": "host-1",
                "payload": {"media_url": "demo", "start_pos": 0, "name": "Host", "auth_token": token},
                "ts": int(time.time() * 1000),
            },
        )
        msg = ws_recv(ws)
        assert msg["type"] == "room_state"
        assert msg["payload"]["room"] == "room-ok"


def test_invite_join_and_mismatch():
    module = load_app({"JWT_SECRET": "secret"})
    client = TestClient(module.app)

    token = encode_token("secret", {"user_id": "u1", "username": "Host", "exp": int(time.time()) + 3600})

    with client.websocket_connect("/ws") as ws:
        ws_send(
            ws,
            {
                "type": "create_room",
                "room": "room-a",
                "client": "host-1",
                "payload": {"media_url": "demo", "start_pos": 0, "name": "Host", "auth_token": token},
                "ts": int(time.time() * 1000),
            },
        )
        msg = ws_recv(ws)
        assert msg["type"] == "room_state"

        ws_send(
            ws,
            {
                "type": "create_invite",
                "room": "room-a",
                "client": "host-1",
                "payload": {"expires_in": 60, "auth_token": token},
                "ts": int(time.time() * 1000),
            },
        )
        invite_msg = ws_recv(ws)
        assert invite_msg["type"] == "invite_created"
        invite_token = invite_msg["payload"]["invite_token"]

        ws_send(
            ws,
            {
                "type": "create_room",
                "room": "room-b",
                "client": "host-1",
                "payload": {"media_url": "demo", "start_pos": 0, "name": "Host", "auth_token": token},
                "ts": int(time.time() * 1000),
            },
        )
        ws_recv(ws)

    with client.websocket_connect("/ws") as join_ws:
        ws_send(
            join_ws,
            {
                "type": "join_room",
                "room": "room-a",
                "client": "join-1",
                "payload": {"name": "Join", "invite_token": invite_token},
                "ts": int(time.time() * 1000),
            },
        )
        msg = ws_recv(join_ws)
        assert msg["type"] == "room_state"

    with client.websocket_connect("/ws") as join_ws:
        ws_send(
            join_ws,
            {
                "type": "join_room",
                "room": "room-b",
                "client": "join-2",
                "payload": {"name": "Join", "invite_token": invite_token},
                "ts": int(time.time() * 1000),
            },
        )
        msg = ws_recv(join_ws)
        assert msg["type"] == "error"
        assert msg["payload"]["code"] == "invite_room_mismatch"


def test_http_invite_endpoint():
    module = load_app({"JWT_SECRET": "secret", "INVITE_ROLES": "host"})
    client = TestClient(module.app)

    token = encode_token("secret", {"user_id": "u1", "username": "Host", "role": "host", "exp": int(time.time()) + 3600})

    with client.websocket_connect("/ws") as ws:
        ws_send(
            ws,
            {
                "type": "create_room",
                "room": "room-http",
                "client": "host-1",
                "payload": {"media_url": "demo", "start_pos": 0, "name": "Host", "auth_token": token},
                "ts": int(time.time() * 1000),
            },
        )
        ws_recv(ws)

    resp = client.post("/invite", json={"room": "room-http", "expires_in": 60}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "invite_token" in data
    assert "expires_at" in data

    resp = client.post("/invite", json={"room": "room-missing"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
