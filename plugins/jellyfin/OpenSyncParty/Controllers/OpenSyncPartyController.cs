using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
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
    private readonly PluginConfiguration _config;

    public OpenSyncPartyController()
    {
        _config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
    }

    [HttpPost("token")]
    [Authorize]
    public ActionResult<TokenResponse> CreateToken()
    {
        if (string.IsNullOrWhiteSpace(_config.JwtSecret))
        {
            return BadRequest("JWT secret is not configured.");
        }

        var now = DateTimeOffset.UtcNow;
        var claims = new List<Claim>
        {
            new("user_id", User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty),
            new("username", User.Identity?.Name ?? "user"),
        };

        var roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value).Where(v => !string.IsNullOrWhiteSpace(v));
        foreach (var role in roles)
        {
            claims.Add(new Claim("role", role));
        }

        var token = BuildToken(claims, now.AddSeconds(_config.TokenTtlSeconds));
        return Ok(new TokenResponse { Token = token, ExpiresAt = now.AddSeconds(_config.TokenTtlSeconds).ToUnixTimeSeconds() });
    }

    [HttpPost("invite")]
    [Authorize]
    public ActionResult<InviteResponse> CreateInvite([FromBody] InviteRequest request)
    {
        if (string.IsNullOrWhiteSpace(_config.JwtSecret))
        {
            return BadRequest("JWT secret is not configured.");
        }

        if (string.IsNullOrWhiteSpace(request.Room))
        {
            return BadRequest("Room is required.");
        }

        var now = DateTimeOffset.UtcNow;
        var expires = now.AddSeconds(request.ExpiresInSeconds ?? _config.InviteTtlSeconds);
        var claims = new List<Claim>
        {
            new("type", "invite"),
            new("room", request.Room),
        };

        var token = BuildToken(claims, expires);
        return Ok(new InviteResponse { InviteToken = token, ExpiresAt = expires.ToUnixTimeSeconds() });
    }

    private string BuildToken(IEnumerable<Claim> claims, DateTimeOffset expires)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config.JwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: string.IsNullOrWhiteSpace(_config.JwtIssuer) ? null : _config.JwtIssuer,
            audience: string.IsNullOrWhiteSpace(_config.JwtAudience) ? null : _config.JwtAudience,
            claims: claims,
            expires: expires.UtcDateTime,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public class TokenResponse
    {
        public string Token { get; set; } = string.Empty;
        public long ExpiresAt { get; set; }
    }

    public class InviteRequest
    {
        public string Room { get; set; } = string.Empty;
        public int? ExpiresInSeconds { get; set; }
    }

    public class InviteResponse
    {
        public string InviteToken { get; set; } = string.Empty;
        public long ExpiresAt { get; set; }
    }
}
