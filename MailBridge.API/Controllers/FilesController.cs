using System.Security.Claims;
using Whamail.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Whamail.API.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    private readonly IFileService _fileService;
    private const long MaxFileSize = 10 * 1024 * 1024; // 10 MB

    public FilesController(IFileService fileService) => _fileService = fileService;

    [HttpPost("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "File is required." });

        if (file.Length > MaxFileSize)
            return BadRequest(new { error = "File size exceeds 10 MB limit." });

        var result = await _fileService.UploadAsync(
            GetUserId(),
            file.FileName,
            file.ContentType ?? "application/octet-stream",
            file.OpenReadStream());

        return Ok(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await _fileService.GetAllAsync(GetUserId());
        return Ok(result);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await _fileService.DeleteAsync(GetUserId(), id);
            return Ok(new { message = "File deleted." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpGet("{id}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var result = await _fileService.DownloadAsync(GetUserId(), id);
        if (result == null) return NotFound(new { error = "File not found." });

        var (stream, fileName, mimeType) = result.Value;
        return File(stream, mimeType, fileName);
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new UnauthorizedAccessException());
}
