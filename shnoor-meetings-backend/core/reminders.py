import logging
import os
import smtplib
import threading
from datetime import datetime
from email.message import EmailMessage
from typing import Optional

from core.database import get_db_connection, get_dict_cursor, release_db_connection

logger = logging.getLogger(__name__)
DEFAULT_REMINDER_OFFSET_MINUTES = int((os.getenv("CALENDAR_REMINDER_OFFSET_MINUTES") or "5").strip() or "5")

_reminder_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()


def _get_smtp_settings():
    return {
        "host": (os.getenv("SMTP_HOST") or "").strip(),
        "port": int((os.getenv("SMTP_PORT") or "587").strip() or "587"),
        "username": (os.getenv("SMTP_USERNAME") or "").strip(),
        "password": (os.getenv("SMTP_PASSWORD") or "").strip(),
        "from_email": (os.getenv("SMTP_FROM_EMAIL") or "").strip(),
        "use_tls": (os.getenv("SMTP_USE_TLS") or "true").strip().lower() != "false",
    }


def _smtp_is_configured():
    settings = _get_smtp_settings()
    return all([
        settings["host"],
        settings["port"],
        settings["username"],
        settings["password"],
        settings["from_email"],
    ])


def _build_reminder_subject(event: dict) -> str:
    category = (event.get("category") or "meeting").rstrip("s").capitalize()
    offset_minutes = event.get("reminder_offset_minutes") or DEFAULT_REMINDER_OFFSET_MINUTES
    return f"Reminder: {category} '{event.get('title') or 'Untitled'}' starts in {offset_minutes} minutes"


def _format_event_start(event_start) -> str:
    if isinstance(event_start, datetime):
        timezone_name = event_start.tzname() or "UTC"
        return event_start.strftime(f"%b %d, %Y at %I:%M %p {timezone_name}")

    return str(event_start)


def _build_reminder_body(event: dict) -> str:
    event_title = event.get("title") or "Untitled"
    event_category = ((event.get("category") or "meeting").rstrip("s")).capitalize()
    event_start = _format_event_start(event.get("start_time"))
    offset_minutes = event.get("reminder_offset_minutes") or DEFAULT_REMINDER_OFFSET_MINUTES

    return (
        f"Hello,\n\n"
        f"You have a {event_category.lower()} scheduled in {offset_minutes} minutes.\n\n"
        f"Title: {event_title}\n"
        f"Date and time: {event_start}\n"
        f"Category: {event_category}\n\n"
        f"Please be ready before it starts.\n\n"
        f"Shnoor Meetings"
    )


def send_calendar_reminder_email(event: dict):
    settings = _get_smtp_settings()
    recipient_email = (event.get("user_email") or "").strip()
    if not recipient_email:
        raise ValueError("Calendar event has no recipient email")

    message = EmailMessage()
    message["Subject"] = _build_reminder_subject(event)
    message["From"] = settings["from_email"]
    message["To"] = recipient_email
    message.set_content(_build_reminder_body(event))

    with smtplib.SMTP(settings["host"], settings["port"], timeout=30) as server:
        if settings["use_tls"]:
            server.starttls()
        server.login(settings["username"], settings["password"])
        server.send_message(message)


def process_pending_calendar_reminders():
    if not _smtp_is_configured():
        logger.info("Calendar reminders skipped because SMTP settings are incomplete.")
        return

    conn = get_db_connection()
    if not conn:
        logger.warning("Calendar reminders skipped because database connection is unavailable.")
        return

    try:
        cursor = get_dict_cursor(conn)
        cursor.execute(
            """
            SELECT
                calendar_events.id,
                calendar_events.title,
                calendar_events.category,
                calendar_events.start_time,
                calendar_events.reminder_offset_minutes,
                users.email AS user_email
            FROM calendar_events
            LEFT JOIN users ON users.id = calendar_events.user_id
            WHERE calendar_events.reminder_sent_at IS NULL
              AND users.email IS NOT NULL
              AND calendar_events.start_time > NOW()
              AND calendar_events.start_time <= (NOW() + make_interval(mins => calendar_events.reminder_offset_minutes))
              AND LOWER(COALESCE(calendar_events.category, 'meetings')) IN ('meetings', 'meeting', 'personal', 'reminders', 'reminder', 'remainder', 'remainders')
            ORDER BY calendar_events.start_time ASC
            """
        )
        pending_events = cursor.fetchall()

        for event in pending_events:
            event_data = dict(event)
            try:
                send_calendar_reminder_email(event_data)
                cursor.execute(
                    "UPDATE calendar_events SET reminder_sent_at = NOW() WHERE id = %s",
                    (event_data["id"],),
                )
                conn.commit()
                logger.info("Sent calendar reminder for event %s to %s", event_data["id"], event_data["user_email"])
            except Exception as exc:
                conn.rollback()
                logger.exception("Failed to send calendar reminder for event %s: %s", event_data.get("id"), exc)
    except Exception as exc:
        conn.rollback()
        logger.exception("Calendar reminder processing failed: %s", exc)
    finally:
        release_db_connection(conn)


def _reminder_loop():
    while not _stop_event.wait(60):
        process_pending_calendar_reminders()


def start_calendar_reminder_worker():
    global _reminder_thread

    if _reminder_thread and _reminder_thread.is_alive():
        return

    _stop_event.clear()
    _reminder_thread = threading.Thread(
        target=_reminder_loop,
        name="calendar-reminder-worker",
        daemon=True,
    )
    _reminder_thread.start()
    logger.info("Calendar reminder worker started.")


def stop_calendar_reminder_worker():
    _stop_event.set()
    logger.info("Calendar reminder worker stopped.")
