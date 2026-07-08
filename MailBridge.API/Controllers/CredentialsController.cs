using System.Security.Claims;
using MailBridge.API.DTOs;
using MailBridge.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MailBridge.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class CredentialsController : ControllerBase
{
    private readonly ICredentialService _credentialService;

    public CredentialsController(ICredentialService credentialService) => _credentialService = credentialService;

    [HttpPost]
    public async Task<IActionResult> Save([FromBody] SaveCredentialRequest request)
    {
        try
        {
            var result = await _credentialService.SaveAsync(GetUserId(), request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var result = await _credentialService.GetAsync(GetUserId());
        if (result == null) return NotFound(new { error = "No credentials configured." });
        return Ok(result);
    }

    [HttpDelete]
    public async Task<IActionResult> Delete()
    {
        try
        {
            await _credentialService.DeleteAsync(GetUserId());
            return Ok(new { message = "Credentials deleted." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestConnection([FromBody] TestEmailRequest request)
    {
        try
        {
            await _credentialService.TestConnectionAsync(GetUserId(), request.ToEmail);
            return Ok(new { message = "Test email sent successfully." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"SMTP connection failed: {ex.Message}" });
        }
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
