import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/meetings",
    tags=["Meetings"]
)

class CreateMeetingResponse(BaseModel):
    room_id: str
    message: str

class JoinMeetingRequest(BaseModel):
    room_id: str

@router.post("/create", response_model=CreateMeetingResponse)
async def create_meeting():
    """
    Creates a unique meeting ID that can be shared with other participants.
    """
    room_id = str(uuid.uuid4())
    return {
        "room_id": room_id,
        "message": "Meeting created successfully"
    }

@router.get("/{room_id}")
async def check_meeting(room_id: str):
    """
    Checks if a meeting ID is valid (in a production system, we'd check against a DB here).
    For now, we just validate the format (e.g. uuid) or assume it is valid.
    """
    if not room_id:
        raise HTTPException(status_code=400, detail="Invalid room ID")
    return {"room_id": room_id, "valid": True}
