from app.backends import build_backend
from app.config import Settings
from app.service import RerankService


def build_service(settings: Settings) -> RerankService:
    return RerankService(build_backend(settings), settings)
