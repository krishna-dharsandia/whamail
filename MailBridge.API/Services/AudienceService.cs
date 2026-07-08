using MailBridge.API.Data;
using MailBridge.API.DTOs;
using MailBridge.API.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace MailBridge.API.Services;

public interface IAudienceService
{
    Task<List<AudienceResponse>> GetAllAsync(Guid userId);
    Task<AudienceResponse> GetByIdAsync(Guid userId, Guid audienceId);
    Task<AudienceResponse> CreateAsync(Guid userId, CreateAudienceRequest request);
    Task DeleteAsync(Guid userId, Guid audienceId);
    Task<List<ContactResponse>> GetContactsAsync(Guid userId, Guid audienceId);
    Task<ContactResponse> AddContactAsync(Guid userId, Guid audienceId, AddContactRequest request);
    Task DeleteContactAsync(Guid userId, Guid audienceId, Guid contactId);
    Task<(int added, int skipped)> UploadCsvAsync(Guid userId, Guid audienceId, string csvContent);
}

public class AudienceService : IAudienceService
{
    private readonly MailBridgeDbContext _db;

    public AudienceService(MailBridgeDbContext db) => _db = db;

    public async Task<List<AudienceResponse>> GetAllAsync(Guid userId)
    {
        return await _db.Audiences
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new AudienceResponse(
                a.Id, a.Name,
                a.Contacts.Count,
                a.CreatedAt))
            .ToListAsync();
    }

    public async Task<AudienceResponse> GetByIdAsync(Guid userId, Guid audienceId)
    {
        var a = await _db.Audiences
            .Include(x => x.Contacts)
            .FirstOrDefaultAsync(x => x.Id == audienceId && x.UserId == userId)
            ?? throw new InvalidOperationException("Audience not found.");

        return new AudienceResponse(a.Id, a.Name, a.Contacts.Count, a.CreatedAt);
    }

    public async Task<AudienceResponse> CreateAsync(Guid userId, CreateAudienceRequest request)
    {
        var audience = new Audience
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.Name.Trim(),
            CreatedAt = DateTime.UtcNow,
        };

        _db.Audiences.Add(audience);
        await _db.SaveChangesAsync();

        return new AudienceResponse(audience.Id, audience.Name, 0, audience.CreatedAt);
    }

    public async Task DeleteAsync(Guid userId, Guid audienceId)
    {
        var audience = await _db.Audiences.FirstOrDefaultAsync(a => a.Id == audienceId && a.UserId == userId)
            ?? throw new InvalidOperationException("Audience not found.");

        _db.Audiences.Remove(audience);
        await _db.SaveChangesAsync();
    }

    public async Task<List<ContactResponse>> GetContactsAsync(Guid userId, Guid audienceId)
    {
        // Verify audience ownership
        var exists = await _db.Audiences.AnyAsync(a => a.Id == audienceId && a.UserId == userId);
        if (!exists) throw new InvalidOperationException("Audience not found.");

        return await _db.Contacts
            .Where(c => c.AudienceId == audienceId)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new ContactResponse(c.Id, c.Email, c.Name, c.CreatedAt))
            .ToListAsync();
    }

    public async Task<ContactResponse> AddContactAsync(Guid userId, Guid audienceId, AddContactRequest request)
    {
        var audience = await _db.Audiences.FirstOrDefaultAsync(a => a.Id == audienceId && a.UserId == userId)
            ?? throw new InvalidOperationException("Audience not found.");

        var email = request.Email.Trim().ToLower();
        if (!IsValidEmail(email)) throw new InvalidOperationException("Invalid email address.");

        var exists = await _db.Contacts.AnyAsync(c => c.AudienceId == audienceId && c.Email == email);
        if (exists) throw new InvalidOperationException("Contact already exists in this audience.");

        var contact = new Contact
        {
            Id = Guid.NewGuid(),
            AudienceId = audienceId,
            Email = email,
            Name = request.Name?.Trim(),
            CreatedAt = DateTime.UtcNow,
        };

        _db.Contacts.Add(contact);
        await _db.SaveChangesAsync();

        return new ContactResponse(contact.Id, contact.Email, contact.Name, contact.CreatedAt);
    }

    public async Task DeleteContactAsync(Guid userId, Guid audienceId, Guid contactId)
    {
        var audience = await _db.Audiences.AnyAsync(a => a.Id == audienceId && a.UserId == userId);
        if (!audience) throw new InvalidOperationException("Audience not found.");

        var contact = await _db.Contacts.FirstOrDefaultAsync(c => c.Id == contactId && c.AudienceId == audienceId)
            ?? throw new InvalidOperationException("Contact not found.");

        _db.Contacts.Remove(contact);
        await _db.SaveChangesAsync();
    }

    public async Task<(int added, int skipped)> UploadCsvAsync(Guid userId, Guid audienceId, string csvContent)
    {
        var audience = await _db.Audiences.FirstOrDefaultAsync(a => a.Id == audienceId && a.UserId == userId)
            ?? throw new InvalidOperationException("Audience not found.");

        var lines = csvContent
            .Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrWhiteSpace(l))
            .ToList();

        if (lines.Count == 0) return (0, 0);

        // Skip header row if first line looks like a header
        var startIndex = 0;
        var firstLine = lines[0].ToLower();
        if (firstLine.Contains("email") || firstLine.Contains("name"))
            startIndex = 1;

        var existingEmailsList = await _db.Contacts
            .Where(c => c.AudienceId == audienceId)
            .Select(c => c.Email)
            .ToListAsync();
        var existingEmails = new HashSet<string>(existingEmailsList);

        int added = 0, skipped = 0;
        var newContacts = new List<Contact>();

        foreach (var line in lines.Skip(startIndex))
        {
            var parts = line.Split(',');
            var email = parts[0].Trim().ToLower().Trim('"');
            var name = parts.Length > 1 ? parts[1].Trim().Trim('"') : null;

            if (string.IsNullOrEmpty(email) || !IsValidEmail(email))
            {
                skipped++;
                continue;
            }

            if (existingEmails.Contains(email))
            {
                skipped++;
                continue;
            }

            existingEmails.Add(email);
            newContacts.Add(new Contact
            {
                Id = Guid.NewGuid(),
                AudienceId = audienceId,
                Email = email,
                Name = string.IsNullOrEmpty(name) ? null : name,
                CreatedAt = DateTime.UtcNow,
            });
            added++;
        }

        if (newContacts.Count > 0)
        {
            _db.Contacts.AddRange(newContacts);
            await _db.SaveChangesAsync();
        }

        return (added, skipped);
    }

    private static bool IsValidEmail(string email)
    {
        return Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$");
    }
}
