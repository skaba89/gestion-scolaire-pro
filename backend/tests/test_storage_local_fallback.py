"""LocalStorageClient.get_presigned_url() — BUG RÉEL signalé par un
utilisateur avec capture d'écran à l'appui : un lien "Voir" sur un
document d'admission renvoyait 404 sur "Oups ! Page non trouvée" (la
page 404 de React Router), pas une erreur serveur.

Cause : quand ni BACKEND_URL ni MINIO_EXTERNAL_HOSTNAME ne sont
configurés (cas réel de cette instance — MinIO/R2 non configuré, voir
"MinIO storage disabled — using local file storage fallback" dans les
logs), get_presigned_url() renvoyait un chemin relatif "/uploads/...".
Le navigateur le résout contre l'origine COURANTE (le frontend), pas le
backend. server.mjs (le serveur de prod, voir server.mjs::serveStatic)
ne proxifie vers le backend que /api/* et /api-proxy/* — un simple
/uploads/... tombe dans le fallback SPA et sert index.html au lieu du
fichier, alors que le backend monte pourtant bien /uploads (voir
app.mount("/uploads", ...) dans main.py) — jamais atteint dans ce cas.

Ce module n'avait aucun test avant cette suite."""
import pytest

from app.core.storage import LocalStorageClient


@pytest.fixture
def local_client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
    return LocalStorageClient()


class TestGetPresignedUrlFallbackChain:
    def test_uses_backend_url_when_configured(self, local_client, monkeypatch):
        monkeypatch.setattr("app.core.storage.settings.BACKEND_URL", "https://schoolflow-api.onrender.com")
        url = local_client.get_presigned_url("admissions/tenant-1/piece.pdf")
        assert url == "https://schoolflow-api.onrender.com/uploads/admissions/tenant-1/piece.pdf"

    def test_falls_back_to_minio_external_hostname(self, local_client, monkeypatch):
        monkeypatch.setattr("app.core.storage.settings.BACKEND_URL", "")
        monkeypatch.setattr("app.core.storage.settings.MINIO_EXTERNAL_HOSTNAME", "storage.example.com")
        url = local_client.get_presigned_url("admissions/tenant-1/piece.pdf")
        assert url == "https://storage.example.com/uploads/admissions/tenant-1/piece.pdf"

    def test_last_resort_uses_api_proxy_prefix_not_bare_uploads(self, local_client, monkeypatch):
        # Le vrai bug : ni BACKEND_URL ni MINIO_EXTERNAL_HOSTNAME ne sont
        # configurés (cas réel de cette instance) — le chemin renvoyé DOIT
        # passer par /api-proxy pour que server.mjs (prod) ET le proxy
        # Vite (dev, voir vite.config.ts) sachent le retransmettre au
        # backend. Un simple "/uploads/..." se ferait avaler par le
        # fallback SPA de server.mjs (index.html), pas par le backend.
        monkeypatch.setattr("app.core.storage.settings.BACKEND_URL", "")
        monkeypatch.setattr("app.core.storage.settings.MINIO_EXTERNAL_HOSTNAME", "")
        url = local_client.get_presigned_url("admissions/tenant-1/piece.pdf")
        assert url == "/api-proxy/uploads/admissions/tenant-1/piece.pdf"
        assert not url.startswith("/uploads/")

    def test_backend_url_trailing_slash_is_stripped(self, local_client, monkeypatch):
        monkeypatch.setattr("app.core.storage.settings.BACKEND_URL", "https://schoolflow-api.onrender.com/")
        url = local_client.get_presigned_url("piece.pdf")
        assert url == "https://schoolflow-api.onrender.com/uploads/piece.pdf"
