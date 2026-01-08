using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using OpenSyncParty.Plugin.Configuration;

namespace OpenSyncParty.Plugin.Controllers;

[ApiController]
[Route("OpenSyncParty")]
public class OpenSyncPartyController : ControllerBase
{
    [HttpGet("ClientScript")]
    [Produces("text/javascript")]
    public ActionResult GetClientScript()
    {
        var assembly = typeof(OpenSyncPartyController).Assembly;
        var resourceName = "OpenSyncParty.Plugin.Web.plugin.js";
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null) return NotFound();
        using var reader = new StreamReader(stream);

        var script = reader.ReadToEnd();

        return Content(script, "text/javascript");
    }

    [HttpGet("Token")]
    [Authorize]
    [Produces("application/json")]
    public ActionResult GetToken()
    {
        var config = Plugin.Instance?.Configuration;
        if (config == null)
        {
            return StatusCode(500, new { error = "Plugin not configured" });
        }

        // Get user info from the authenticated context
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? User.FindFirst("Jellyfin-UserId")?.Value
                  ?? "unknown";
        var userName = User.FindFirst(ClaimTypes.Name)?.Value
                    ?? User.Identity?.Name
                    ?? "Unknown User";

        // Check if JWT is configured
        if (string.IsNullOrEmpty(config.JwtSecret))
        {
            // Return a special response indicating auth is disabled
            return Ok(new {
                token = (string?)null,
                auth_enabled = false,
                user_id = userId,
                user_name = userName
            });
        }

        var token = GenerateJwtToken(userId, userName, config);

        return Ok(new {
            token,
            auth_enabled = true,
            expires_in = config.TokenTtlSeconds,
            user_id = userId,
            user_name = userName
        });
    }

    private static string GenerateJwtToken(string userId, string userName, PluginConfiguration config)
    {
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.JwtSecret));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId),
            new Claim(JwtRegisteredClaimNames.Name, userName),
            new Claim(JwtRegisteredClaimNames.Aud, config.JwtAudience),
            new Claim(JwtRegisteredClaimNames.Iss, config.JwtIssuer),
            new Claim(JwtRegisteredClaimNames.Iat, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
        };

        var token = new JwtSecurityToken(
            issuer: config.JwtIssuer,
            audience: config.JwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddSeconds(config.TokenTtlSeconds),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
