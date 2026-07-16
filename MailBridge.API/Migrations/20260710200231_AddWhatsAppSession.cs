using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whamail.API.Migrations
{
    /// <inheritdoc />
    public partial class AddWhatsAppSession : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "messages_sent",
                table: "profiles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "channel",
                table: "email_queue",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "media_url",
                table: "email_queue",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phone_number",
                table: "email_queue",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "email",
                table: "contacts",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(255)",
                oldMaxLength: 255);

            migrationBuilder.AddColumn<string>(
                name: "phone_number",
                table: "contacts",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "channel",
                table: "broadcasts",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "whatsapp_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    phone_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    push_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    platform = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    connected_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_whatsapp_sessions", x => x.id);
                    table.ForeignKey(
                        name: "FK_whatsapp_sessions_profiles_user_id",
                        column: x => x.user_id,
                        principalTable: "profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_contacts_audience_id_phone_number",
                table: "contacts",
                columns: new[] { "audience_id", "phone_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_whatsapp_sessions_user_id",
                table: "whatsapp_sessions",
                column: "user_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "whatsapp_sessions");

            migrationBuilder.DropIndex(
                name: "IX_contacts_audience_id_phone_number",
                table: "contacts");

            migrationBuilder.DropColumn(
                name: "messages_sent",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "channel",
                table: "email_queue");

            migrationBuilder.DropColumn(
                name: "media_url",
                table: "email_queue");

            migrationBuilder.DropColumn(
                name: "phone_number",
                table: "email_queue");

            migrationBuilder.DropColumn(
                name: "phone_number",
                table: "contacts");

            migrationBuilder.DropColumn(
                name: "channel",
                table: "broadcasts");

            migrationBuilder.AlterColumn<string>(
                name: "email",
                table: "contacts",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(255)",
                oldMaxLength: 255,
                oldNullable: true);
        }
    }
}
