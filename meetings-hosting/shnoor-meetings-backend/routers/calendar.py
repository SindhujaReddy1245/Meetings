import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.database import get_db_connection

router = APIRouter(
    prefix="/api/calendar",
    tags=["Calendar"]
)

class CalendarEvent(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    start_time: str
    end_time: str
    category: str = "meetings"
    room_id: str

class CreateEventResponse(BaseModel):
    id: str
    message: str

@router.get("/events", response_model=List[CalendarEvent])
async def get_events():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM calendar_events ORDER BY start_time ASC")
    rows = cursor.fetchall()
    conn.close()
    
    events = [
        CalendarEvent(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            start_time=row["start_time"],
            end_time=row["end_time"],
            category=row["category"],
            room_id=row["room_id"]
        ) for row in rows
    ]
    return events

@router.post("/events", response_model=CreateEventResponse)
async def create_event(event: CalendarEvent):
    event_id = str(uuid.uuid4())
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Simple check for room_id or generate one if missing
    room_id = event.room_id or str(uuid.uuid4())
    
    try:
        cursor.execute(
            "INSERT INTO calendar_events (id, title, description, start_time, end_time, category, room_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (event_id, event.title, event.description, event.start_time, event.end_time, event.category, room_id)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to create event: {str(e)}")
    
    conn.close()
    return {"id": event_id, "message": "Event created successfully"}

@router.delete("/events/{id}")
async def delete_event(id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM calendar_events WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"message": "Event deleted successfully"}

@router.put("/events/{id}")
async def update_event(id: str, event: CalendarEvent):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            "UPDATE calendar_events SET title = ?, description = ?, start_time = ?, end_time = ?, category = ?, room_id = ? WHERE id = ?",
            (event.title, event.description, event.start_time, event.end_time, event.category, event.room_id, id)
        )
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Event not found")
    except Exception as e:
        conn.close()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to update event: {str(e)}")
    
    conn.close()
    return {"message": "Event updated successfully"}
