/**
 * Lower-case and trim every saved email, so "Femi@X.com" becomes "femi@x.com".
 * New accounts are already saved this way; this fixes accounts made before.
 *
 * Nothing is saved unless you pass --apply. Accounts whose cleaned email would
 * clash with another account (e.g. "Femi@x.com" and "femi@x.com") are listed
 * and left alone, so you can decide which one to keep.
 *
 *   node scripts/normalizeEmails.js            # preview only
 *   node scripts/normalizeEmails.js --apply    # save the changes
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");

// Connection string from server/.env
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
// Save changes only when --apply is passed
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!MONGO_URI) throw new Error("MONGO_URI is not set in server/.env");
  await mongoose.connect(MONGO_URI);

  // Raw documents: the model would lower-case the email when reading it back
  const users = await User.collection.find({}, { projection: { email: 1, pendingEmail: 1, name: 1 } }).toArray();

  // Accounts per cleaned email, to spot clashes
  const byClean = new Map();
  for (const u of users) {
    const clean = String(u.email || "").trim().toLowerCase();
    if (!byClean.has(clean)) byClean.set(clean, []);
    byClean.get(clean).push(u);
  }

  let changed = 0;
  const clashes = [];
  for (const [clean, group] of byClean) {
    // Two or more accounts would end up with the same email: report, skip
    if (group.length > 1) {
      clashes.push({ email: clean, accounts: group.map((u) => `${u.email} (${u.name}, id ${u._id})`) });
      continue;
    }
    const u = group[0];
    const cleanPending = u.pendingEmail ? String(u.pendingEmail).trim().toLowerCase() : u.pendingEmail;
    // Already clean
    if (u.email === clean && u.pendingEmail === cleanPending) continue;
    console.log(`${APPLY ? "Fixing" : "Would fix"}: "${u.email}" -> "${clean}"`);
    changed++;
    if (APPLY) {
      // Straight to the collection: the change is only letter case and spaces
      await User.collection.updateOne(
        { _id: u._id },
        { $set: { email: clean, ...(u.pendingEmail ? { pendingEmail: cleanPending } : {}) } }
      );
    }
  }

  console.log(`\n${users.length} accounts checked, ${changed} ${APPLY ? "fixed" : "to fix"}.`);
  if (clashes.length) {
    console.log(`\n${clashes.length} email(s) are used by more than one account (left unchanged):`);
    for (const c of clashes) console.log(`  ${c.email}:\n    ${c.accounts.join("\n    ")}`);
    console.log("Delete or merge the extra accounts in the admin panel, then run this again.");
  }
  if (!APPLY && changed) console.log("\nPreview only. Run again with --apply to save.");
}

main()
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
