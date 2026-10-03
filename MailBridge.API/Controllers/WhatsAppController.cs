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

    // ===== Send queue =====
    // WhatsApp messages can only be sent from the desktop app that holds the
    // linked session, so it pulls pending items from here and reports results.

    [HttpGet("queue")]
    public async Task<IActionResult> GetPending([FromQuery] Guid? broadcastId, [FromQuery] int limit = 200)
    {
        var result = await _whatsAppService.GetPendingAsync(GetUserId(), broadcastId, limit);
        return Ok(result);
    }

    [HttpGet("queue/stats")]
    public async Task<IActionResult> GetQueueStats([FromQuery] Guid? broadcastId)
    {
        var result = await _whatsAppService.GetQueueStatsAsync(GetUserId(), broadcastId);
        return Ok(result);
    }

    [HttpPost("queue/{id:guid}/claim")]
    public async Task<IActionResult> ClaimItem(Guid id)
    {
        var claimed = await _whatsAppService.ClaimAsync(GetUserId(), id);
        if (!claimed) return Conflict(new { error = "Message is no longer pending." });
        return Ok(new { message = "Message claimed." });
    }

    [HttpPost("queue/{id:guid}/result")]
    public async Task<IActionResult> RecordResult(Guid id, [FromBody] WhatsAppSendResultRequest request)
    {
        try
        {
            var recorded = await _whatsAppService.RecordResultAsync(GetUserId(), id, request);
            if (!recorded) return NotFound(new { error = "Queue item not found." });
            return Ok(new { message = "Result recorded." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("queue/recover")]
    public async Task<IActionResult> Recover()
    {
        var recovered = await _whatsAppService.RecoverInterruptedAsync(GetUserId());
        return Ok(new { recovered });
    }

    [HttpPost("queue/retry-failed")]
    public async Task<IActionResult> RetryFailed([FromQuery] Guid? broadcastId)
    {
        var reset = await _whatsAppService.RetryFailedAsync(GetUserId(), broadcastId);
        return Ok(new { reset });
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
