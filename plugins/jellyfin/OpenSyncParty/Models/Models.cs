using System.Text.Json.Serialization;

namespace OpenSyncParty.Plugin.Models;

public class SyncMessage
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("room")]
    public string? RoomId { get; set; }

    [JsonPropertyName("client")]
    public string? ClientId { get; set; }

    [JsonPropertyName("payload")]
    public object? Payload { get; set; }

    [JsonPropertyName("ts")]
    public long Timestamp { get; set; }

    [JsonPropertyName("server_ts")]
    public long ServerTimestamp { get; set; }
}

public class RoomStatePayload
{
    [JsonPropertyName("room")]
    public string Room { get; set; } = string.Empty;

    [JsonPropertyName("host_id")]
    public string HostId { get; set; } = string.Empty;

    [JsonPropertyName("media_url")]
    public string? MediaUrl { get; set; }

    [JsonPropertyName("options")]
    public Dictionary<string, object> Options { get; set; } = new();

    [JsonPropertyName("state")]
    public PlaybackState State { get; set; } = new();

    [JsonPropertyName("participants")]
    public List<Participant> Participants { get; set; } = new();

    [JsonPropertyName("participant_count")]
    public int ParticipantCount { get; set; }
}

public class PlaybackState
{
    [JsonPropertyName("position")]
    public double Position { get; set; }

    [JsonPropertyName("play_state")]
    public string PlayState { get; set; } = "paused";
}

public class Participant
{
    [JsonPropertyName("client_id")]
    public string ClientId { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("is_host")]
    public bool IsHost { get; set; }
}

public class ParticipantsPayload
{
    [JsonPropertyName("participants")]
    public List<Participant> Participants { get; set; } = new();

    [JsonPropertyName("participant_count")]
    public int ParticipantCount { get; set; }
}

public class JoinRoomPayload
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }
    
    [JsonPropertyName("auth_token")]
    public string? AuthToken { get; set; }
    
    [JsonPropertyName("invite_token")]
    public string? InviteToken { get; set; }
}

public class CreateRoomPayload
{
    [JsonPropertyName("media_url")]
    public string? MediaUrl { get; set; }
    
    [JsonPropertyName("start_pos")]
    public double StartPos { get; set; }
    
    [JsonPropertyName("name")]
    public string? Name { get; set; }
    
    [JsonPropertyName("options")]
    public Dictionary<string, object>? Options { get; set; }
}

public class PlayerEventPayload
{
    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;
    
    [JsonPropertyName("position")]
    public double? Position { get; set; }
}
