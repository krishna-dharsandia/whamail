using System.Security.Claims;
using MailBridge.API.DTOs;
using MailBridge.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MailBridge.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class AudiencesController : ControllerBase
{
    private readonly IAudienceService _audienceService;

    public AudiencesController(IAudienceService audienceService) => _audienceService = audienceService;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await _audienceService.GetAllAsync(GetUserId());
        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        try
        {
            var result = await _audienceService.GetByIdAsync(GetUserId(), id);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAudienceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Name is required." });

        var result = await _audienceService.CreateAsync(GetUserId(), request);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await _audienceService.DeleteAsync(GetUserId(), id);
            return Ok(new { message = "Audience deleted." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    // ===== Contacts =====

    [HttpGet("{id}/contacts")]
    public async Task<IActionResult> GetContacts(Guid id)
    {
        try
        {
            var result = await _audienceService.GetContactsAsync(GetUserId(), id);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/contacts")]
    public async Task<IActionResult> AddContact(Guid id, [FromBody] AddContactRequest request)
    {
        try
        {
            var result = await _audienceService.AddContactAsync(GetUserId(), id, request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}/contacts/{contactId}")]
    public async Task<IActionResult> DeleteContact(Guid id, Guid contactId)
    {
        try
        {
            await _audienceService.DeleteContactAsync(GetUserId(), id, contactId);
            return Ok(new { message = "Contact removed." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/upload")]
    public async Task<IActionResult> UploadCsv(Guid id, IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "File is required." });

        var ext = Path.GetExtension(file.FileName).ToLower();
        if (ext != ".csv")
            return BadRequest(new { error = "Only CSV files are supported." });

        try
        {
            using var reader = new StreamReader(file.OpenReadStream());
            var content = await reader.ReadToEndAsync();
            var (added, skipped) = await _audienceService.UploadCsvAsync(GetUserId(), id, content);
            return Ok(new { added, skipped, message = $"Imported {added} contacts. Skipped {skipped} duplicates/invalid." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
