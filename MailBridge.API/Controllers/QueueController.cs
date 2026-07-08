using System.Security.Claims;
using MailBridge.API.DTOs;
using MailBridge.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MailBridge.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class QueueController : ControllerBase
{
    private readonly IQueueService _queueService;

    public QueueController(IQueueService queueService) => _queueService = queueService;

    [HttpGet]
    public async Task<IActionResult> GetQueue([FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var result = await _queueService.GetQueueAsync(GetUserId(), status, page, pageSize);
        return Ok(result);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var result = await _queueService.GetStatsAsync(GetUserId());
        return Ok(result);
    }

    [HttpPost("batch")]
    public async Task<IActionResult> EnqueueBatch([FromBody] QueueBatchRequest request)
    {
        try
        {
            var result = await _queueService.EnqueueBatchAsync(GetUserId(), request);
            return Ok(new { message = $"{result.Count} emails queued successfully.", items = result });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        try
        {
            await _queueService.CancelPendingAsync(GetUserId(), id);
            return Ok(new { message = "Queue item cancelled." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
