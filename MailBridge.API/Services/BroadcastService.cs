using System.Text.RegularExpressions;
using MailBridge.API.Data;
using MailBridge.API.DTOs;
using MailBridge.API.Models;
using Microsoft.EntityFrameworkCore;

namespace MailBridge.API.Services;

public interface IBroadcastService
{
    Task<List<BroadcastResponse>> GetAllAsync(Guid userId);
    Task<BroadcastResponse> GetByIdAsync(Guid userId, Guid broadcastId);
    Task<BroadcastDetailResponse> GetDetailAsync(Guid userId, Guid broadcastId);
    Task<BroadcastResponse> CreateAsync(Guid userId, CreateBroadcastRequest request);
    Task<BroadcastResponse> SendAsync(Guid userId, Guid broadcastId);
    Task<BroadcastResponse> SendRemainingAsync(Guid userId, Guid broadcastId);
    Task DeleteAsync(Guid userId, Guid broadcastId);
}

public class BroadcastService : IBroadcastService
{
    private readonly MailBridgeDbContext _db;
    private readonly IQueueService _queueService;

    public BroadcastService(MailBridgeDbContext db, IQueueService queueService)
    {
        _db = db;
        _queueService = queueService;
    }

    public async Task<List<BroadcastResponse>> GetAllAsync(Guid userId)
    {
        var broadcasts = await _db.Broadcasts
            .Include(b => b.Audience)
            .Include(b => b.Template)
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.CreatedAt)
            .ToListAsync();

        // Sync status for Sending broadcasts
        foreach (var b in broadcasts.Where(b => b.Status == "Sending"))
            await SyncStatusAsync(b);

        await _db.SaveChangesAsync();

