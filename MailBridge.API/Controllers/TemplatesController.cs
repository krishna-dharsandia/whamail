using System.Security.Claims;
using Whamail.API.DTOs;
using Whamail.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Whamail.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class TemplatesController : ControllerBase
{
    private readonly ITemplateService _templateService;

    public TemplatesController(ITemplateService templateService) => _templateService = templateService;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await _templateService.GetAllAsync(GetUserId());
        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        try
        {
            var result = await _templateService.GetByIdAsync(GetUserId(), id);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTemplateRequest request)
    {
        try
        {
            var result = await _templateService.CreateAsync(GetUserId(), request);
            return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTemplateRequest request)
    {
        try
        {
            var result = await _templateService.UpdateAsync(GetUserId(), id, request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await _templateService.DeleteAsync(GetUserId(), id);
            return Ok(new { message = "Template deleted." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
