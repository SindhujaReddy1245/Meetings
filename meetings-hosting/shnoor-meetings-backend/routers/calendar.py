from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from core.database import (
    ensure_meeting_record,
    get_db_connection,
    get_dict_cursor,
    get_or_create_user,
    normalize_uuid_or_none,
    release_db_connection,
)

router = APIRouter(
    prefix="/api/calendar",
    tags=["Calendar"]
)


def normalize_event_category(category: Optional[str]) -> str:
    normalized = (category or "meetings").strip().lower()
    aliases = {
        "meeting": "meetings",
        "meetings": "meetings",
        "personal": "personal",
        "reminder": "reminders",
        "reminders": "reminders",
        "remainder": "reminders",
        "remainders": "reminders",
    }
    return aliases.get(normalized, "meetings")

class CalendarEvent(BaseModel):
    id: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    title: str
    description: Optional[str] = ""
    start_time: datetime
    end_time: datetime
    category: str = "meetings"
    room_id: Optional[str] = None

class CreateEventResponse(BaseModel):
    id: str
    message: str

@router.get("/events", response_model=List[CalendarEvent])
async def get_events(user_id: Optional[str] = Query(default=None)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection is unavailable")

    try:
        cursor = get_dict_cursor(conn)
        normalized_user_id = normalize_uuid_or_none(user_id)
        if user_id and not normalized_user_id:
            raise HTTPException(status_code=400, detail="Invalid user ID")

        if normalized_user_id:
            cursor.execute(
                "SELECT * FROM calendar_events WHERE user_id = %s ORDER BY start_time ASC",
                (normalized_user_id,),
            )
        else:
            cursor.execute("SELECT * FROM calendar_events ORDER BY start_time ASC")
        rows = cursor.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")
    finally:
        release_db_connection(conn)
    
    events = [
        CalendarEvent(
            id=row["id"],
            user_id=row["user_id"],
            title=row["title"],
            description=row["description"],
            start_time=row["start_time"],
            end_time=row["end_time"],
            category=normalize_event_category(row["category"]),
            room_id=row["room_id"]
        ) for row in rows
    ]
    return events

@router.post("/events", response_model=CreateEventResponse)
async def create_event(event: CalendarEvent):
    try:
        event_id = normalize_uuid_or_none(event.id)
        if not event_id:
            raise HTTPException(status_code=400, detail="A frontend-generated event ID is required")

        user_id = get_or_create_user(
            user_id=event.user_id,
            name=event.user_name or "Calendar User",
            email=event.user_email,
        )
        category = normalize_event_category(event.category)
        room_id = normalize_uuid_or_none(event.room_id)
        if room_id:
            ensure_meeting_record(room_id, host_user_id=user_id, title=event.title)
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=500, detail="Database connection is unavailable")

        cursor = get_dict_cursor(conn)
        cursor.execute(
            """
            INSERT INTO calendar_events (id, user_id, title, description, start_time, end_time, category, room_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (event_id, user_id, event.title, event.description, event.start_time, event.end_time, category, room_id)
        )
        conn.commit()
    except Exception as e:
        if isinstance(e, HTTPException):
            if "conn" in locals() and conn:
                conn.rollback()
            raise e
        if "conn" in locals() and conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create event: {str(e)}")
    finally:
        if "conn" in locals() and conn:
            release_db_connection(conn)

    return {"id": event_id, "message": "Event created successfully"}

@router.delete("/events/{id}")
async def delete_event(id: str):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection is unavailable")

    try:
        cursor = get_dict_cursor(conn)
        cursor.execute("DELETE FROM calendar_events WHERE id = %s", (id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete event: {str(e)}")
    finally:
        release_db_connection(conn)

    return {"message": "Event deleted successfully"}

@router.put("/events/{id}")
async def update_event(id: str, event: CalendarEvent):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection is unavailable")

    cursor = get_dict_cursor(conn)
    
    try:
        event_user_id = get_or_create_user(
            user_id=event.user_id,
            name=event.user_name or "Calendar User",
            email=event.user_email,
        )
        category = normalize_event_category(event.category)
        room_id = normalize_uuid_or_none(event.room_id)
        if room_id:
            ensure_meeting_record(room_id, host_user_id=event_user_id, title=event.title)
        cursor.execute(
            "UPDATE calendar_events SET user_id = %s, title = %s, description = %s, start_time = %s, end_time = %s, category = %s, room_id = %s WHERE id = %s",
            (event_user_id, event.title, event.description, event.start_time, event.end_time, category, room_id, id)
        )
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Event not found")
    except Exception as e:
        if isinstance(e, HTTPException):
            conn.rollback()
            raise e
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update event: {str(e)}")
    finally:
        release_db_connection(conn)

    return {"message": "Event updated successfully"}
