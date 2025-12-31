using MediaBrowser.Model.Plugins;

namespace OpenSyncParty.Plugin.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public string JwtSecret { get; set; } = string.Empty;
    public string JwtAudience { get; set; } = "OpenSyncParty";
    public string JwtIssuer { get; set; } = "Jellyfin";
    public int TokenTtlSeconds { get; set; } = 3600;
    public int InviteTtlSeconds { get; set; } = 3600;
}
