using MediaBrowser.Model.Plugins;

namespace OpenWatchParty.Plugin.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    private string _jwtSecret = string.Empty;

    /// <summary>
    /// Gets or sets the JWT secret. If empty, authentication is disabled.
    /// Set a value (min 32 chars) to enable authentication.
    /// </summary>
    public string JwtSecret
    {
        get => _jwtSecret;
        set => _jwtSecret = value;
    }

    public string JwtAudience { get; set; } = "OpenWatchParty";
    public string JwtIssuer { get; set; } = "Jellyfin";
    public int TokenTtlSeconds { get; set; } = 3600;
    public int InviteTtlSeconds { get; set; } = 3600;

    /// <summary>
    /// The WebSocket server URL. If empty, uses the default (same host, port 3000).
    /// </summary>
    public string SessionServerUrl { get; set; } = string.Empty;
}
