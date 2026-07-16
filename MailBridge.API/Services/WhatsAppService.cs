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
}

public class WhatsAppService : IWhatsAppService
{
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
}
