using Whamail.API.Data;
using Whamail.API.DTOs;
using Whamail.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Whamail.API.Services;

public interface IWhatsAppService
{
    Task<WhatsAppSessionDto?> GetSessionAsync(Guid userId);
    Task<WhatsAppSessionDto> SaveSessionAsync(Guid userId, ConnectWhatsAppRequest request);
    Task RemoveSessionAsync(Guid userId);
    Task<WhatsAppStatusDto> GetStatusAsync(Guid userId);

    // ----- Send queue: the desktop app pulls pending messages and reports each result -----
    Task<WhatsAppPendingResponse> GetPendingAsync(Guid userId, Guid? broadcastId, int limit);
    Task<WhatsAppQueueStatsDto> GetQueueStatsAsync(Guid userId, Guid? broadcastId);
    Task<bool> ClaimAsync(Guid userId, Guid queueId);
    Task<bool> RecordResultAsync(Guid userId, Guid queueId, WhatsAppSendResultRequest request);
    Task<int> RecoverInterruptedAsync(Guid userId);
    Task<int> RetryFailedAsync(Guid userId, Guid? broadcastId);
}

public class WhatsAppService : IWhatsAppService
{
    private const string Channel = "whatsapp";
    private const string InterruptedError =
        "Interrupted before WhatsApp confirmed delivery. Check the chat before retrying.";

    private readonly MailBridgeDbContext _db;

    public WhatsAppService(MailBridgeDbContext db) => _db = db;

    public async Task<WhatsAppSessionDto?> GetSessionAsync(Guid userId)
    {
        var session = await _db.WhatsAppSessions
            .FirstOrDefaultAsync(s => s.UserId == userId && s.IsActive);

        if (session == null) return null;

        return new WhatsAppSessionDto(
            session.Id,
            session.PhoneNumber,
            session.PushName,
            session.Platform,
            session.IsActive,
            session.ConnectedAt);
    }

    public async Task<WhatsAppSessionDto> SaveSessionAsync(Guid userId, ConnectWhatsAppRequest request)
    {
        // Find ANY existing session (not just active) — unique index on UserId means only one row per user
        var existing = await _db.WhatsAppSessions
            .FirstOrDefaultAsync(s => s.UserId == userId);

        if (existing != null)
        {
            existing.PhoneNumber = request.PhoneNumber ?? existing.PhoneNumber;
            existing.PushName = request.PushName ?? existing.PushName;
            existing.Platform = request.Platform ?? existing.Platform;
            existing.ConnectedAt = DateTime.UtcNow;
            existing.IsActive = true;
        }
        else
        {
            existing = new WhatsAppSession
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                PhoneNumber = request.PhoneNumber ?? "",
                PushName = request.PushName ?? "",
                Platform = request.Platform,
                IsActive = true,
                ConnectedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
            };
            _db.WhatsAppSessions.Add(existing);
        }

        await _db.SaveChangesAsync();

