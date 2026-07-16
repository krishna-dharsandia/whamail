using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Whamail.API.Models;

[Table("profiles")]
public class AppUser
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("email")]
    [Required]
    [MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [Column("full_name")]
    [MaxLength(255)]
    public string FullName { get; set; } = string.Empty;

    [Column("password_hash")]
    [MaxLength(512)]
    public string? PasswordHash { get; set; }

    [Column("auth_provider")]
    [MaxLength(50)]
    public string AuthProvider { get; set; } = "email"; // "email" or "google"

    [Column("google_id")]
    [MaxLength(255)]
    public string? GoogleId { get; set; }

    [Column("avatar_url")]
    [MaxLength(500)]
    public string? AvatarUrl { get; set; }

    [Column("email_verified")]
    public bool EmailVerified { get; set; } = false;

    [Column("email_verification_token")]
    [MaxLength(255)]
    public string? EmailVerificationToken { get; set; }

    [Column("email_verification_expires")]
    public DateTime? EmailVerificationExpires { get; set; }

    [Column("role")]
    [MaxLength(50)]
    public string Role { get; set; } = "normal"; // "normal" or "workspace"

    [Column("emails_sent")]
    public int EmailsSent { get; set; } = 0;

    [Column("messages_sent")]
    public int MessagesSent { get; set; } = 0;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public UserCredential? Credential { get; set; }
    public WhatsAppSession? WhatsAppSession { get; set; }
    public ICollection<EmailTemplate> Templates { get; set; } = new List<EmailTemplate>();
    public ICollection<EmailQueue> QueuedEmails { get; set; } = new List<EmailQueue>();
    public ICollection<Audience> Audiences { get; set; } = new List<Audience>();
    public ICollection<Broadcast> Broadcasts { get; set; } = new List<Broadcast>();
    public ICollection<UserFile> Files { get; set; } = new List<UserFile>();
}
