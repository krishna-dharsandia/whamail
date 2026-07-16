using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Whamail.API.Models;

[Table("broadcasts")]
public class Broadcast
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("audience_id")]
    public Guid AudienceId { get; set; }

    [Column("template_id")]
    public Guid TemplateId { get; set; }

    [Column("name")]
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Column("subject_override")]
    [MaxLength(500)]
    public string? SubjectOverride { get; set; }

    [Column("channel")]
    [MaxLength(20)]
    public string Channel { get; set; } = "email"; // "email" or "whatsapp"

    // Draft | Sending | Completed | Failed
    [Column("status")]
    [MaxLength(50)]
    public string Status { get; set; } = "Draft";

    [Column("total_recipients")]
    public int TotalRecipients { get; set; } = 0;

    [Column("sent_count")]
    public int SentCount { get; set; } = 0;

    [Column("failed_count")]
    public int FailedCount { get; set; } = 0;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("sent_at")]
    public DateTime? SentAt { get; set; }

    [ForeignKey("UserId")]
    public AppUser? User { get; set; }

    [ForeignKey("AudienceId")]
    public Audience? Audience { get; set; }

    [ForeignKey("TemplateId")]
    public EmailTemplate? Template { get; set; }

    public ICollection<EmailQueue> Emails { get; set; } = new List<EmailQueue>();
}