        return broadcasts.Select(MapToResponse).ToList();
    }

    public async Task<BroadcastResponse> GetByIdAsync(Guid userId, Guid broadcastId)
    {
        var b = await _db.Broadcasts
            .Include(x => x.Audience)
            .Include(x => x.Template)
            .FirstOrDefaultAsync(x => x.Id == broadcastId && x.UserId == userId)
            ?? throw new InvalidOperationException("Broadcast not found.");

        if (b.Status == "Sending")
        {
            await SyncStatusAsync(b);
            await _db.SaveChangesAsync();
        }

        return MapToResponse(b);
    }

    public async Task<BroadcastDetailResponse> GetDetailAsync(Guid userId, Guid broadcastId)
    {
        var b = await _db.Broadcasts
            .Include(x => x.Audience)
            .ThenInclude(a => a!.Contacts)
            .Include(x => x.Template)
            .FirstOrDefaultAsync(x => x.Id == broadcastId && x.UserId == userId)
            ?? throw new InvalidOperationException("Broadcast not found.");

        if (b.Status == "Sending")
        {
            await SyncStatusAsync(b);
            await _db.SaveChangesAsync();
        }

        // Load queue items for this broadcast, keyed by recipient email
        var queueLookup = await _db.EmailQueues
            .Where(q => q.BroadcastId == broadcastId)
            .GroupBy(q => q.Recipient.ToLower())
            .Select(g => new
            {
                Email = g.Key,
                Status = g.First().Status,
                SentAt = g.Min(q => q.SentAt),
            })
            .ToDictionaryAsync(x => x.Email, x => x);

        var contacts = (b.Audience?.Contacts ?? new List<Contact>())
            .Select(c =>
            {
                var key = c.Email.ToLower();
                queueLookup.TryGetValue(key, out var q);
                return new BroadcastContactDto(
                    c.Email, c.Name,
                    q?.Status,
                    q?.SentAt
                );
            })
            .ToList();

        var invalidCount = contacts.Count(c => !IsValidEmail(c.Email));
        var notQueuedCount = contacts.Count(c => c.QueueStatus == null && IsValidEmail(c.Email));

        return new BroadcastDetailResponse(
            MapToResponse(b),
            contacts,
            invalidCount,
            notQueuedCount
        );
    }

    private static bool IsValidEmail(string email)
    {
        return Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$");
    }

    public async Task<BroadcastResponse> CreateAsync(Guid userId, CreateBroadcastRequest request)
    {
        // Verify audience belongs to user
        var audience = await _db.Audiences.FirstOrDefaultAsync(a => a.Id == request.AudienceId && a.UserId == userId)
            ?? throw new InvalidOperationException("Audience not found.");

        // Verify template belongs to user
        var template = await _db.EmailTemplates.FirstOrDefaultAsync(t => t.Id == request.TemplateId && t.UserId == userId)
            ?? throw new InvalidOperationException("Template not found.");

        var broadcast = new Broadcast
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            AudienceId = request.AudienceId,
            TemplateId = request.TemplateId,
            Name = request.Name.Trim(),
            SubjectOverride = request.SubjectOverride?.Trim(),
            Status = "Draft",
            CreatedAt = DateTime.UtcNow,
        };

        _db.Broadcasts.Add(broadcast);
        await _db.SaveChangesAsync();

        broadcast.Audience = audience;
        broadcast.Template = template;

        return MapToResponse(broadcast);
    }

    public async Task<BroadcastResponse> SendAsync(Guid userId, Guid broadcastId)
    {
        var broadcast = await _db.Broadcasts
            .Include(b => b.Audience)
            .ThenInclude(a => a!.Contacts)
            .Include(b => b.Template)
            .FirstOrDefaultAsync(b => b.Id == broadcastId && b.UserId == userId)
            ?? throw new InvalidOperationException("Broadcast not found.");

        if (broadcast.Status != "Draft")
            throw new InvalidOperationException("Only Draft broadcasts can be sent.");

        var contacts = broadcast.Audience?.Contacts?.ToList() ?? new List<Contact>();
        if (contacts.Count == 0)
            throw new InvalidOperationException("Audience has no contacts.");

        // Check credentials exist
        var hasCredentials = await _db.UserCredentials.AnyAsync(c => c.UserId == userId);
        if (!hasCredentials)
            throw new InvalidOperationException("Gmail credentials not configured. Go to Settings first.");

        var subject = broadcast.SubjectOverride ?? broadcast.Template?.SubjectTemplate ?? "No Subject";

        // Enqueue all emails for this broadcast
        var emailRequests = contacts.Select(c => new QueueEmailRequest(
            Recipient: c.Email,
            TemplateId: broadcast.TemplateId,
            Subject: subject,
            Body: null, // template body will be resolved by queue service
            MergeData: new Dictionary<string, string>
            {
                { "name", c.Name ?? c.Email },
                { "email", c.Email },
            }
        )).ToList();

        // Enqueue and link to broadcast
        await _queueService.EnqueueForBroadcastAsync(userId, broadcastId, emailRequests);

        broadcast.Status = "Sending";
        broadcast.TotalRecipients = contacts.Count;
        broadcast.SentAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return MapToResponse(broadcast);
    }

    public async Task<BroadcastResponse> SendRemainingAsync(Guid userId, Guid broadcastId)
    {
        var broadcast = await _db.Broadcasts
            .Include(b => b.Audience)
            .ThenInclude(a => a!.Contacts)
            .Include(b => b.Template)
            .FirstOrDefaultAsync(b => b.Id == broadcastId && b.UserId == userId)
            ?? throw new InvalidOperationException("Broadcast not found.");

        if (broadcast.Status != "Completed" && broadcast.Status != "Draft" && broadcast.Status != "Sending")
            throw new InvalidOperationException("Cannot send remaining for this broadcast status.");

        // Find which recipient emails are already in the queue
        var existingEmails = await _db.EmailQueues
            .Where(q => q.BroadcastId == broadcastId)
            .Select(q => q.Recipient.ToLower())
            .Distinct()
            .ToListAsync();
        var existingSet = new HashSet<string>(existingEmails);

        var contacts = (broadcast.Audience?.Contacts ?? new List<Contact>())
            .Where(c => !existingSet.Contains(c.Email.ToLower()) && IsValidEmail(c.Email))
            .ToList();

        if (contacts.Count == 0)
            throw new InvalidOperationException("No remaining contacts to send to.");

        // Check credentials exist
        var hasCredentials = await _db.UserCredentials.AnyAsync(c => c.UserId == userId);
        if (!hasCredentials)
            throw new InvalidOperationException("Gmail credentials not configured. Go to Settings first.");

        var subject = broadcast.SubjectOverride ?? broadcast.Template?.SubjectTemplate ?? "No Subject";

        var emailRequests = contacts.Select(c => new QueueEmailRequest(
            Recipient: c.Email,
            TemplateId: broadcast.TemplateId,
            Subject: subject,
            Body: null,
            MergeData: new Dictionary<string, string>
            {
                { "name", c.Name ?? c.Email },
                { "email", c.Email },
            }
        )).ToList();

        await _queueService.EnqueueForBroadcastAsync(userId, broadcastId, emailRequests);

        // Update counts
        broadcast.TotalRecipients += contacts.Count;
        if (broadcast.Status == "Draft" || broadcast.Status == "Completed")
        {
            broadcast.Status = "Sending";
            broadcast.SentAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return MapToResponse(broadcast);
    }

    public async Task DeleteAsync(Guid userId, Guid broadcastId)
    {
        var broadcast = await _db.Broadcasts.FirstOrDefaultAsync(b => b.Id == broadcastId && b.UserId == userId)
            ?? throw new InvalidOperationException("Broadcast not found.");

        if (broadcast.Status == "Sending")
            throw new InvalidOperationException("Cannot delete a broadcast that is currently sending.");

        _db.Broadcasts.Remove(broadcast);
        await _db.SaveChangesAsync();
    }

    // Sync broadcast status from queue counts
    private async Task SyncStatusAsync(Broadcast broadcast)
    {
        if (broadcast.TotalRecipients == 0) return;

        var stats = await _db.EmailQueues
            .Where(q => q.BroadcastId == broadcast.Id)
            .GroupBy(q => q.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        var sent = stats.FirstOrDefault(s => s.Status == "Sent")?.Count ?? 0;
        var failed = stats.FirstOrDefault(s => s.Status == "Failed")?.Count ?? 0;
        var pending = stats.FirstOrDefault(s => s.Status == "Pending")?.Count ?? 0;
        var sending = stats.FirstOrDefault(s => s.Status == "Sending")?.Count ?? 0;

        broadcast.SentCount = sent;
        broadcast.FailedCount = failed;

        if (pending == 0 && sending == 0 && (sent + failed) >= broadcast.TotalRecipients)
        {
            broadcast.Status = failed > 0 && sent == 0 ? "Failed" : "Completed";
        }
    }

    private static BroadcastResponse MapToResponse(Broadcast b) => new(
        b.Id, b.Name, b.Status,
        b.AudienceId, b.Audience?.Name ?? "",
        b.TemplateId, b.Template?.Name ?? "",
        b.SubjectOverride,
        b.TotalRecipients, b.SentCount, b.FailedCount,
        b.CreatedAt, b.SentAt);
}
