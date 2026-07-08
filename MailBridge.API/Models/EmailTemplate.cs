using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MailBridge.API.Models;

[Table("email_templates")]
public class EmailTemplate
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("name")]
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Column("subject_template")]
    [Required]
    [MaxLength(500)]
    public string SubjectTemplate { get; set; } = string.Empty;

    [Column("body_template")]
    [Required]
    public string BodyTemplate { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("UserId")]
    public AppUser? User { get; set; }
    public ICollection<EmailQueue> QueuedEmails { get; set; } = new List<EmailQueue>();
}
