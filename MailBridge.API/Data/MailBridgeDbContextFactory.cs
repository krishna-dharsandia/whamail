using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Whamail.API.Services;

namespace Whamail.API.Data;

public sealed class MailBridgeDbContextFactory : IDesignTimeDbContextFactory<MailBridgeDbContext>
{
    public MailBridgeDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Local.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var rawConnectionString = configuration.GetConnectionString("Supabase")
            ?? throw new InvalidOperationException("Connection string 'Supabase' is missing.");

        var connectionString = new NpgsqlConnectionStringBuilder(rawConnectionString)
        {
            Timeout = 30
        }.ConnectionString;

        var optionsBuilder = new DbContextOptionsBuilder<MailBridgeDbContext>();
        optionsBuilder.UseNpgsql(connectionString);

        return new MailBridgeDbContext(optionsBuilder.Options, new DesignTimeCurrentUserService());
    }

    private sealed class DesignTimeCurrentUserService : ICurrentUserService
    {
        public Guid? UserId => null;
    }
}
