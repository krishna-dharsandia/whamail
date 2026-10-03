using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whamail.API.Migrations
{
    /// <inheritdoc />
    public partial class AddTemplateChannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "channel",
                table: "email_templates",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "email");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "channel",
                table: "email_templates");
        }
    }
}
