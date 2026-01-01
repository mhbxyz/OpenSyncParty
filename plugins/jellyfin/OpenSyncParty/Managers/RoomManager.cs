using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using OpenSyncParty.Plugin.Models;

namespace OpenSyncParty.Plugin.Managers;

public class ClientInfo
{
    public string ClientId { get; set; } = string.Empty;
    public string? Name { get; set; }
    public WebSocket WebSocket { get; set; } = null!;
    public string? RoomId { get; set; }
}

public class Room
{
    public string RoomId { get; set; } = string.Empty;
    public string HostId { get; set; } = string.Empty;
    public string? MediaUrl { get; set; }
    public Dictionary<string, object> Options { get; set; } = new();
    public ConcurrentDictionary<string, ClientInfo> Clients { get; set; } = new();
    public PlaybackState State { get; set; } = new();
}

public class RoomManager
{
    private readonly ConcurrentDictionary<string, Room> _rooms = new();
    private readonly ConcurrentDictionary<WebSocket, ClientInfo> _clientsBySocket = new();

    public Room GetRoom(string roomId)
    {
        _rooms.TryGetValue(roomId, out var room);
        return room;
    }

    public Room CreateRoom(string roomId, string hostId, string? mediaUrl, Dictionary<string, object>? options, double startPos)
    {
        var room = new Room
        {
            RoomId = roomId,
            HostId = hostId,
            MediaUrl = mediaUrl,
            Options = options ?? new Dictionary<string, object>(),
            State = new PlaybackState { Position = startPos, PlayState = "paused" }
        };
        _rooms.TryAdd(roomId, room);
        return room;
    }

    public void RemoveRoom(string roomId)
    {
        _rooms.TryRemove(roomId, out _);
    }

    public void AddClientToRoom(Room room, string clientId, string? name, WebSocket ws)
    {
        var client = new ClientInfo { ClientId = clientId, Name = name, WebSocket = ws, RoomId = room.RoomId };
        room.Clients.TryAdd(clientId, client);
        _clientsBySocket.TryAdd(ws, client);
    }

    public (Room? Room, ClientInfo? Client) RemoveClient(WebSocket ws)
    {
        if (_clientsBySocket.TryRemove(ws, out var client))
        {
            if (client.RoomId != null && _rooms.TryGetValue(client.RoomId, out var room))
            {
                room.Clients.TryRemove(client.ClientId, out _);
                return (room, client);
            }
        }
        return (null, null);
    }

    public async Task Broadcast(Room room, SyncMessage message, string? excludeClientId = null)
    {
        var json = JsonSerializer.Serialize(message);
        var buffer = Encoding.UTF8.GetBytes(json);
        var segment = new ArraySegment<byte>(buffer);

        var tasks = new List<Task>();
        foreach (var client in room.Clients.Values)
        {
            if (client.ClientId == excludeClientId) continue;
            if (client.WebSocket.State == WebSocketState.Open)
            {
                tasks.Add(client.WebSocket.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None));
            }
        }

        try
        {
            await Task.WhenAll(tasks);
        }
        catch
        {
            // Ignore broadcast errors for individual clients
        }
    }

    public RoomStatePayload GetRoomStatePayload(Room room)
    {
        return new RoomStatePayload
        {
            Room = room.RoomId,
            HostId = room.HostId,
            MediaUrl = room.MediaUrl,
            Options = room.Options,
            State = room.State,
            Participants = room.Clients.Values.Select(c => new Participant
            {
                ClientId = c.ClientId,
                Name = c.Name,
                IsHost = c.ClientId == room.HostId
            }).ToList(),
            ParticipantCount = room.Clients.Count
        };
    }

    public ParticipantsPayload GetParticipantsPayload(Room room)
    {
        return new ParticipantsPayload
        {
            Participants = room.Clients.Values.Select(c => new Participant
            {
                ClientId = c.ClientId,
                Name = c.Name,
                IsHost = c.ClientId == room.HostId
            }).ToList(),
            ParticipantCount = room.Clients.Count
        };
    }
}
