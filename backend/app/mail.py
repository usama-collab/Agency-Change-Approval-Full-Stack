import smtplib
from email.message import EmailMessage

from app.config import settings


def send_mail(recipient: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as client:
        client.send_message(message)
