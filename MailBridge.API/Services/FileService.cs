using Whamail.API.Data;
using Whamail.API.DTOs;
using Whamail.API.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Whamail.API.Services;

public interface IFileService
{
    Task<UserFileResponse> UploadAsync(Guid userId, string originalName, string mimeType, Stream stream);
    Task<List<UserFileResponse>> GetAllAsync(Guid userId);
    Task DeleteAsync(Guid userId, Guid fileId);
    Task<(Stream stream, string fileName, string mimeType)?> DownloadAsync(Guid userId, Guid fileId);
    Task<List<UserFile>> GetByIdsAsync(List<Guid> fileIds);
    string GetStoragePath();
}

public class FileService : IFileService
{
    private readonly MailBridgeDbContext _db;
    private readonly string _storagePath;

    public FileService(MailBridgeDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _storagePath = Path.Combine(env.ContentRootPath, "UserFiles");
        Directory.CreateDirectory(_storagePath);
    }

    public async Task<UserFileResponse> UploadAsync(Guid userId, string originalName, string mimeType, Stream stream)
    {
        var id = Guid.NewGuid();
        var ext = Path.GetExtension(originalName);
        var storedName = $"{id}{ext}";
        var filePath = Path.Combine(_storagePath, storedName);

        await using var fs = new FileStream(filePath, FileMode.Create);
        await stream.CopyToAsync(fs);
        var size = fs.Length;

        var file = new UserFile
        {
            Id = id,
            UserId = userId,
            OriginalName = originalName,
            StoredName = storedName,
            MimeType = mimeType,
            Size = size,
            CreatedAt = DateTime.UtcNow,
        };

        _db.UserFiles.Add(file);
        await _db.SaveChangesAsync();

        return new UserFileResponse(file.Id, file.OriginalName, file.MimeType, file.Size, file.CreatedAt);
    }

    public async Task<List<UserFileResponse>> GetAllAsync(Guid userId)
    {
        var files = await _db.UserFiles
            .Where(f => f.UserId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync();

        var templates = await _db.EmailTemplates
            .Where(t => t.UserId == userId && t.AttachmentFileIds != null)
            .Select(t => new { t.Name, t.AttachmentFileIds })
            .ToListAsync();

        var usageByFileId = new Dictionary<Guid, List<string>>();
        foreach (var template in templates)
        {
            foreach (var fileId in ParseFileIds(template.AttachmentFileIds))
            {
                if (!usageByFileId.TryGetValue(fileId, out var names))
                {
                    names = new List<string>();
                    usageByFileId[fileId] = names;
                }

                names.Add(template.Name);
            }
        }

        return files
            .Select(f =>
            {
                usageByFileId.TryGetValue(f.Id, out var templateNames);
                return new UserFileResponse(
                    f.Id,
                    f.OriginalName,
                    f.MimeType,
                    f.Size,
                    f.CreatedAt,
                    templateNames?.Count ?? 0,
                    templateNames);
            })
            .ToList();
    }

    public async Task DeleteAsync(Guid userId, Guid fileId)
    {
        var file = await _db.UserFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.UserId == userId)
            ?? throw new InvalidOperationException("File not found.");

        var templates = await _db.EmailTemplates
            .Where(t => t.UserId == userId && t.AttachmentFileIds != null)
            .ToListAsync();

        foreach (var template in templates)
        {
            var fileIds = ParseFileIds(template.AttachmentFileIds);
            if (!fileIds.Remove(fileId))
            {
                continue;
            }

            template.AttachmentFileIds = fileIds.Count == 0
                ? null
                : JsonSerializer.Serialize(fileIds);
            template.UpdatedAt = DateTime.UtcNow;
        }

        var filePath = Path.Combine(_storagePath, file.StoredName);
        if (File.Exists(filePath))
            File.Delete(filePath);

        _db.UserFiles.Remove(file);
        await _db.SaveChangesAsync();
    }

    public async Task<(Stream stream, string fileName, string mimeType)?> DownloadAsync(Guid userId, Guid fileId)
    {
        var file = await _db.UserFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.UserId == userId);
        if (file == null) return null;

        var filePath = Path.Combine(_storagePath, file.StoredName);
        if (!File.Exists(filePath)) return null;

        var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        return (stream, file.OriginalName, file.MimeType);
    }

    public async Task<List<UserFile>> GetByIdsAsync(List<Guid> fileIds)
    {
        return await _db.UserFiles
            .Where(f => fileIds.Contains(f.Id))
            .ToListAsync();
    }

    public string GetStoragePath() => _storagePath;

    private static List<Guid> ParseFileIds(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new List<Guid>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<Guid>>(json) ?? new List<Guid>();
        }
        catch
        {
            return new List<Guid>();
        }
    }
}
