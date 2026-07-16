using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Whamail.API.Models;

[Table("whatsapp_sessions")]
public class WhatsAppSession
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("phone_number")]
    [MaxLength(50)]
    public string PhoneNumber { get; set; } = string.Empty;

    [Column("push_name")]
    [MaxLength(255)]
    public string PushName { get; set; } = string.Empty;

    [Column("platform")]
    [MaxLength(100)]
    public string? Platform { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("connected_at")]
    public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey("UserId")]
    public AppUser? User { get; set; }
}
