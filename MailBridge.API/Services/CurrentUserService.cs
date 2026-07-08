using System.Security.Claims;

namespace MailBridge.API.Services;

/// <summary>
/// Provides the current authenticated user's ID to the DbContext for RLS global query filters.
/// </summary>
public interface ICurrentUserService
{
    Guid? UserId { get; }
}

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? UserId
    {
        get
        {
            var claim = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return claim != null ? Guid.Parse(claim) : null;
        }
    }
}
