using System.Security.Claims;
using Whamail.API.DTOs;
using Whamail.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Whamail.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class BroadcastsController : ControllerBase
{
    private readonly IBroadcastService _broadcastService;

    public BroadcastsController(IBroadcastService broadcastService) => _broadcastService = broadcastService;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await _broadcastService.GetAllAsync(GetUserId());
        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        try
        {
            var result = await _broadcastService.GetByIdAsync(GetUserId(), id);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpGet("{id}/detail")]
    public async Task<IActionResult> GetDetail(Guid id)
    {
        try
        {
            var result = await _broadcastService.GetDetailAsync(GetUserId(), id);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBroadcastRequest request)
    {
        try
        {
            var result = await _broadcastService.CreateAsync(GetUserId(), request);
            return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/send")]
    public async Task<IActionResult> Send(Guid id)
    {
        try
        {
            var result = await _broadcastService.SendAsync(GetUserId(), id);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/send-remaining")]
    public async Task<IActionResult> SendRemaining(Guid id)
    {
        try
        {
            var result = await _broadcastService.SendRemainingAsync(GetUserId(), id);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await _broadcastService.DeleteAsync(GetUserId(), id);
            return Ok(new { message = "Broadcast deleted." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
