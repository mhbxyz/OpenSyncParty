using System.ComponentModel.DataAnnotations;
using MediaBrowser.Model.Plugins;

namespace OpenWatchParty.Plugin.Configuration;

/// <summary>
/// Configuration for the OpenWatchParty plugin.
/// Provides settings for JWT authentication and session server connection.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    private string _jwtSecret = string.Empty;
    private int _tokenTtlSeconds = 3600;
    private int _inviteTtlSeconds = 3600;

    /// <summary>
    /// Gets or sets the JWT secret. If empty, authentication is disabled.
    /// Set a value (min 32 chars) to enable authentication.
    /// </summary>
    /// <remarks>
    /// For security, the secret should be at least 32 characters with high entropy.
    /// Use a cryptographically random string for production deployments.
    /// </remarks>
    [MinLength(32, ErrorMessage = "JWT secret must be at least 32 characters when set")]
    public string JwtSecret
    {
        get => _jwtSecret;
        set => _jwtSecret = value ?? string.Empty;
    }

    /// <summary>
    /// JWT audience claim. Defaults to "OpenWatchParty".
    /// </summary>
    [Required(AllowEmptyStrings = false, ErrorMessage = "JWT audience is required")]
    [StringLength(100, MinimumLength = 1, ErrorMessage = "JWT audience must be between 1 and 100 characters")]
    public string JwtAudience { get; set; } = "OpenWatchParty";

    /// <summary>
    /// JWT issuer claim. Defaults to "Jellyfin".
    /// </summary>
    [Required(AllowEmptyStrings = false, ErrorMessage = "JWT issuer is required")]
    [StringLength(100, MinimumLength = 1, ErrorMessage = "JWT issuer must be between 1 and 100 characters")]
    public string JwtIssuer { get; set; } = "Jellyfin";

    /// <summary>
    /// Token TTL in seconds. Must be between 60 and 86400 (1 min to 24 hours).
    /// </summary>
    [Range(60, 86400, ErrorMessage = "Token TTL must be between 60 and 86400 seconds")]
    public int TokenTtlSeconds
    {
        get => _tokenTtlSeconds;
        set => _tokenTtlSeconds = Math.Clamp(value, 60, 86400);
    }

    /// <summary>
    /// Invite TTL in seconds. Must be between 60 and 86400 (1 min to 24 hours).
    /// </summary>
    [Range(60, 86400, ErrorMessage = "Invite TTL must be between 60 and 86400 seconds")]
    public int InviteTtlSeconds
    {
        get => _inviteTtlSeconds;
        set => _inviteTtlSeconds = Math.Clamp(value, 60, 86400);
    }

    /// <summary>
    /// The WebSocket server URL. If empty, uses the default (same host, port 3000).
    /// </summary>
    /// <example>ws://localhost:3000/ws or wss://party.example.com/ws</example>
    [Url(ErrorMessage = "Session server URL must be a valid URL when specified")]
    public string SessionServerUrl { get; set; } = string.Empty;

    // Quality Control Settings

    private int _defaultMaxBitrate = 0;

    /// <summary>
    /// Default maximum bitrate for watch parties in bits per second.
    /// 0 = Auto (no limit), common values: 8000000 (1080p), 4000000 (720p), 1500000 (480p).
    /// </summary>
    [Range(0, 100000000, ErrorMessage = "Max bitrate must be between 0 and 100 Mbps")]
    public int DefaultMaxBitrate
    {
        get => _defaultMaxBitrate;
        set => _defaultMaxBitrate = Math.Max(0, value);
    }

    /// <summary>
    /// Prefer Direct Play over transcoding when possible.
    /// When enabled, the plugin will attempt to play media without transcoding if the client supports the format.
    /// </summary>
    public bool PreferDirectPlay { get; set; } = true;

    /// <summary>
    /// Allow host to change quality settings during a watch party.
    /// When disabled, quality is locked to the default settings.
    /// </summary>
    public bool AllowHostQualityControl { get; set; } = true;
}
