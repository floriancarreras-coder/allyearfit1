const SYSTEME_API_KEY = process.env.SYSTEME_IO_API_KEY;
const SYSTEME_BASE = "https://api.systeme.io/api";
const TAG_ID = process.env.SYSTEME_IO_TAG_ID; // ID numérique du tag paye-allyearfit
async function trouverOuCreerContact(email, prenom) {
const creation = await fetch(`${SYSTEME_BASE}/contacts`, {
method: "POST",
headers: { "Content-Type": "application/json", "X-API-Key": SYSTEME_API_KEY },
body: JSON.stringify({
email,
fields: prenom ? [{ slug: "first_name", value: prenom }] : [],
}),
});
if (creation.status === 201) return creation.json();
if (creation.status === 422) {
// Contact déjà existant : on le retrouve par e-mail
const recherche = await fetch(
`${SYSTEME_BASE}/contacts?email=${encodeURIComponent(email)}`,
{ headers: { "X-API-Key": SYSTEME_API_KEY } }
);
if (!recherche.ok) {
throw new Error(`Recherche contact Systeme.io échouée : ${recherche.status}`);
}
const data = await recherche.json();
const contact = data.items?.[0];
if (!contact) throw new Error("Contact introuvable après conflit 422 : " + email);
return contact;
}
async function donnerAccesFormation(email, prenom) {
const contact = await trouverOuCreerContact(email, prenom);
const assignationTag = await fetch(
`${SYSTEME_BASE}/contacts/${contact.id}/tags`,
{
method: "POST",
headers: { "Content-Type": "application/json", "X-API-Key": SYSTEME_API_KEY },
body: JSON.stringify({ tagId: Number(TAG_ID) }),
}
);
if (!assignationTag.ok) {
throw new Error(`Assignation du tag échouée (contact ${contact.id}) : ${assignationTag.st
atus}`);
}
}