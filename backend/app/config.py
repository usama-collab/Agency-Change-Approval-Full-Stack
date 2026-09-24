import os


class Settings:
    database_url = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://agency:agency@localhost:5432/agency"
    )
    app_origin = os.getenv("APP_ORIGIN", "http://localhost:5173").rstrip("/")
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    smtp_host = os.getenv("SMTP_HOST", "localhost")
    smtp_port = int(os.getenv("SMTP_PORT", "1025"))
    mail_from = os.getenv("MAIL_FROM", "Agency Approval <no-reply@example.test>")


settings = Settings()
