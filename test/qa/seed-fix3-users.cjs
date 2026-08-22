/**
 * QA FIX-3 — seed user test (preseden kondisi, aturan #5) via Prisma,
 * lalu login via API utk dapat token (tidak memanggil SMS provider asli).
 */
const { PrismaClient, UserRole } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const USERS = [
  { key: 'a', full_name: 'Citizen Alpha FIX3', email: 'qa.alpha.fix3@test.laporkita.id', phone: '+6281110000101', pass: 'AlphaPass123', role: UserRole.citizen, agency: null },
  { key: 'b', full_name: 'Citizen Bravo FIX3', email: 'qa.bravo.fix3@test.laporkita.id', phone: '+6281110000102', pass: 'BravoPass123', role: UserRole.citizen, agency: null },
  { key: 'op', full_name: 'Ops Charlie FIX3', email: 'qa.ops.fix3@test.laporkita.id', phone: '+6281110000103', pass: 'OpsPass123', role: UserRole.operator, agency: 'a1000000-0000-4000-8000-000000000001' },
  { key: 'pm', full_name: 'Poli Delta FIX3', email: 'qa.poli.fix3@test.laporkita.id', phone: '+6281110000104', pass: 'PoliPass123', role: UserRole.policy_maker, agency: null },
];

async function main() {
  const out = {};
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.pass, 10);
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    const user = existing
      ? await prisma.user.update({ where: { email: u.email }, data: { is_active: true, phone_verified_at: new Date(), role: u.role, agency_id: u.agency, password_hash: hash } })
      : await prisma.user.create({
          data: {
            full_name: u.full_name, email: u.email, phone_number: u.phone,
            password_hash: hash, role: u.role, agency_id: u.agency,
            is_active: true, phone_verified_at: new Date(),
          },
        });
    out[u.key] = { id: user.id, email: u.email, pass: u.pass };
    console.log(`${u.key}: ${user.email} (${user.role}) id=${user.id}`);
  }
  require('fs').writeFileSync('/tmp/fix3_users.json', JSON.stringify(out));
  await prisma.$disconnect();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
