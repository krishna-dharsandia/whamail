using System.Security.Claims;
using Whamail.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Whamail.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class MetricsController : ControllerBase
{
    private readonly IMetricsService _metricsService;

    public MetricsController(IMetricsService metricsService) => _metricsService = metricsService;

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var result = await _metricsService.GetOverviewAsync(GetUserId());
        return Ok(result);
    }

    [HttpGet("emails-per-day")]
    public async Task<IActionResult> GetEmailsPerDay([FromQuery] int days = 30)
    {
        var result = await _metricsService.GetEmailsPerDayAsync(GetUserId(), Math.Clamp(days, 7, 90));
        return Ok(result);
    }

    [HttpGet("emails-per-month")]
    public async Task<IActionResult> GetEmailsPerMonth([FromQuery] int months = 12)
    {
        var result = await _metricsService.GetEmailsPerMonthAsync(GetUserId(), Math.Clamp(months, 3, 24));
        return Ok(result);
    }

    [HttpGet("broadcast-status")]
    public async Task<IActionResult> GetBroadcastStatus()
    {
        var result = await _metricsService.GetBroadcastStatusStatsAsync(GetUserId());
        return Ok(result);
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
