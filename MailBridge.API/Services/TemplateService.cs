using System.Text.Json;
using Whamail.API.Data;
using Whamail.API.DTOs;
using Whamail.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Whamail.API.Services;

public interface ITemplateService
{
    Task<List<TemplateResponse>> GetAllAsync(Guid userId);
    Task<TemplateResponse> GetByIdAsync(Guid userId, Guid templateId);
    Task<TemplateResponse> CreateAsync(Guid userId, CreateTemplateRequest request);
    Task<TemplateResponse> UpdateAsync(Guid userId, Guid templateId, UpdateTemplateRequest request);
    Task DeleteAsync(Guid userId, Guid templateId);
}

public class TemplateService : ITemplateService
{
    private readonly MailBridgeDbContext _db;

    public TemplateService(MailBridgeDbContext db) => _db = db;

    public async Task<List<TemplateResponse>> GetAllAsync(Guid userId)
    {
        return await _db.EmailTemplates
            .Where(t => t.UserId == userId)
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => new TemplateResponse(t.Id, t.Name, t.SubjectTemplate, t.BodyTemplate, t.CreatedAt, t.UpdatedAt, ParseFileIds(t.AttachmentFileIds)))
            .ToListAsync();
    }

    public async Task<TemplateResponse> GetByIdAsync(Guid userId, Guid templateId)
    {
        var t = await _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == templateId && t.UserId == userId)
            ?? throw new InvalidOperationException("Template not found.");
        return MapToResponse(t);
    }

    public async Task<TemplateResponse> CreateAsync(Guid userId, CreateTemplateRequest request)
    {
        var attachmentFileIds = await NormalizeFileIdsAsync(userId, request.AttachmentFileIds);

        var template = new EmailTemplate
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.Name,
            SubjectTemplate = request.SubjectTemplate,
            BodyTemplate = request.BodyTemplate,
            AttachmentFileIds = SerializeFileIds(attachmentFileIds),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.EmailTemplates.Add(template);
        await _db.SaveChangesAsync();

        return MapToResponse(template);
    }

    public async Task<TemplateResponse> UpdateAsync(Guid userId, Guid templateId, UpdateTemplateRequest request)
    {
        var template = await _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == templateId && t.UserId == userId)
            ?? throw new InvalidOperationException("Template not found.");

        var attachmentFileIds = await NormalizeFileIdsAsync(userId, request.AttachmentFileIds);

        template.Name = request.Name;
        template.SubjectTemplate = request.SubjectTemplate;
        template.BodyTemplate = request.BodyTemplate;
        template.AttachmentFileIds = SerializeFileIds(attachmentFileIds);
        template.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return MapToResponse(template);
    }

    public async Task DeleteAsync(Guid userId, Guid templateId)
    {
        var template = await _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == templateId && t.UserId == userId)
            ?? throw new InvalidOperationException("Template not found.");

        _db.EmailTemplates.Remove(template);
        await _db.SaveChangesAsync();
    }

    private static TemplateResponse MapToResponse(EmailTemplate t) =>
        new(t.Id, t.Name, t.SubjectTemplate, t.BodyTemplate, t.CreatedAt, t.UpdatedAt, ParseFileIds(t.AttachmentFileIds));

    private static List<Guid>? ParseFileIds(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonSerializer.Deserialize<List<Guid>>(json); }
        catch { return null; }
    }

    private static string? SerializeFileIds(List<Guid>? ids)
    {
        if (ids == null || ids.Count == 0) return null;
        return JsonSerializer.Serialize(ids);
    }

    private async Task<List<Guid>?> NormalizeFileIdsAsync(Guid userId, List<Guid>? ids)
    {
        if (ids == null || ids.Count == 0)
        {
            return null;
        }

        var distinctIds = ids.Distinct().ToList();
        var validIds = await _db.UserFiles
            .Where(f => f.UserId == userId && distinctIds.Contains(f.Id))
            .Select(f => f.Id)
            .ToListAsync();

        return validIds.Count == 0 ? null : validIds;
    }
}
