# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore dependencies (layer cached unless .csproj changes)
COPY MailBridge.API.csproj ./
RUN dotnet restore

# Copy remaining source and publish
COPY . ./
RUN dotnet publish -c Release -o /app/publish --no-restore

# Stage 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Run as non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Copy published output
COPY --from=build /app/publish .

# Give ownership to the app user
RUN chown -R appuser:appgroup /app
USER appuser

# ASP.NET Core listens on 8080 by default in containers
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

# Health check — adjust path if you add a /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "MailBridge.API.dll"]
