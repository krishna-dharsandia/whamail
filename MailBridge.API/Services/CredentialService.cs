using Whamail.API.Data;
using Whamail.API.DTOs;
using Whamail.API.Models;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace Whamail.API.Services;

public interface ICredentialService
{
    Task<CredentialResponse> SaveAsync(Guid userId, SaveCredentialRequest request);
    Task<CredentialResponse?> GetAsync(Guid userId);
    Task DeleteAsync(Guid userId);
    Task TestConnectionAsync(Guid userId, string toEmail);
}

public class CredentialService : ICredentialService
{
    private readonly MailBridgeDbContext _db;
    private readonly IEncryptionService _encryption;

    public CredentialService(MailBridgeDbContext db, IEncryptionService encryption)
    {
        _db = db;
        _encryption = encryption;
    }

    public async Task<CredentialResponse> SaveAsync(Guid userId, SaveCredentialRequest request)
    {
        var existing = await _db.UserCredentials.FirstOrDefaultAsync(c => c.UserId == userId);

        if (existing != null)
        {
            existing.GmailAddress = request.GmailAddress;
            existing.EncryptedAppPassword = _encryption.Encrypt(request.AppPassword);
            existing.SmtpHost = request.SmtpHost;
            existing.SmtpPort = request.SmtpPort;
            existing.UpdatedAt = DateTime.UtcNow;
            existing.DisplayName = request.DisplayName;
        }
        else
        {
            existing = new UserCredential
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                GmailAddress = request.GmailAddress,
                EncryptedAppPassword = _encryption.Encrypt(request.AppPassword),
                SmtpHost = request.SmtpHost,
                SmtpPort = request.SmtpPort,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                DisplayName = request.DisplayName
            };
            _db.UserCredentials.Add(existing);
        }

        await _db.SaveChangesAsync();
        return new CredentialResponse(existing.Id, existing.GmailAddress, existing.DisplayName,existing.SmtpHost, existing.SmtpPort, existing.CreatedAt);
    }

    public async Task<CredentialResponse?> GetAsync(Guid userId)
    {
        var cred = await _db.UserCredentials.FirstOrDefaultAsync(c => c.UserId == userId);
        if (cred == null) return null;
        return new CredentialResponse(cred.Id, cred.GmailAddress, cred.DisplayName,cred.SmtpHost, cred.SmtpPort, cred.CreatedAt);
    }

    public async Task DeleteAsync(Guid userId)
    {
        var cred = await _db.UserCredentials.FirstOrDefaultAsync(c => c.UserId == userId)
            ?? throw new InvalidOperationException("Credential not found.");
        _db.UserCredentials.Remove(cred);
        await _db.SaveChangesAsync();
    }

    public async Task TestConnectionAsync(Guid userId, string toEmail)
    {
        var cred = await _db.UserCredentials.FirstOrDefaultAsync(c => c.UserId == userId)
            ?? throw new InvalidOperationException("No credentials configured. Save your Gmail settings first.");

        var password = _encryption.Decrypt(cred.EncryptedAppPassword);

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(cred.DisplayName, cred.GmailAddress));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = "MailBridge – Connection Test";
        message.Body = new TextPart("html")
        {
            Text = "<h2>MailBridge is connected!</h2><p>Your Gmail credentials are working correctly.</p>"
        };

        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(cred.SmtpHost, cred.SmtpPort, SecureSocketOptions.StartTls);
        await smtp.AuthenticateAsync(cred.GmailAddress, password);
        await smtp.SendAsync(message);
        await smtp.DisconnectAsync(true);
    }
}
