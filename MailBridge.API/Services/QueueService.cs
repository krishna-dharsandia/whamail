using System.Text.Json;
using MailBridge.API.Data;
using MailBridge.API.DTOs;
using MailBridge.API.Models;
using Microsoft.EntityFrameworkCore;

namespace MailBridge.API.Services;

public interface IQueueService
{
    Task<List<QueueItemResponse>> GetQueueAsync(Guid userId, string? status = null, int page = 1, int pageSize = 50);
    Task<QueueStatsResponse> GetStatsAsync(Guid userId);
    Task<List<QueueItemResponse>> EnqueueBatchAsync(Guid userId, QueueBatchRequest request);
    Task<List<QueueItemResponse>> EnqueueForBroadcastAsync(Guid userId, Guid broadcastId, List<QueueEmailRequest> emails);
    Task CancelPendingAsync(Guid userId, Guid queueId);
}

public class QueueService : IQueueService
{
    private readonly MailBridgeDbContext _db;
    private readonly ITemplateService _templateService;

    public QueueService(MailBridgeDbContext db, ITemplateService templateService)
    {
        _db = db;
        _templateService = templateService;
    }

    public async Task<List<QueueItemResponse>> GetQueueAsync(Guid userId, string? status, int page, int pageSize)
    {
        var query = _db.EmailQueues.Where(q => q.UserId == userId);

        if (!string.IsNullOrEmpty(status))
            query = query.Where(q => q.Status == status);

        return await query
            .OrderByDescending(q => q.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(q => new QueueItemResponse(q.Id, q.Recipient, q.PhoneNumber, q.Channel, q.Subject, q.Status, q.ErrorInfo, q.CreatedAt, q.SentAt, q.BroadcastId))
            .ToListAsync();
    }

    public async Task<QueueStatsResponse> GetStatsAsync(Guid userId)
    {
        var queues = await _db.EmailQueues
            .Where(q => q.UserId == userId)
            .GroupBy(q => q.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        return new QueueStatsResponse(
            Total: queues.Sum(q => q.Count),
            Pending: queues.FirstOrDefault(q => q.Status == nameof(EmailStatus.Pending))?.Count ?? 0,
            Sent: queues.FirstOrDefault(q => q.Status == nameof(EmailStatus.Sent))?.Count ?? 0,
            Failed: queues.FirstOrDefault(q => q.Status == nameof(EmailStatus.Failed))?.Count ?? 0,
            Sending: queues.FirstOrDefault(q => q.Status == nameof(EmailStatus.Sending))?.Count ?? 0
        );
    }

    public async Task<List<QueueItemResponse>> EnqueueBatchAsync(Guid userId, QueueBatchRequest request)
    {
        // Check quota
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        var limit = user.Role == "workspace" ? 5000 : 500;
        var currentCount = await _db.EmailQueues.CountAsync(q => q.UserId == userId &&
            (q.Status == nameof(EmailStatus.Pending) || q.Status == nameof(EmailStatus.Sending)));

        if (currentCount + request.Emails.Count > limit)
            throw new InvalidOperationException($"Queue limit exceeded. You can queue up to {limit} emails. Currently {currentCount} in queue.");

        var queueItems = new List<EmailQueue>();

        foreach (var email in request.Emails)
        {
            var subject = email.Subject ?? "";
            var body = email.Body ?? "";

            // If template ID is provided, resolve template
            if (email.TemplateId.HasValue)
            {
                var template = await _db.EmailTemplates.FindAsync(email.TemplateId.Value);
                if (template != null)
                {
                    subject = template.SubjectTemplate;
                    body = template.BodyTemplate;

                    // Apply merge data
                    if (email.MergeData != null)
                    {
                        foreach (var kv in email.MergeData)
                        {
                            subject = subject.Replace($"{{{{{kv.Key}}}}}", kv.Value);
                            body = body.Replace($"{{{{{kv.Key}}}}}", kv.Value);
                        }
                    }
                }
            }

            var item = new EmailQueue
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                TemplateId = email.TemplateId,
                Recipient = email.Recipient,
                PhoneNumber = email.PhoneNumber,
                Channel = email.Channel,
                Subject = subject,
                Body = body,
                Status = nameof(EmailStatus.Pending),
                MergeData = email.MergeData != null ? JsonSerializer.Serialize(email.MergeData) : null,
                CreatedAt = DateTime.UtcNow
            };

            queueItems.Add(item);
        }

        _db.EmailQueues.AddRange(queueItems);
        await _db.SaveChangesAsync();

        return queueItems.Select(q =>
            new QueueItemResponse(q.Id, q.Recipient, q.PhoneNumber, q.Channel, q.Subject, q.Status, q.ErrorInfo, q.CreatedAt, q.SentAt, q.BroadcastId)
        ).ToList();
    }

    public async Task<List<QueueItemResponse>> EnqueueForBroadcastAsync(Guid userId, Guid broadcastId, List<QueueEmailRequest> emails)
    {
        var queueItems = new List<EmailQueue>();

        foreach (var email in emails)
        {
            var subject = email.Subject ?? "";
            var body = email.Body ?? "";

            if (email.TemplateId.HasValue)
            {
                var template = await _db.EmailTemplates.FindAsync(email.TemplateId.Value);
                if (template != null)
                {
                    subject = string.IsNullOrEmpty(email.Subject) ? template.SubjectTemplate : email.Subject;
                    body = template.BodyTemplate;

                    if (email.MergeData != null)
                    {
                        foreach (var kv in email.MergeData)
                        {
                            subject = subject.Replace($"{{{{{kv.Key}}}}}", kv.Value);
                            body = body.Replace($"{{{{{kv.Key}}}}}", kv.Value);
                        }
                    }
                }
            }

            queueItems.Add(new EmailQueue
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                BroadcastId = broadcastId,
                TemplateId = email.TemplateId,
                Recipient = email.Recipient,
                PhoneNumber = email.PhoneNumber,
                Channel = email.Channel,
                Subject = subject,
                Body = body,
                Status = nameof(EmailStatus.Pending),
                MergeData = email.MergeData != null ? System.Text.Json.JsonSerializer.Serialize(email.MergeData) : null,
                CreatedAt = DateTime.UtcNow,
            });
        }

        _db.EmailQueues.AddRange(queueItems);
        await _db.SaveChangesAsync();

        return queueItems.Select(q =>
            new QueueItemResponse(q.Id, q.Recipient, q.PhoneNumber, q.Channel, q.Subject, q.Status, q.ErrorInfo, q.CreatedAt, q.SentAt, q.BroadcastId)
        ).ToList();
    }

    public async Task CancelPendingAsync(Guid userId, Guid queueId)
    {
        var item = await _db.EmailQueues.FirstOrDefaultAsync(q => q.Id == queueId && q.UserId == userId && q.Status == nameof(EmailStatus.Pending))
            ?? throw new InvalidOperationException("Queue item not found or not cancellable.");

        _db.EmailQueues.Remove(item);
        await _db.SaveChangesAsync();
    }
}
