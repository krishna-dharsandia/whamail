namespace MailBridge.API.DTOs;

// ===== Auth / User =====
public record SyncProfileRequest(string? FullName, string? AvatarUrl, string AuthProvider = "email");
public record UserProfileDto(Guid Id, string Email, string FullName, string Role, int EmailsSent, int MessagesSent, int EmailLimit, bool EmailVerified, string? AvatarUrl, string AuthProvider);

// ===== Credentials =====
public record SaveCredentialRequest(string GmailAddress, string AppPassword, string DisplayName,string SmtpHost = "smtp.gmail.com", int SmtpPort = 587);
public record CredentialResponse(Guid Id, string GmailAddress,string DisplayName, string SmtpHost, int SmtpPort, DateTime CreatedAt);
public record TestEmailRequest(string ToEmail);

// ===== WhatsApp =====
public record WhatsAppStatusDto(string Status, string? Detail, string? PhoneNumber, string? PushName, string? Platform, DateTime? ConnectedAt);
public record WhatsAppSessionDto(Guid Id, string PhoneNumber, string PushName, string? Platform, bool IsActive, DateTime ConnectedAt);
public record ConnectWhatsAppRequest(string? PhoneNumber, string? PushName, string? Platform);
public record WhatsAppSendMessageRequest(string Phone, string Message);
public record WhatsAppSendBatchRequest(List<WhatsAppSendMessageRequest> Messages);

// ===== Email Templates =====
public record CreateTemplateRequest(string Name, string SubjectTemplate, string BodyTemplate);
public record UpdateTemplateRequest(string Name, string SubjectTemplate, string BodyTemplate);
public record TemplateResponse(Guid Id, string Name, string SubjectTemplate, string BodyTemplate, DateTime CreatedAt, DateTime UpdatedAt);

// ===== Message Templates (WhatsApp) =====
public record CreateMessageTemplateRequest(string Name, string BodyTemplate);
public record UpdateMessageTemplateRequest(string Name, string BodyTemplate);

// ===== Email Queue =====
public record QueueEmailRequest(string Recipient, Guid? TemplateId, string? Subject, string? Body, Dictionary<string, string>? MergeData, string? PhoneNumber = null, string Channel = "email");
public record QueueBatchRequest(List<QueueEmailRequest> Emails);
public record QueueItemResponse(Guid Id, string Recipient, string? PhoneNumber, string Channel, string Subject, string Status, string? ErrorInfo, DateTime CreatedAt, DateTime? SentAt, Guid? BroadcastId);
public record QueueStatsResponse(int Total, int Pending, int Sent, int Failed, int Sending);

// ===== Audiences =====
public record CreateAudienceRequest(string Name);
public record AudienceResponse(Guid Id, string Name, int ContactCount, DateTime CreatedAt);
public record ContactResponse(Guid Id, string? Email, string? PhoneNumber, string? Name, DateTime CreatedAt);
public record AddContactRequest(string? Email, string? PhoneNumber, string? Name);

// ===== Broadcasts =====
public record CreateBroadcastRequest(string Name, Guid AudienceId, Guid TemplateId, string? SubjectOverride, string Channel = "email");
public record BroadcastResponse(
    Guid Id, string Name, string Status, string Channel,
    Guid AudienceId, string AudienceName,
    Guid TemplateId, string TemplateName,
    string? SubjectOverride,
    int TotalRecipients, int SentCount, int FailedCount,
    DateTime CreatedAt, DateTime? SentAt);

public record BroadcastContactDto(
    string? Email, string? PhoneNumber, string? Name,
    string? QueueStatus,
    DateTime? SentAt);

public record BroadcastDetailResponse(
    BroadcastResponse Broadcast,
    List<BroadcastContactDto> Contacts,
    int InvalidCount,
    int NotQueuedCount);

// ===== Metrics =====
public record MetricsOverviewResponse(
    int SentToday, int SentThisMonth, int SentAllTime,
    int MessagesToday, int MessagesThisMonth, int MessagesAllTime,
    int TotalAudiences, int TotalContacts,
    int TotalBroadcasts, int ActiveBroadcasts,
    int PendingEmails, int FailedEmails,
    int PendingMessages, int FailedMessages);

public record DailyEmailStat(string Date, int Count);
public record MonthlyEmailStat(string Month, int Count);
public record BroadcastStatusStat(string Status, int Count);
