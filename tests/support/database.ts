// Never inherit the running application's database: root-level notices and
// housekeeping can affect rows that aren't owned by the test fixture.
const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/bedrock_test"
if (!new URL(url).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must name a dedicated *_test database")
}
process.env.DATABASE_URL = url
