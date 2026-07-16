using System.Security.Claims;
using Whamail.API.DTOs;
using Whamail.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Whamail.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService) => _authService = authService;

    /// <summary>
    /// Syncs the Supabase user to a local profile. Call this after Supabase login.
    /// Automatically creates the user if they don't exist yet.
    /// </summary>
    [HttpPost("sync")]
    public async Task<IActionResult> SyncProfile([FromBody] SyncProfileRequest request)
    {
        try
        {
            var userId = GetUserId();
            var email = GetEmail();
            var result = await _authService.EnsureProfileAsync(
                userId, email, request.FullName, request.AvatarUrl, request.AuthProvider);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        try
        {
            var userId = GetUserId();
            var email = GetEmail();
            // Ensure profile exists (auto-create on first call)
            var result = await _authService.EnsureProfileAsync(userId, email, null, null, "email");
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private Guid GetUserId()
    {
        // Supabase JWT uses "sub" claim for user ID
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? throw new UnauthorizedAccessException("User ID not found in token.");
        return Guid.Parse(claim);
    }

    private string GetEmail()
    {
        return User.FindFirst(ClaimTypes.Email)?.Value
            ?? User.FindFirst("email")?.Value
            ?? "unknown@mailbridge.app";
    }
}
