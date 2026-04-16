import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    """
    WebSocket endpoint for handling WebRTC signaling and real-time chat for a specific room.
    """
    await manager.connect(websocket, room_id, client_id)

    try:
        while True:
            # We expect JSON payloads containing signaling data (offers, answers, ice candidates)
            # or custom messages (like chat).
            data = await websocket.receive_json()
            
            msg_type = data.get("type")
            target_id = data.get("target")

            if msg_type == "join-room":
                if data.get("role") == "host":
                    await manager.send_to_websocket(websocket, {
                        "type": "waiting-room-sync",
                        "requests": manager.get_waiting_requests(room_id)
                    })

                join_message = {
                    "type": "user-joined",
                    "sender": client_id,
                    "client_id": client_id,
                    "name": data.get("name"),
                    "role": data.get("role", "participant"),
                    "message": f"User {client_id} joined the meeting"
                }
                await manager.broadcast_to_room(room_id, join_message, sender=websocket)
                continue

            if msg_type == "host-ready":
                await manager.send_to_websocket(websocket, {
                    "type": "waiting-room-sync",
                    "requests": manager.get_waiting_requests(room_id)
                })
                continue

            if msg_type == "join-request":
                manager.add_waiting_request(room_id, client_id, data.get("name", "Participant"))

            if msg_type in {"admit", "deny"} and target_id:
                manager.remove_waiting_request(room_id, target_id)

            message_to_send = {
                "type": msg_type,
                "sender": client_id,
                **data
            }

            if target_id:
                pass

            await manager.broadcast_to_room(room_id, message_to_send, sender=websocket)

            # --- AI Chatbot Interception ---
            if msg_type == "chat" and data.get("text", "").lower().startswith("@ai"):
                # Simulate answering as Shnoor AI
                prompt = data.get("text")[3:].strip()
                ai_response_text = f"Beep boop! This is Shnoor AI. You asked: '{prompt}'. (Insert LLM logic here!)"
                
                # Send the response back to EVERYONE in the room (including the sender of the prompt)
                ai_message = {
                    "type": "chat",
                    "sender": "Shnoor AI ✨",
                    "text": ai_response_text
                }
                
                # We broadcast to others
                await manager.broadcast_to_room(room_id, ai_message)
                # And we must explicitly send it to the requesting websocket too since we omitted it in broadcast
                await websocket.send_json(ai_message)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        # Notify others that this user left
        await manager.broadcast_to_room(room_id, {
            "type": "user-left",
            "sender": client_id,
            "client_id": client_id,
            "message": f"User {client_id} left the meeting"
        })
        logger.info(f"Client {client_id} disconnected from room {room_id}")
    except Exception as e:
        logger.error(f"Error in websocket for client {client_id}: {e}")
        manager.disconnect(websocket, room_id)
