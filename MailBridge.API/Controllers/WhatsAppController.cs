using System.Security.Claims;
using Whamail.API.DTOs;
using Whamail.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Whamail.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class WhatsAppController : ControllerBase
{
    private readonly IWhatsAppService _whatsAppService;

    public WhatsAppController(IWhatsAppService whatsAppService) => _whatsAppService = whatsAppService;

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var result = await _whatsAppService.GetStatusAsync(GetUserId());
        return Ok(result);
    }

    [HttpGet("session")]
    public async Task<IActionResult> GetSession()
    {
        var result = await _whatsAppService.GetSessionAsync(GetUserId());
        if (result == null) return NotFound(new { error = "No active WhatsApp session." });
        return Ok(result);
    }

    [HttpPost("connected")]
    public async Task<IActionResult> SaveConnected([FromBody] ConnectWhatsAppRequest request)
    {
        try
        {
            var result = await _whatsAppService.SaveSessionAsync(GetUserId(), request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("disconnect")]
    public async Task<IActionResult> Disconnect()
    {
        await _whatsAppService.RemoveSessionAsync(GetUserId());
        return Ok(new { message = "WhatsApp session disconnected." });
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
