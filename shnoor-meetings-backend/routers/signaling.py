import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.connection_manager import manager
from core.database import (
    ensure_meeting_record,
    get_meeting_record,
    get_or_create_user,
    mark_participant_left,
    normalize_uuid_or_none,
    save_chat_message,
    upsert_participant_record,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def get_effective_meeting_record(room_id: str):
    try:
        return get_meeting_record(room_id) or manager.get_registered_meeting(room_id) or {}
    except Exception as exc:
        logger.warning("Falling back to in-memory meeting record for %s: %s", room_id, exc)
        return manager.get_registered_meeting(room_id) or {}


def resolve_connection_user(data: dict, client_id: str):
    fallback_user_id = data.get("user_id") or client_id

    try:
        resolved_user_id = get_or_create_user(
            user_id=fallback_user_id,
            firebase_uid=data.get("firebase_uid"),
            name=data.get("name"),
            email=data.get("email"),
            profile_picture=data.get("picture"),
        )
        return resolved_user_id, True
    except Exception as exc:
        logger.warning("Falling back to transient websocket identity for %s: %s", client_id, exc)
        return fallback_user_id, False


def persist_join_if_possible(room_id: str, user_id: str, role: str, joined_at: str | None):
    try:
        meeting_id = ensure_meeting_record(
            room_id,
            host_user_id=user_id if role == "host" else None,
            title=f"Meeting {str(room_id)[:8]}",
            status="active",
            started_at=joined_at if role == "host" else None,
        )
        if meeting_id:
            upsert_participant_record(meeting_id, user_id, role=role, joined_at=joined_at)
    except Exception as exc:
        logger.warning("Skipping persistent participant tracking for room %s: %s", room_id, exc)


def mark_left_if_possible(room_id: str, user_id: str | None):
    if not user_id:
        return

    try:
        mark_participant_left(room_id, user_id)
    except Exception as exc:
        logger.warning("Skipping persistent participant leave tracking for room %s: %s", room_id, exc)


async def send_waiting_room_state(room_id: str):
    payload = {
        "type": "waiting-room-sync",
        "requests": manager.get_waiting_requests(room_id),
    }

    await manager.broadcast_to_room(room_id, payload)


async def sync_joined_participants(room_id: str):
    await manager.broadcast_to_joined(room_id, {
        "type": "participant-roster",
        "participants": manager.get_joined_participants(room_id),
    })


def resolve_host_status(meeting_record: dict, user_id: str | None, email: str | None):
    meeting_host_email = (meeting_record.get("host_email") or "").strip().lower()
    normalized_email = (email or "").strip().lower()

    return bool(
        (meeting_record.get("host_id") and user_id and meeting_record.get("host_id") == user_id)
        or (meeting_host_email and normalized_email == meeting_host_email)
    )


@router.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    await manager.connect(websocket, room_id, client_id)

    try:
        while True:
            data = await websocket.receive_json()

            msg_type = data.get("type")
            target_id = data.get("target")

            if msg_type == "join-room":
                requested_role = (data.get("role") or "participant").strip().lower()
                name = data.get("name") or ("Host" if requested_role == "host" else "Participant")
                joined_at = data.get("joined_at")
                email = data.get("email")
                user_id, _ = resolve_connection_user({ **data, "name": name }, client_id)
                meeting_record = get_effective_meeting_record(room_id)
                is_meeting_host = resolve_host_status(meeting_record, user_id, email)

                if requested_role == "host" and not meeting_record:
                    role = "host"
                else:
                    role = "host" if requested_role == "host" or is_meeting_host else "participant"

                participant_is_admitted = (
                    manager.is_participant_accepted(room_id, client_id)
                    or manager.is_identity_accepted(room_id, user_id)
                    or manager.is_identity_accepted(room_id, email)
                )
                if role == "participant" and not participant_is_admitted:
                    await manager.send_to_websocket(websocket, {
                        "type": "join-blocked",
                        "reason": "not-admitted",
                    })
                    continue

                manager.register_meeting(
                    room_id,
                    host_id=user_id if role == "host" else meeting_record.get("host_id"),
                    host_email=email if role == "host" else meeting_record.get("host_email"),
                    host_name=name if role == "host" else meeting_record.get("host_name"),
                )
                persist_join_if_possible(room_id, user_id, role, joined_at)

                manager.set_connection_user(room_id, websocket, {
                    "client_id": client_id,
                    "user_id": user_id,
                    "email": email,
                    "name": name,
                    "picture": data.get("picture"),
                    "role": role,
                    "joined": True,
                    "isHandRaised": False,
                    "isSharingScreen": False,
                    "isAudioEnabled": data.get("isAudioEnabled", True),
                    "isVideoEnabled": data.get("isVideoEnabled", True),
                })

                if role == "host":
                    manager.add_accepted_participant(room_id, client_id)
                    await manager.send_to_websocket(websocket, {
                        "type": "waiting-room-sync",
                        "requests": manager.get_waiting_requests(room_id),
                    })

                join_message = {
                    "type": "user-joined",
                    "sender": client_id,
                    "client_id": client_id,
                    "name": name,
                    "picture": data.get("picture"),
                    "role": role,
                    "message": f"User {client_id} joined the meeting",
                }
                await manager.broadcast_to_joined(room_id, join_message, sender=websocket)
                await sync_joined_participants(room_id)
                continue

            if msg_type in {"host-ready", "host_join"}:
                host_name = data.get("name") or "Host"
                host_email = data.get("email")
                host_user_id = data.get("user_id") or client_id
                meeting_record = get_effective_meeting_record(room_id)

                manager.register_meeting(
                    room_id,
                    host_id=host_user_id,
                    host_email=host_email,
                    host_name=host_name,
                )

                if not meeting_record or resolve_host_status(meeting_record, host_user_id, host_email):
                    manager.set_connection_user(room_id, websocket, {
                        "client_id": client_id,
                        "user_id": host_user_id,
                        "email": host_email,
                        "name": host_name,
                        "picture": data.get("picture"),
                        "role": "host",
                        "joined": False,
                    })

                await manager.send_to_websocket(websocket, {
                    "type": "waiting-room-sync",
                    "requests": manager.get_waiting_requests(room_id),
                })
                continue

            if msg_type in {"join-request", "ask_to_join"}:
                requester_name = data.get("name", "Participant")
                manager.set_connection_user(room_id, websocket, {
                    "client_id": client_id,
                    "user_id": data.get("user_id") or client_id,
                    "email": data.get("email"),
                    "name": requester_name,
                    "picture": data.get("picture"),
                    "role": "participant",
                    "joined": False,
                })
                manager.add_waiting_request(
                    room_id,
                    client_id,
                    requester_name,
                    data.get("picture"),
                    user_id=data.get("user_id"),
                    email=data.get("email"),
                )
                await manager.send_to_role(room_id, "host", {
                    "type": "join_request",
                    "sender": client_id,
                    "client_id": client_id,
                    "name": requester_name,
                    "picture": data.get("picture"),
                })
                await send_waiting_room_state(room_id)
                continue

            if msg_type in {"admit", "accept_user", "deny"} and target_id:
                removed_request = manager.remove_waiting_request(room_id, target_id)
                if msg_type in {"admit", "accept_user"}:
                    manager.add_accepted_participant(room_id, target_id)
                    if removed_request:
                        manager.add_accepted_identity(room_id, removed_request.get("user_id"))
                        manager.add_accepted_identity(room_id, removed_request.get("email"))
                        # If the participant reconnected and now has a different client_id,
                        # mark all matching active client_ids as accepted too.
                        for admitted_client_id in manager.get_client_ids_for_identity(
                            room_id,
                            removed_request.get("user_id"),
                            removed_request.get("email"),
                        ):
                            manager.add_accepted_participant(room_id, admitted_client_id)
                await send_waiting_room_state(room_id)
                response_payload = {
                    "sender": client_id,
                    **data,
                    "type": "accepted" if msg_type in {"admit", "accept_user"} else "deny",
                }
                await manager.send_to_client(room_id, target_id, response_payload)
                if removed_request:
                    await manager.send_to_identity(
                        room_id,
                        removed_request.get("user_id"),
                        removed_request.get("email"),
                        response_payload,
                    )
                continue

            if msg_type == "participant-update":
                manager.set_connection_user(room_id, websocket, {
                    "name": data.get("name"),
                    "picture": data.get("picture"),
                    "role": data.get("role"),
                    "isHandRaised": data.get("isHandRaised"),
                    "isSharingScreen": data.get("isSharingScreen"),
                    "isAudioEnabled": data.get("isAudioEnabled"),
                    "isVideoEnabled": data.get("isVideoEnabled"),
                })

            message_to_send = {
                "type": msg_type,
                "sender": client_id,
                **data,
            }

            await manager.broadcast_to_joined(room_id, message_to_send, sender=websocket)

            if msg_type == "participant-update":
                await sync_joined_participants(room_id)

            if msg_type == "chat":
                user_meta = manager.get_connection_user(room_id, websocket) or {}
                sender_id = normalize_uuid_or_none(user_meta.get("user_id"))
                meeting_id = normalize_uuid_or_none(room_id)
                if sender_id and meeting_id and data.get("text"):
                    try:
                        save_chat_message(meeting_id, sender_id, data.get("text"), sent_at=data.get("sent_at"))
                    except Exception as exc:
                        logger.warning("Skipping persistent chat save for room %s: %s", room_id, exc)

            if msg_type == "chat" and data.get("text", "").lower().startswith("@ai"):
                prompt = data.get("text")[3:].strip()
                ai_response_text = f"Beep boop! This is Shnoor AI. You asked: '{prompt}'. (Insert LLM logic here!)"

                ai_message = {
                    "type": "chat",
                    "sender": "Shnoor AI",
                    "text": ai_response_text,
                }

                await manager.broadcast_to_joined(room_id, ai_message)
                await websocket.send_json(ai_message)
    except WebSocketDisconnect:
        metadata = manager.disconnect(websocket, room_id) or {}
        removed_request = manager.remove_waiting_request(room_id, client_id)
        mark_left_if_possible(room_id, metadata.get("user_id"))
        if removed_request:
            await send_waiting_room_state(room_id)
        if metadata.get("joined"):
            await manager.broadcast_to_joined(room_id, {
                "type": "user-left",
                "sender": client_id,
                "client_id": client_id,
                "message": f"User {client_id} left the meeting",
            })
            await sync_joined_participants(room_id)
        logger.info("Client %s disconnected from room %s", client_id, room_id)
    except Exception as exc:
        logger.error("Error in websocket for client %s: %s", client_id, exc)
        metadata = manager.disconnect(websocket, room_id) or {}
        removed_request = manager.remove_waiting_request(room_id, client_id)
        mark_left_if_possible(room_id, metadata.get("user_id"))
        if removed_request:
            await send_waiting_room_state(room_id)
        if metadata.get("joined"):
            await sync_joined_participants(room_id)