        return new WhatsAppSessionDto(
            existing.Id,
            existing.PhoneNumber,
            existing.PushName,
            existing.Platform,
            existing.IsActive,
            existing.ConnectedAt);
    }

    public async Task RemoveSessionAsync(Guid userId)
    {
        var sessions = await _db.WhatsAppSessions
            .Where(s => s.UserId == userId)
            .ToListAsync();

        foreach (var session in sessions)
        {
            session.IsActive = false;
        }

        await _db.SaveChangesAsync();
    }

    public async Task<WhatsAppStatusDto> GetStatusAsync(Guid userId)
    {
        var session = await _db.WhatsAppSessions
            .FirstOrDefaultAsync(s => s.UserId == userId && s.IsActive);

        if (session == null)
        {
            return new WhatsAppStatusDto("disconnected", null, null, null, null, null);
        }

        return new WhatsAppStatusDto(
            "connected",
            null,
            session.PhoneNumber,
            session.PushName,
            session.Platform,
            session.ConnectedAt);
    }

    public async Task<WhatsAppPendingResponse> GetPendingAsync(Guid userId, Guid? broadcastId, int limit)
    {
        limit = Math.Clamp(limit, 1, 500);

        var query = _db.EmailQueues.Where(q =>
            q.UserId == userId && q.Channel == Channel && q.Status == nameof(EmailStatus.Pending));

        if (broadcastId.HasValue)
            query = query.Where(q => q.BroadcastId == broadcastId.Value);

        var totalPending = await query.CountAsync();

        var items = await query
            .OrderBy(q => q.CreatedAt)
            .ThenBy(q => q.Id)
            .Take(limit)
            .Select(q => new WhatsAppQueueItemDto(q.Id, q.PhoneNumber ?? q.Recipient, q.Body, q.BroadcastId))
            .ToListAsync();

        return new WhatsAppPendingResponse(items, totalPending);
    }

    public async Task<WhatsAppQueueStatsDto> GetQueueStatsAsync(Guid userId, Guid? broadcastId)
    {
        var query = _db.EmailQueues.Where(q => q.UserId == userId && q.Channel == Channel);

        if (broadcastId.HasValue)
            query = query.Where(q => q.BroadcastId == broadcastId.Value);

        var stats = await query
            .GroupBy(q => q.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        int CountOf(EmailStatus status) => stats.FirstOrDefault(s => s.Status == status.ToString())?.Count ?? 0;

        return new WhatsAppQueueStatsDto(
            CountOf(EmailStatus.Pending),
            CountOf(EmailStatus.Sending),
            CountOf(EmailStatus.Sent),
            CountOf(EmailStatus.Failed),
            CountOf(EmailStatus.Skipped));
    }

    /// <summary>
    /// Atomically moves one item from Pending to Sending. Returns false when it is
    /// no longer pending (cancelled, or already picked up), so it is never sent twice.
    /// </summary>
    public async Task<bool> ClaimAsync(Guid userId, Guid queueId)
    {
        var claimed = await _db.EmailQueues
            .Where(q => q.Id == queueId
                        && q.UserId == userId
                        && q.Channel == Channel
                        && q.Status == nameof(EmailStatus.Pending))
            .ExecuteUpdateAsync(s => s.SetProperty(q => q.Status, nameof(EmailStatus.Sending)));

        return claimed == 1;
    }

    /// <summary>Records the outcome of one send. Returns false when the item no longer exists.</summary>
    public async Task<bool> RecordResultAsync(Guid userId, Guid queueId, WhatsAppSendResultRequest request)
    {
        var status = request.Status?.Trim().ToLowerInvariant() switch
        {
            "sent" => EmailStatus.Sent,
            "failed" => EmailStatus.Failed,
            "skipped" => EmailStatus.Skipped,
            _ => throw new InvalidOperationException("Status must be Sent, Failed or Skipped."),
        };

        var item = await _db.EmailQueues
            .FirstOrDefaultAsync(q => q.Id == queueId && q.UserId == userId && q.Channel == Channel);

        if (item == null) return false;

        // A delivered message stays delivered, whatever is reported afterwards.
        if (item.Status == nameof(EmailStatus.Sent)) return true;

        item.Status = status.ToString();

        if (status == EmailStatus.Sent)
        {
            item.SentAt = DateTime.UtcNow;
            item.ErrorInfo = null;

            var user = await _db.Users.FindAsync(userId);
            if (user != null) user.MessagesSent += 1;
        }
        else
        {
            var error = string.IsNullOrWhiteSpace(request.Error) ? "Unknown error" : request.Error.Trim();
            item.ErrorInfo = error.Length > 1000 ? error[..1000] : error;
        }

        await _db.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Items still marked Sending when a run starts were interrupted mid-send (app
    /// closed or crashed). Whether WhatsApp delivered them is unknown, so they are
    /// failed with a clear reason instead of being resent automatically.
    /// </summary>
    public async Task<int> RecoverInterruptedAsync(Guid userId)
    {
        var stuck = await _db.EmailQueues
            .Where(q => q.UserId == userId && q.Channel == Channel && q.Status == nameof(EmailStatus.Sending))
            .ToListAsync();

        foreach (var item in stuck)
        {
            item.Status = nameof(EmailStatus.Failed);
            item.ErrorInfo = InterruptedError;
        }

        if (stuck.Count > 0) await _db.SaveChangesAsync();
        return stuck.Count;
    }

    /// <summary>Puts failed messages back in the queue. Skipped ones stay skipped.</summary>
    public async Task<int> RetryFailedAsync(Guid userId, Guid? broadcastId)
    {
        var query = _db.EmailQueues.Where(q =>
            q.UserId == userId && q.Channel == Channel && q.Status == nameof(EmailStatus.Failed));

        if (broadcastId.HasValue)
            query = query.Where(q => q.BroadcastId == broadcastId.Value);

        var failed = await query.ToListAsync();
        if (failed.Count == 0) return 0;

        foreach (var item in failed)
        {
            item.Status = nameof(EmailStatus.Pending);
            item.ErrorInfo = null;
        }

        // Reopen the affected broadcasts so their progress is tracked again.
        var broadcastIds = failed
            .Where(q => q.BroadcastId.HasValue)
            .Select(q => q.BroadcastId!.Value)
            .Distinct()
            .ToList();

        if (broadcastIds.Count > 0)
        {
            var broadcasts = await _db.Broadcasts
                .Where(b => b.UserId == userId && broadcastIds.Contains(b.Id))
                .ToListAsync();

            foreach (var broadcast in broadcasts)
            {
                if (broadcast.Status == "Completed" || broadcast.Status == "Failed")
                    broadcast.Status = "Sending";
            }
        }

        await _db.SaveChangesAsync();
        return failed.Count;
    }
}
