import argon2 from 'argon2';

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: tsx src/auth/cli/hash-password.ts <password>');
  process.exit(1);
}

const hash = await argon2.hash(pw, {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 65536,
  parallelism: 4,
});
console.log(hash);
