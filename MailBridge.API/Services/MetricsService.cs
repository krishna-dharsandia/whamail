using MailBridge.API.Data;
using MailBridge.API.DTOs;
using Microsoft.EntityFrameworkCore;

namespace MailBridge.API.Services;

public interface IMetricsService
{
    Task<MetricsOverviewResponse> GetOverviewAsync(Guid userId);
    Task<List<DailyEmailStat>> GetEmailsPerDayAsync(Guid userId, int days = 30);
    Task<List<MonthlyEmailStat>> GetEmailsPerMonthAsync(Guid userId, int months = 12);
    Task<List<BroadcastStatusStat>> GetBroadcastStatusStatsAsync(Guid userId);
}

public class MetricsService : IMetricsService
{
    private readonly MailBridgeDbContext _db;

    public MetricsService(MailBridgeDbContext db) => _db = db;

    public async Task<MetricsOverviewResponse> GetOverviewAsync(Guid userId)
    {
        var today = DateTime.UtcNow.Date;
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var sentToday = await _db.EmailQueues
            .CountAsync(q => q.UserId == userId && q.Status == "Sent" && q.SentAt >= today);

        var sentThisMonth = await _db.EmailQueues
            .CountAsync(q => q.UserId == userId && q.Status == "Sent" && q.SentAt >= monthStart);

        var sentAllTime = await _db.EmailQueues
            .CountAsync(q => q.UserId == userId && q.Status == "Sent");

        var totalAudiences = await _db.Audiences
            .CountAsync(a => a.UserId == userId);

        var totalContacts = await _db.Contacts
            .CountAsync(c => c.Audience!.UserId == userId);

        var totalBroadcasts = await _db.Broadcasts
            .CountAsync(b => b.UserId == userId);

        var activeBroadcasts = await _db.Broadcasts
            .CountAsync(b => b.UserId == userId && b.Status == "Sending");

        var pendingEmails = await _db.EmailQueues
            .CountAsync(q => q.UserId == userId && (q.Status == "Pending" || q.Status == "Sending"));

        var failedEmails = await _db.EmailQueues
            .CountAsync(q => q.UserId == userId && q.Status == "Failed");

        return new MetricsOverviewResponse(
            sentToday, sentThisMonth, sentAllTime,
            totalAudiences, totalContacts,
            totalBroadcasts, activeBroadcasts,
            pendingEmails, failedEmails);
    }

    public async Task<List<DailyEmailStat>> GetEmailsPerDayAsync(Guid userId, int days = 30)
    {
        var from = DateTime.UtcNow.Date.AddDays(-(days - 1));

        var raw = await _db.EmailQueues
            .Where(q => q.UserId == userId && q.Status == "Sent" && q.SentAt >= from)
            .GroupBy(q => q.SentAt!.Value.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .ToListAsync();

        // Fill in zeros for days with no emails
        return Enumerable.Range(0, days)
            .Select(i => from.AddDays(i))
            .Select(date => new DailyEmailStat(
                date.ToString("yyyy-MM-dd"),
                raw.FirstOrDefault(r => r.Date == date)?.Count ?? 0))
            .ToList();
    }

    public async Task<List<MonthlyEmailStat>> GetEmailsPerMonthAsync(Guid userId, int months = 12)
    {
        var from = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc)
            .AddMonths(-(months - 1));

        var raw = await _db.EmailQueues
            .Where(q => q.UserId == userId && q.Status == "Sent" && q.SentAt >= from)
            .GroupBy(q => new { q.SentAt!.Value.Year, q.SentAt!.Value.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .ToListAsync();

        return Enumerable.Range(0, months)
            .Select(i => from.AddMonths(i))
            .Select(date => new MonthlyEmailStat(
                date.ToString("MMM yyyy"),
                raw.FirstOrDefault(r => r.Year == date.Year && r.Month == date.Month)?.Count ?? 0))
            .ToList();
    }

    public async Task<List<BroadcastStatusStat>> GetBroadcastStatusStatsAsync(Guid userId)
    {
        return await _db.Broadcasts
            .Where(b => b.UserId == userId)
            .GroupBy(b => b.Status)
            .Select(g => new BroadcastStatusStat(g.Key, g.Count()))
            .ToListAsync();
    }
}
