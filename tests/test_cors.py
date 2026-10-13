"""CORS is off by default and allows only the configured origins (no model is loaded)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from mini_vllm.api.server import add_cors, cors_origins

PAGE = "https://shlokkvaishnav.github.io"


def make_app(origins: list[str]) -> TestClient:
    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    add_cors(app, origins)
    return TestClient(app)


def test_origins_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("MINI_VLLM_CORS_ORIGINS", f" {PAGE} , http://localhost:5173,")
    assert cors_origins() == [PAGE, "http://localhost:5173"]
    monkeypatch.delenv("MINI_VLLM_CORS_ORIGINS")
    assert cors_origins() == []


def test_no_cors_headers_by_default():
    res = make_app([]).get("/health", headers={"Origin": PAGE})
    assert "access-control-allow-origin" not in res.headers


def test_allowed_origin_passes_preflight():
    client = make_app([PAGE])
    pre = client.options("/health", headers={"Origin": PAGE, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert pre.status_code == 200
    assert pre.headers["access-control-allow-origin"] == PAGE
    assert client.get("/health", headers={"Origin": PAGE}).headers["access-control-allow-origin"] == PAGE


def test_other_origin_is_refused():
    pre = make_app([PAGE]).options("/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert pre.status_code == 400
    assert "access-control-allow-origin" not in pre.headers
