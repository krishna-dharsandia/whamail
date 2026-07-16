using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whamail.API.Migrations
{
    /// <inheritdoc />
    public partial class types : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "attachment_file_ids",
                table: "email_templates",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "type",
                table: "audiences",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "user_files",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    original_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    stored_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    mime_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    size = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_files", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_files_profiles_user_id",
                        column: x => x.user_id,
                        principalTable: "profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_user_files_user_id",
                table: "user_files",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_files");

            migrationBuilder.DropColumn(
                name: "attachment_file_ids",
                table: "email_templates");

            migrationBuilder.DropColumn(
                name: "type",
                table: "audiences");
        }
    }
}
