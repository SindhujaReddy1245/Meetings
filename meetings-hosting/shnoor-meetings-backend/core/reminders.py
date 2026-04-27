import logging
import os
import threading
import urllib.request
import urllib.error
import json
from datetime import datetime
from typing import Optional

from core.database import get_db_connection, get_dict_cursor, release_db_connection

logger = logging.getLogger(__name__)
DEFAULT_REMINDER_OFFSET_MINUTES = int((os.getenv("CALENDAR_REMINDER_OFFSET_MINUTES") or "5").strip() or "5")
REMINDER_POLL_INTERVAL_SECONDS = int((os.getenv("CALENDAR_REMINDER_POLL_INTERVAL_SECONDS") or "15").strip() or "15")
REMINDER_GRACE_WINDOW_MINUTES = int((os.getenv("CALENDAR_REMINDER_GRACE_WINDOW_MINUTES") or "30").strip() or "30")

_reminder_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()

def _get_resend_settings():
    return {
        "api_key": (os.getenv("RESEND_API_KEY") or "").strip(),
        "from_email": (os.getenv("RESEND_FROM_EMAIL") or "").strip(),
        "from_name": (os.getenv("RESEND_FROM_NAME") or "Shnoor Meetings").strip(),
    }


def _resend_is_configured():
    settings = _get_resend_settings()
    return all([settings["api_key"], settings["from_email"]])


def _get_missing_resend_keys():
    settings = _get_resend_settings()
    missing_keys = []
    if not settings["api_key"]:
        missing_keys.append("RESEND_API_KEY")
    if not settings["from_email"]:
        missing_keys.append("RESEND_FROM_EMAIL")
    return missing_keys


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
    if _resend_is_configured():
        _send_calendar_reminder_via_resend(event)
    else:
        missing_resend = _get_missing_resend_keys()
        raise RuntimeError(
            "Resend is not configured for calendar reminders. "
            f"Missing Resend keys: {', '.join(missing_resend) or 'none'}."
        )


def _send_calendar_reminder_via_resend(event: dict):
    settings = _get_resend_settings()
    recipient_email = (event.get("user_email") or "").strip()
    if not recipient_email:
        raise ValueError("Calendar event has no recipient email")

    payload = {
        "from": f"{settings['from_name']} <{settings['from_email']}>",
        "to": [recipient_email],
        "subject": _build_reminder_subject(event),
        "text": _build_reminder_body(event),
    }

    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings['api_key']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status >= 400:
                body = response.read().decode("utf-8", errors="ignore")
                raise RuntimeError(f"Resend API failed with status {response.status}: {body}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Resend API error {exc.code}: {body}") from exc


def process_pending_calendar_reminders():
    if not _resend_is_configured():
        logger.warning(
            "Calendar reminders skipped because Resend settings are incomplete. Missing Resend: %s",
            ", ".join(_get_missing_resend_keys()) or "none",
        )
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
                LOWER(BTRIM(COALESCE(calendar_events.recipient_email, users.email))) AS user_email
            FROM calendar_events
            LEFT JOIN users ON users.id = calendar_events.user_id
            WHERE calendar_events.reminder_sent_at IS NULL
              AND COALESCE(calendar_events.recipient_email, users.email) IS NOT NULL
              AND (calendar_events.start_time - make_interval(mins => COALESCE(calendar_events.reminder_offset_minutes, %s))) <= NOW()
              AND calendar_events.start_time >= (NOW() - make_interval(mins => %s))
              AND LOWER(COALESCE(calendar_events.category, 'meetings')) IN ('meetings', 'meeting', 'personal', 'reminders', 'reminder', 'remainder', 'remainders')
            ORDER BY calendar_events.start_time ASC
            """,
            (DEFAULT_REMINDER_OFFSET_MINUTES, REMINDER_GRACE_WINDOW_MINUTES),
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
    while not _stop_event.wait(REMINDER_POLL_INTERVAL_SECONDS):
        process_pending_calendar_reminders()


def start_calendar_reminder_worker():
    global _reminder_thread

    if _reminder_thread and _reminder_thread.is_alive():
        return

    _stop_event.clear()
    process_pending_calendar_reminders()
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
