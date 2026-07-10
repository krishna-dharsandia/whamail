using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MailBridge.API.Models;

[Table("contacts")]
public class Contact
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("audience_id")]
    public Guid AudienceId { get; set; }

    [Column("email")]
    [MaxLength(255)]
    public string? Email { get; set; }

    [Column("phone_number")]
    [MaxLength(50)]
    public string? PhoneNumber { get; set; }

    [Column("name")]
    [MaxLength(255)]
    public string? Name { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey("AudienceId")]
    public Audience? Audience { get; set; }
}
