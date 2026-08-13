import { type Kysely } from "kysely";

export async function up(database: Kysely<any>): Promise<void> {
  const creatorRoleId = "11111111-1111-4000-a000-000000000001";
  const studentRoleId = "22222222-2222-4000-a000-000000000002";

  // 1. Insert Roles
  await database
    .insertInto("roles")
    .values([
      {
        id: creatorRoleId,
        name: "creator",
        description: "LMS platform creator and administrator",
      },
      {
        id: studentRoleId,
        name: "student",
        description: "LMS platform student consumer",
      },
    ])
    .execute();
}

export async function down(database: Kysely<any>): Promise<void> {
  await database.deleteFrom("roles").execute();
}
