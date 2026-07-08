using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MailBridge.API.Migrations
{
    /// <inheritdoc />
    public partial class audiences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "broadcast_id",
                table: "email_queue",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "audiences",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audiences", x => x.id);
                    table.ForeignKey(
                        name: "FK_audiences_profiles_user_id",
                        column: x => x.user_id,
                        principalTable: "profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "broadcasts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    audience_id = table.Column<Guid>(type: "uuid", nullable: false),
                    template_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    subject_override = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    total_recipients = table.Column<int>(type: "integer", nullable: false),
                    sent_count = table.Column<int>(type: "integer", nullable: false),
                    failed_count = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_broadcasts", x => x.id);
                    table.ForeignKey(
                        name: "FK_broadcasts_audiences_audience_id",
                        column: x => x.audience_id,
                        principalTable: "audiences",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_broadcasts_email_templates_template_id",
                        column: x => x.template_id,
                        principalTable: "email_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_broadcasts_profiles_user_id",
                        column: x => x.user_id,
                        principalTable: "profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "contacts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    audience_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_contacts", x => x.id);
                    table.ForeignKey(
                        name: "FK_contacts_audiences_audience_id",
                        column: x => x.audience_id,
                        principalTable: "audiences",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_email_queue_broadcast_id",
                table: "email_queue",
                column: "broadcast_id");

            migrationBuilder.CreateIndex(
                name: "IX_audiences_user_id",
                table: "audiences",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_broadcasts_audience_id",
                table: "broadcasts",
                column: "audience_id");

            migrationBuilder.CreateIndex(
                name: "IX_broadcasts_template_id",
                table: "broadcasts",
                column: "template_id");

            migrationBuilder.CreateIndex(
                name: "IX_broadcasts_user_id",
                table: "broadcasts",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_contacts_audience_id",
                table: "contacts",
                column: "audience_id");

            migrationBuilder.CreateIndex(
                name: "IX_contacts_audience_id_email",
                table: "contacts",
                columns: new[] { "audience_id", "email" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_email_queue_broadcasts_broadcast_id",
                table: "email_queue",
                column: "broadcast_id",
                principalTable: "broadcasts",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_email_queue_broadcasts_broadcast_id",
                table: "email_queue");

            migrationBuilder.DropTable(
                name: "broadcasts");

            migrationBuilder.DropTable(
                name: "contacts");

            migrationBuilder.DropTable(
                name: "audiences");

            migrationBuilder.DropIndex(
                name: "IX_email_queue_broadcast_id",
                table: "email_queue");

            migrationBuilder.DropColumn(
                name: "broadcast_id",
                table: "email_queue");
        }
    }
}
