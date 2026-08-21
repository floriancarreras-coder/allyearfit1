const sessionsTraitees = new Set(); // idempotence simple en mémoire
// ® en production, remplacez par une table (Postgres/Redis) qui survit aux redéploiements
app.post(
"/webhook/stripe",
express.raw({ type: "application/json" }),
async (req, res) => {
const sig = req.headers["stripe-signature"];
let event;
try {
event = stripe.webhooks.constructEvent(
req.body,
sig,
process.env.STRIPE_WEBHOOK_SECRET
);
} catch (err) {
console.error("Signature webhook invalide :", err.message);
return res.status(400).send(`Webhook Error: ${err.message}`);
}
// Réponse rapide 200 : Stripe considère l'événement comme livré
res.status(200).json({ received: true });
if (event.type === "checkout.session.completed") {
const session = event.data.object;
if (sessionsTraitees.has(session.id)) return; // déjà traité, on ignore
sessionsTraitees.add(session.id);
try {
await handlePaiementReussi(session);
} catch (err) {
console.error("Erreur post-paiement :", err);
sessionsTraitees.delete(session.id); // permet une nouvelle tentative
}
}
}
);
async function handlePaiementReussi(session) {
const email = session.customer_details?.email || session.customer_email;
const prenom = session.metadata?.prenom || session.customer_details?.name?.split(" ")[0] ||
"";
const nom = session.metadata?.nom || "";
if (!email) throw new Error("Pas d'email dans la session Stripe " + session.id);
await Promise.all([
envoyerEmailBienvenue(email, prenom),
donnerAccesFormation(email, prenom, nom),
]);
}