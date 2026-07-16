using System.Text.Json;
using MailKit.Net.Smtp;
using MailKit.Security;
using Whamail.API.Data;
using Whamail.API.Models;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace Whamail.API.Services;

public class EmailWorkerService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<EmailWorkerService> _logger;
    private readonly TimeSpan _pollingInterval = TimeSpan.FromSeconds(5);

    public EmailWorkerService(IServiceProvider serviceProvider, ILogger<EmailWorkerService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("EmailWorkerService started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessPendingEmailsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in email worker loop.");
            }

            await Task.Delay(_pollingInterval, stoppingToken);
        }

        _logger.LogInformation("EmailWorkerService stopped.");
    }

    private async Task ProcessPendingEmailsAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MailBridgeDbContext>();
        var encryption = scope.ServiceProvider.GetRequiredService<IEncryptionService>();
        var fileService = scope.ServiceProvider.GetRequiredService<IFileService>();

        // Get batch of pending emails (up to 20 at a time) - skip WhatsApp items
        var pendingEmails = await db.EmailQueues
            .Where(q => q.Status == nameof(EmailStatus.Pending) && q.Channel == "email")
            .OrderBy(q => q.CreatedAt)
            .Take(20)
            .ToListAsync(ct);

        if (pendingEmails.Count == 0) return;

        _logger.LogInformation("Processing {Count} pending emails.", pendingEmails.Count);

        // Mark as sending
        foreach (var email in pendingEmails)
            email.Status = nameof(EmailStatus.Sending);
        await db.SaveChangesAsync(ct);

        // Group by userId to reuse SMTP connections per user
        var grouped = pendingEmails.GroupBy(e => e.UserId);

        foreach (var group in grouped)
        {
            var userId = group.Key;
            var credential = await db.UserCredentials.FirstOrDefaultAsync(c => c.UserId == userId, ct);

            if (credential == null)
            {
                _logger.LogWarning("No credentials found for user {UserId}. Marking emails as failed.", userId);
                foreach (var email in group)
                {
                    email.Status = nameof(EmailStatus.Failed);
                    email.ErrorInfo = "No Gmail credentials configured.";
                }
                await db.SaveChangesAsync(ct);
                continue;
            }

            string decryptedPassword;
            try
            {
                decryptedPassword = encryption.Decrypt(credential.EncryptedAppPassword);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to decrypt password for user {UserId}.", userId);
                foreach (var email in group)
                {
                    email.Status = nameof(EmailStatus.Failed);
                    email.ErrorInfo = "Failed to decrypt credentials.";
                }
                await db.SaveChangesAsync(ct);
                continue;
            }

            using var smtpClient = new SmtpClient();
            try
            {
                await smtpClient.ConnectAsync(credential.SmtpHost, credential.SmtpPort, SecureSocketOptions.StartTls, ct);
                await smtpClient.AuthenticateAsync(credential.GmailAddress, decryptedPassword, ct);

                // Pre-load attachment files for templates used in this group
                var templateIds = group
                    .Where(e => e.TemplateId != null)
                    .Select(e => e.TemplateId!.Value)
                    .Distinct()
                    .ToList();
                var templates = templateIds.Count > 0
                    ? await db.EmailTemplates
                        .Where(t => templateIds.Contains(t.Id))
                        .ToDictionaryAsync(t => t.Id, ct)
                    : new Dictionary<Guid, EmailTemplate>();

                var fileStoragePath = fileService.GetStoragePath();

                foreach (var email in group)
                {
                    try
                    {
                        var message = new MimeMessage();
                        message.From.Add(new MailboxAddress(credential.DisplayName, credential.GmailAddress));
                        message.To.Add(MailboxAddress.Parse(email.Recipient));
                        message.Subject = email.Subject;

                        var bodyBuilder = new BodyBuilder { HtmlBody = email.Body };

                        // Add attachments from template
                        if (email.TemplateId != null && templates.TryGetValue(email.TemplateId.Value, out var tmpl) && !string.IsNullOrEmpty(tmpl.AttachmentFileIds))
                        {
                            try
                            {
                                var fileIds = JsonSerializer.Deserialize<List<Guid>>(tmpl.AttachmentFileIds);
                                if (fileIds != null)
                                {
                                    var files = await fileService.GetByIdsAsync(fileIds);
                                    foreach (var file in files)
                                    {
                                        var filePath = Path.Combine(fileStoragePath, file.StoredName);
                                        if (File.Exists(filePath))
                                        {
                                            bodyBuilder.Attachments.Add(file.OriginalName, await File.ReadAllBytesAsync(filePath, ct));
                                        }
                                    }
                                }
                            }
                            catch { /* non-fatal: skip attachments on parse error */ }
                        }

                        message.Body = bodyBuilder.ToMessageBody();

                        await smtpClient.SendAsync(message, ct);

                        email.Status = nameof(EmailStatus.Sent);
                        email.SentAt = DateTime.UtcNow;
                        _logger.LogInformation("Email sent to {Recipient}.", email.Recipient);
                    }
                    catch (Exception ex)
                    {
                        email.Status = nameof(EmailStatus.Failed);
                        email.ErrorInfo = ex.Message;
                        _logger.LogError(ex, "Failed to send email to {Recipient}.", email.Recipient);
                    }
                }

                await smtpClient.DisconnectAsync(true, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SMTP connection failed for user {UserId}.", userId);
                foreach (var email in group)
                {
                    if (email.Status == nameof(EmailStatus.Sending))
                    {
                        email.Status = nameof(EmailStatus.Failed);
                        email.ErrorInfo = $"SMTP connection error: {ex.Message}";
                    }
                }
            }

            // Update user's emails_sent count
            var user = await db.Users.FindAsync(new object[] { userId }, ct);
            if (user != null)
            {
                user.EmailsSent += group.Count(e => e.Status == nameof(EmailStatus.Sent));
            }

            await db.SaveChangesAsync(ct);
        }
    }
}
