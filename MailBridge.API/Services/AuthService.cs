using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Whamail.API.Data;
using Whamail.API.DTOs;
using Whamail.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Whamail.API.Services;

public interface IAuthService
{
    /// <summary>
    /// Ensures a profile exists for the Supabase-authenticated user.
    /// Called on first API request after Supabase login.
    /// </summary>
    Task<UserProfileDto> EnsureProfileAsync(Guid supabaseUserId, string email, string? fullName, string? avatarUrl, string authProvider);
    Task<UserProfileDto> GetProfileAsync(Guid userId);
}

public class AuthService : IAuthService
{
    private readonly MailBridgeDbContext _db;

    public AuthService(MailBridgeDbContext db)
    {
        _db = db;
    }

    public async Task<UserProfileDto> EnsureProfileAsync(Guid supabaseUserId, string email, string? fullName, string? avatarUrl, string authProvider)
    {
        // IgnoreQueryFilters because this query is on the Users table (no RLS filter there)
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == supabaseUserId);

        if (user == null)
        {
            user = new AppUser
            {
                Id = supabaseUserId,
                Email = email,
                FullName = fullName ?? email.Split('@')[0],
                AuthProvider = authProvider,
                AvatarUrl = avatarUrl,
                EmailVerified = authProvider == "google", // Google users are auto-verified
                Role = "normal",
                CreatedAt = DateTime.UtcNow
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
        }
        else
        {
            // Update fields that may have changed in Supabase
            if (!string.IsNullOrEmpty(fullName) && user.FullName != fullName)
                user.FullName = fullName;
            if (!string.IsNullOrEmpty(avatarUrl) && user.AvatarUrl != avatarUrl)
                user.AvatarUrl = avatarUrl;
            if (authProvider == "google" && !user.EmailVerified)
                user.EmailVerified = true;
            await _db.SaveChangesAsync();
        }

        var limit = user.Role == "workspace" ? 5000 : 500;
        return new UserProfileDto(user.Id, user.Email, user.FullName, user.Role, user.EmailsSent, user.MessagesSent, limit, user.EmailVerified, user.AvatarUrl, user.AuthProvider);
    }

    public async Task<UserProfileDto> GetProfileAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null)
            throw new InvalidOperationException("User not found.");

        var limit = user.Role == "workspace" ? 5000 : 500;
        return new UserProfileDto(user.Id, user.Email, user.FullName, user.Role, user.EmailsSent, user.MessagesSent, limit, user.EmailVerified, user.AvatarUrl, user.AuthProvider);
    }
}
