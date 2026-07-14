from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


def require_admin(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="x-admin-token"),
    settings: Settings = Depends(get_settings),
) -> None:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_admin_token:
        token = x_admin_token.strip()

    if not token or token != settings.admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="admin auth required")
