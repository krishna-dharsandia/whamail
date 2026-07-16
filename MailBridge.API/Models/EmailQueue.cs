using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Whamail.API.Models;

public enum EmailStatus
{
    Pending,
    Sending,
    Sent,
    Failed
}

[Table("email_queue")]
public class EmailQueue
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("template_id")]
    public Guid? TemplateId { get; set; }

    [Column("recipient")]
    [MaxLength(255)]
    public string Recipient { get; set; } = string.Empty;

    [Column("phone_number")]
    [MaxLength(50)]
    public string? PhoneNumber { get; set; }

    [Column("channel")]
    [MaxLength(20)]
    public string Channel { get; set; } = "email"; // "email" or "whatsapp"

    [Column("subject")]
    [MaxLength(500)]
    public string Subject { get; set; } = string.Empty;

    [Column("body")]
    public string Body { get; set; } = string.Empty;

    [Column("media_url")]
    [MaxLength(500)]
    public string? MediaUrl { get; set; }

    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = nameof(EmailStatus.Pending);

    [Column("error_info")]
    public string? ErrorInfo { get; set; }

    [Column("merge_data")]
    public string? MergeData { get; set; } // JSON string of key-value pairs for template variables

    [Column("scheduled_at")]
    public DateTime? ScheduledAt { get; set; }

    [Column("sent_at")]
    public DateTime? SentAt { get; set; }

    [Column("broadcast_id")]
    public Guid? BroadcastId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("UserId")]
    public AppUser? User { get; set; }

    [ForeignKey("TemplateId")]
    public EmailTemplate? Template { get; set; }

    [ForeignKey("BroadcastId")]
    public Broadcast? Broadcast { get; set; }
}
