import json
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, TypedDict
from fastapi import WebSocket


def now_ms() -> int:
    return int(time.time() * 1000)


class RoomState(TypedDict):
    position: float
    play_state: str


class Participant(TypedDict):
    client_id: str
    name: Optional[str]
    is_host: bool


class ClientInfo:
    def __init__(self, client_id: str, name: Optional[str], ws: WebSocket, room_id: Optional[str] = None):
        self.client_id = client_id
        self.name = name
        self.ws = ws
        self.room_id = room_id


@dataclass
class Room:
    room_id: str
    host_id: str
    media_url: Optional[str]
    options: dict = field(default_factory=dict)
    clients: Dict[str, ClientInfo] = field(default_factory=dict)
    state: Dict = field(default_factory=lambda: {"position": 0.0, "play_state": "paused"})


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.clients_by_ws: Dict[WebSocket, ClientInfo] = {}

    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id)

    def get_client_by_ws(self, ws: WebSocket) -> Optional[ClientInfo]:
        return self.clients_by_ws.get(ws)

    def create_room(self, room_id: str, host_id: str, media_url: Optional[str], options: dict, start_pos: float = 0.0) -> Room:
        room = Room(
            room_id=room_id,
            host_id=host_id,
            media_url=media_url,
            options=options,
        )
        room.state = {
            "position": start_pos,
            "play_state": "paused",
        }
        self.rooms[room_id] = room
        return room

    def remove_room(self, room_id: str):
        self.rooms.pop(room_id, None)

    def add_client_to_room(self, room: Room, client_id: str, name: Optional[str], ws: WebSocket):
        client_info = ClientInfo(client_id=client_id, name=name, ws=ws, room_id=room.room_id)
        room.clients[client_id] = client_info
        self.clients_by_ws[ws] = client_info
        return client_info

    def remove_client(self, ws: WebSocket) -> Optional[Tuple[Room, ClientInfo]]:
        client_info = self.clients_by_ws.pop(ws, None)
        if not client_info:
            return None
        
        room = self.rooms.get(client_info.room_id)
        if not room:
            return None
            
        room.clients.pop(client_info.client_id, None)
        return room, client_info

    async def broadcast(self, room: Room, message: dict, exclude_client: Optional[str] = None) -> None:
        dead = []
        for client_id, client_info in list(room.clients.items()):
            if client_id == exclude_client:
                continue
            try:
                await client_info.ws.send_json(message)
            except Exception:
                dead.append(client_id)
        for client_id in dead:
            room.clients.pop(client_id, None)
            # Cleanup clients_by_ws if we found a dead connection
            for ws, info in list(self.clients_by_ws.items()):
                if info.client_id == client_id:
                    self.clients_by_ws.pop(ws, None)

    def get_room_state_payload(self, room: Room) -> dict:
        return {
            "room": room.room_id,
            "host_id": room.host_id,
            "media_url": room.media_url,
            "options": room.options,
            "state": room.state,
            "participants": [
                {
                    "client_id": client.client_id,
                    "name": client.name,
                    "is_host": client.client_id == room.host_id,
                }
                for client in room.clients.values()
            ],
            "participant_count": len(room.clients),
        }

    def get_participants_payload(self, room: Room) -> dict:
        return {
            "participants": [
                {
                    "client_id": client.client_id,
                    "name": client.name,
                    "is_host": client.client_id == room.host_id,
                }
                for client in room.clients.values()
            ],
            "participant_count": len(room.clients),
        }
