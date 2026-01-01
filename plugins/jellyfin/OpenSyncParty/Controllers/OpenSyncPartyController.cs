using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OpenSyncParty.Plugin.Managers;
using OpenSyncParty.Plugin.Models;

namespace OpenSyncParty.Plugin.Controllers;

[ApiController]
[Route("OpenSyncParty")]
public class OpenSyncPartyController : ControllerBase
{
    private readonly RoomManager _roomManager;

    public OpenSyncPartyController()
    {
        _roomManager = Plugin.Instance!.RoomManager;
    }

    [Route("ws")]
    public async Task Get()
    {
        if (HttpContext.WebSockets.IsWebSocketRequest)
        {
            using var ws = await HttpContext.WebSockets.AcceptWebSocketAsync();
            await HandleWebSocket(ws);
        }
        else
        {
            HttpContext.Response.StatusCode = 400;
        }
    }

    private async Task HandleWebSocket(WebSocket ws)
    {
        var buffer = new byte[1024 * 4];
        
        try
        {
            while (ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                    break;
                }

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    try 
                    {
                        var message = JsonSerializer.Deserialize<SyncMessage>(json);
                        if (message != null)
                        {
                            await ProcessMessage(ws, message);
                        }
                    }
                    catch
                    {
                        // Invalid JSON, ignore
                    }
                }
            }
        }
        catch
        {
            // WebSocket error
        }
        finally
        {
            await HandleDisconnect(ws);
        }
    }

    private async Task ProcessMessage(WebSocket ws, SyncMessage msg)
    {
        switch (msg.Type)
        {
            case "create_room":
                await HandleCreateRoom(ws, msg);
                break;
            case "join_room":
                await HandleJoinRoom(ws, msg);
                break;
            case "player_event":
                await HandlePlayerEvent(ws, msg);
                break;
            case "state_update":
                await HandleStateUpdate(ws, msg);
                break;
            case "ping":
                await HandlePing(ws, msg);
                break;
        }
    }

    private async Task HandleCreateRoom(WebSocket ws, SyncMessage msg)
    {
        if (string.IsNullOrEmpty(msg.RoomId) || string.IsNullOrEmpty(msg.ClientId)) return;
        
        var payload = JsonSerializer.Deserialize<CreateRoomPayload>(msg.Payload?.ToString() ?? "{}");
        if (payload == null) return;

        if (_roomManager.GetRoom(msg.RoomId) != null) return; // Room exists

        var room = _roomManager.CreateRoom(msg.RoomId, msg.ClientId, payload.MediaUrl, payload.Options, payload.StartPos);
        _roomManager.AddClientToRoom(room, msg.ClientId, payload.Name, ws);

        await SendJson(ws, new SyncMessage 
        { 
            Type = "room_state",
            RoomId = msg.RoomId,
            ClientId = msg.ClientId,
            Payload = _roomManager.GetRoomStatePayload(room),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }

    private async Task HandleJoinRoom(WebSocket ws, SyncMessage msg)
    {
        if (string.IsNullOrEmpty(msg.RoomId) || string.IsNullOrEmpty(msg.ClientId)) return;

        var room = _roomManager.GetRoom(msg.RoomId);
        if (room == null) return;

        var payload = JsonSerializer.Deserialize<JoinRoomPayload>(msg.Payload?.ToString() ?? "{}");
        _roomManager.AddClientToRoom(room, msg.ClientId, payload?.Name, ws);

        await SendJson(ws, new SyncMessage 
        { 
            Type = "room_state",
            RoomId = msg.RoomId,
            ClientId = msg.ClientId,
            Payload = _roomManager.GetRoomStatePayload(room),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });

        await _roomManager.Broadcast(room, new SyncMessage
        {
            Type = "client_joined",
            RoomId = room.RoomId,
            ClientId = msg.ClientId,
            Payload = new { name = payload?.Name },
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        }, excludeClientId: msg.ClientId);

        await _roomManager.Broadcast(room, new SyncMessage
        {
            Type = "participants_update",
            RoomId = room.RoomId,
            ClientId = msg.ClientId,
            Payload = _roomManager.GetParticipantsPayload(room),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        }, excludeClientId: msg.ClientId);
    }

    private async Task HandlePlayerEvent(WebSocket ws, SyncMessage msg)
    {
        if (string.IsNullOrEmpty(msg.RoomId) || string.IsNullOrEmpty(msg.ClientId)) return;
        var room = _roomManager.GetRoom(msg.RoomId);
        if (room == null || room.HostId != msg.ClientId) return;

        var payload = JsonSerializer.Deserialize<PlayerEventPayload>(msg.Payload?.ToString() ?? "{}");
        if (payload != null)
        {
            if (payload.Action == "play") room.State.PlayState = "playing";
            if (payload.Action == "pause") room.State.PlayState = "paused";
            if (payload.Position.HasValue) room.State.Position = payload.Position.Value;
        }

        msg.ServerTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await _roomManager.Broadcast(room, msg);
    }

    private async Task HandleStateUpdate(WebSocket ws, SyncMessage msg)
    {
        if (string.IsNullOrEmpty(msg.RoomId) || string.IsNullOrEmpty(msg.ClientId)) return;
        var room = _roomManager.GetRoom(msg.RoomId);
        if (room == null || room.HostId != msg.ClientId) return;

        var payload = JsonSerializer.Deserialize<PlaybackState>(msg.Payload?.ToString() ?? "{}");
        if (payload != null)
        {
            room.State.Position = payload.Position;
            room.State.PlayState = payload.PlayState;
        }

        msg.ServerTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await _roomManager.Broadcast(room, msg);
    }

    private async Task HandlePing(WebSocket ws, SyncMessage msg)
    {
        await SendJson(ws, new SyncMessage
        {
            Type = "pong",
            RoomId = msg.RoomId,
            ClientId = msg.ClientId,
            Payload = msg.Payload,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }

    private async Task HandleDisconnect(WebSocket ws)
    {
        var (room, client) = _roomManager.RemoveClient(ws);
        if (room != null && client != null)
        {
            if (room.HostId == client.ClientId)
            {
                var nextHost = room.Clients.Keys.FirstOrDefault();
                if (nextHost != null)
                {
                    room.HostId = nextHost;
                    await _roomManager.Broadcast(room, new SyncMessage
                    {
                        Type = "host_change",
                        RoomId = room.RoomId,
                        Payload = new { host_id = nextHost }
                    });
                    await _roomManager.Broadcast(room, new SyncMessage
                    {
                        Type = "participants_update",
                        RoomId = room.RoomId,
                        Payload = _roomManager.GetParticipantsPayload(room)
                    });
                }
                else
                {
                    _roomManager.RemoveRoom(room.RoomId);
                }
            }
            else
            {
                await _roomManager.Broadcast(room, new SyncMessage
                {
                    Type = "client_left",
                    RoomId = room.RoomId,
                    ClientId = client.ClientId,
                    Payload = new { }
                });
                await _roomManager.Broadcast(room, new SyncMessage
                {
                    Type = "participants_update",
                    RoomId = room.RoomId,
                    Payload = _roomManager.GetParticipantsPayload(room)
                });
            }
        }
    }

    private async Task SendJson(WebSocket ws, object data)
    {
        var json = JsonSerializer.Serialize(data);
        var buffer = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, CancellationToken.None);
    }
}