"""Application configuration loaded from environment variables."""

import os

from dotenv import load_dotenv


load_dotenv()


class Config:
    """Keep configuration in one small, easy-to-understand place."""

    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "chiangmai_torism_db")

    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
    FLASK_DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]

    # Server-only integrations.  Keys are deliberately read from .env so they
    # are never bundled into the React application or committed to source code.
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    # Gemini helps refine already-valid MySQL candidates, but the rule-based
    # itinerary must remain responsive when the external service is busy.
    GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "5"))
    GEMINI_FAILURE_COOLDOWN_SECONDS = int(
        os.getenv("GEMINI_FAILURE_COOLDOWN_SECONDS", "60")
    )

    GOOGLE_MAPS_SERVER_API_KEY = os.getenv(
        "GOOGLE_MAPS_SERVER_API_KEY", ""
    ).strip()
    GOOGLE_MAPS_ROUTES_TIMEOUT_SECONDS = int(
        os.getenv("GOOGLE_MAPS_ROUTES_TIMEOUT_SECONDS", "5")
    )
