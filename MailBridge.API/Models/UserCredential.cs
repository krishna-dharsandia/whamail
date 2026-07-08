using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MailBridge.API.Models;

[Table("user_credentials")]
public class UserCredential
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("gmail_address")]
    [Required]
    [MaxLength(255)]
    public string GmailAddress { get; set; } = string.Empty;

    [Column("encrypted_app_password")]
    [Required]
    public string EncryptedAppPassword { get; set; } = string.Empty;

    [Column("smtp_host")]
    [MaxLength(255)]
    public string SmtpHost { get; set; } = "smtp.gmail.com";
    
    [Column("display_name")]
    [MaxLength(255)]
    public string DisplayName { get; set; } = "inbox";

    [Column("smtp_port")]
    public int SmtpPort { get; set; } = 587;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("UserId")]
    public AppUser? User { get; set; }
}
