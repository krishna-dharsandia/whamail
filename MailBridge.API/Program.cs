using MailBridge.API.Data;
using MailBridge.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Load local secrets (gitignored) that override appsettings.json placeholders
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);

var rawConnectionString = builder.Configuration.GetConnectionString("Supabase")
                          ?? throw new InvalidOperationException(
                              "Connection string 'Supabase' is missing. Set it in Azure App Service → Configuration → Connection Strings.");

var csb = new NpgsqlConnectionStringBuilder(rawConnectionString);
csb.Timeout = 30;
var connectionString = csb.ConnectionString;
builder.Services.AddDbContext<MailBridgeDbContext>(options =>
    options.UseNpgsql(connectionString));

// ===== Supabase JWT Authentication (ES256 via JWKS) =====
var supabaseUrl = builder.Configuration["Supabase:Url"]
    ?? throw new InvalidOperationException("Supabase:Url is required in appsettings.json");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = supabaseUrl + "/auth/v1";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = supabaseUrl + "/auth/v1",
            ValidAudience = "authenticated",
            NameClaimType = "sub"
        };
    });
builder.Services.AddAuthorization();

// ===== Current User (for RLS) =====
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();

// ===== Services =====
builder.Services.AddSingleton<IEncryptionService, AesEncryptionService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ICredentialService, CredentialService>();
builder.Services.AddScoped<ITemplateService, TemplateService>();
builder.Services.AddScoped<IQueueService, QueueService>();
builder.Services.AddScoped<IAudienceService, AudienceService>();
builder.Services.AddScoped<IBroadcastService, BroadcastService>();
builder.Services.AddScoped<IMetricsService, MetricsService>();
builder.Services.AddScoped<IWhatsAppService, WhatsAppService>();

// ===== Background Worker =====
builder.Services.AddHostedService<EmailWorkerService>();

// ===== Controllers & Swagger =====
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "Supabase JWT token. Example: \"Bearer {token}\"",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// ===== CORS for Next.js frontend =====
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",
                "http://localhost:3001",
                "https://mail-mesh.vercel.app",
                "app://."
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

// ===== Database Migration =====
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MailBridgeDbContext>();
    await db.Database.MigrateAsync();
}

// ===== Middleware Pipeline =====
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
