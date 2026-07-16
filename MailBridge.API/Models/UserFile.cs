using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Whamail.API.Models;

[Table("user_files")]
public class UserFile
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("original_name")]
    [Required]
    [MaxLength(255)]
    public string OriginalName { get; set; } = string.Empty;

    [Column("stored_name")]
    [Required]
    [MaxLength(255)]
    public string StoredName { get; set; } = string.Empty;

    [Column("mime_type")]
    [MaxLength(100)]
    public string MimeType { get; set; } = "application/octet-stream";

    [Column("size")]
    public long Size { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey("UserId")]
    public AppUser? User { get; set; }
}
