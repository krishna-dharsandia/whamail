using Microsoft.EntityFrameworkCore;
using Whamail.API.Models;
using Whamail.API.Services;

namespace Whamail.API.Data;

public class MailBridgeDbContext : DbContext
{
    private readonly Guid? _currentUserId;

    public MailBridgeDbContext(DbContextOptions<MailBridgeDbContext> options, ICurrentUserService currentUserService)
        : base(options)
    {
        _currentUserId = currentUserService.UserId;
    }

    public DbSet<AppUser> Users { get; set; }
    public DbSet<UserCredential> UserCredentials { get; set; }
    public DbSet<EmailTemplate> EmailTemplates { get; set; }
    public DbSet<EmailQueue> EmailQueues { get; set; }
    public DbSet<Audience> Audiences { get; set; }
    public DbSet<Contact> Contacts { get; set; }
    public DbSet<Broadcast> Broadcasts { get; set; }
    public DbSet<WhatsAppSession> WhatsAppSessions { get; set; }
    public DbSet<UserFile> UserFiles { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ===== AppUser Relationships =====
        modelBuilder.Entity<AppUser>(e =>
        {
            e.HasOne(u => u.Credential)
             .WithOne(c => c.User)
             .HasForeignKey<UserCredential>(c => c.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(u => u.WhatsAppSession)
             .WithOne(s => s.User)
             .HasForeignKey<WhatsAppSession>(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(u => u.Templates)
             .WithOne(t => t.User)
             .HasForeignKey(t => t.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(u => u.QueuedEmails)
             .WithOne(q => q.User)
             .HasForeignKey(q => q.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(u => u.Audiences)
             .WithOne(a => a.User)
             .HasForeignKey(a => a.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(u => u.Broadcasts)
             .WithOne(b => b.User)
             .HasForeignKey(b => b.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(u => u.Files)
             .WithOne(f => f.User)
             .HasForeignKey(f => f.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(u => u.Email).IsUnique();
            e.HasIndex(u => u.GoogleId);
        });

        // ===== Audience → Contacts =====
        modelBuilder.Entity<Audience>(e =>
        {
            e.HasMany(a => a.Contacts)
             .WithOne(c => c.Audience)
             .HasForeignKey(c => c.AudienceId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(a => a.Broadcasts)
             .WithOne(b => b.Audience)
             .HasForeignKey(b => b.AudienceId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== Broadcast Relationships =====
        modelBuilder.Entity<Broadcast>(e =>
        {
            e.HasMany(b => b.Emails)
             .WithOne(q => q.Broadcast)
             .HasForeignKey(q => q.BroadcastId)
             .OnDelete(DeleteBehavior.SetNull);

            e.HasOne(b => b.Template)
             .WithMany()
             .HasForeignKey(b => b.TemplateId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== EmailTemplate Relationships =====
        modelBuilder.Entity<EmailTemplate>(e =>
        {
            e.HasMany(t => t.QueuedEmails)
             .WithOne(q => q.Template)
             .HasForeignKey(q => q.TemplateId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        // ===== Indexes =====
        modelBuilder.Entity<EmailQueue>()
            .HasIndex(q => q.Status);

        modelBuilder.Entity<EmailQueue>()
            .HasIndex(q => new { q.UserId, q.Status });

        modelBuilder.Entity<EmailQueue>()
            .HasIndex(q => q.BroadcastId);

        modelBuilder.Entity<UserCredential>()
            .HasIndex(c => c.UserId)
            .IsUnique();

        modelBuilder.Entity<Contact>()
            .HasIndex(c => c.AudienceId);

        modelBuilder.Entity<Contact>()
            .HasIndex(c => new { c.AudienceId, c.Email })
            .IsUnique()
            .HasFilter(null); // Allow null emails for WhatsApp contacts

        modelBuilder.Entity<Contact>()
            .HasIndex(c => new { c.AudienceId, c.PhoneNumber })
            .IsUnique()
            .HasFilter(null); // Allow null phone numbers for email contacts

        modelBuilder.Entity<Broadcast>()
            .HasIndex(b => b.UserId);

        modelBuilder.Entity<WhatsAppSession>()
            .HasIndex(s => s.UserId)
            .IsUnique();

        // ===== ROW-LEVEL SECURITY: Global Query Filters =====
        modelBuilder.Entity<UserCredential>()
            .HasQueryFilter(c => _currentUserId == null || c.UserId == _currentUserId);

        modelBuilder.Entity<WhatsAppSession>()
            .HasQueryFilter(s => _currentUserId == null || s.UserId == _currentUserId);

        modelBuilder.Entity<EmailTemplate>()
            .HasQueryFilter(t => _currentUserId == null || t.UserId == _currentUserId);

        modelBuilder.Entity<EmailQueue>()
            .HasQueryFilter(q => _currentUserId == null || q.UserId == _currentUserId);

        modelBuilder.Entity<Audience>()
            .HasQueryFilter(a => _currentUserId == null || a.UserId == _currentUserId);

        modelBuilder.Entity<Broadcast>()
            .HasQueryFilter(b => _currentUserId == null || b.UserId == _currentUserId);

        modelBuilder.Entity<UserFile>()
            .HasQueryFilter(f => _currentUserId == null || f.UserId == _currentUserId);

        modelBuilder.Entity<UserFile>()
            .HasIndex(f => f.UserId);
    }
}
