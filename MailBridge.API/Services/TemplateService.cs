using MailBridge.API.Data;
using MailBridge.API.DTOs;
using MailBridge.API.Models;
using Microsoft.EntityFrameworkCore;

namespace MailBridge.API.Services;

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
            .Select(t => new TemplateResponse(t.Id, t.Name, t.SubjectTemplate, t.BodyTemplate, t.CreatedAt, t.UpdatedAt))
            .ToListAsync();
    }

    public async Task<TemplateResponse> GetByIdAsync(Guid userId, Guid templateId)
    {
        var t = await _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == templateId && t.UserId == userId)
            ?? throw new InvalidOperationException("Template not found.");
        return new TemplateResponse(t.Id, t.Name, t.SubjectTemplate, t.BodyTemplate, t.CreatedAt, t.UpdatedAt);
    }

    public async Task<TemplateResponse> CreateAsync(Guid userId, CreateTemplateRequest request)
    {
        var template = new EmailTemplate
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.Name,
            SubjectTemplate = request.SubjectTemplate,
            BodyTemplate = request.BodyTemplate,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.EmailTemplates.Add(template);
        await _db.SaveChangesAsync();

        return new TemplateResponse(template.Id, template.Name, template.SubjectTemplate, template.BodyTemplate, template.CreatedAt, template.UpdatedAt);
    }

    public async Task<TemplateResponse> UpdateAsync(Guid userId, Guid templateId, UpdateTemplateRequest request)
    {
        var template = await _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == templateId && t.UserId == userId)
            ?? throw new InvalidOperationException("Template not found.");

        template.Name = request.Name;
        template.SubjectTemplate = request.SubjectTemplate;
        template.BodyTemplate = request.BodyTemplate;
        template.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return new TemplateResponse(template.Id, template.Name, template.SubjectTemplate, template.BodyTemplate, template.CreatedAt, template.UpdatedAt);
    }

    public async Task DeleteAsync(Guid userId, Guid templateId)
    {
        var template = await _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == templateId && t.UserId == userId)
            ?? throw new InvalidOperationException("Template not found.");

        _db.EmailTemplates.Remove(template);
        await _db.SaveChangesAsync();
    }
}
